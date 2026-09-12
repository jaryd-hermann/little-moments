/**
 * Movie unlock detection + the "you've just unlocked a movie" push.
 *
 * Movies are assembled on-device (lib/mashupBuckets.ts) rather than generated
 * server-side, so there's no generation event to hang a notification on. This
 * module recomputes the same buckets from the database, records each one that
 * crosses its threshold in `movie_unlocks`, and pushes at most one of them.
 *
 * Thresholds MUST match lib/mashupBuckets.ts — if the server pushes "you've
 * unlocked a movie" and the app disagrees, the user taps into an empty shelf.
 *
 * Counting rule: only moments that carry media count, because a moment with no
 * photo or video produces no clips. Ten text-only moments would otherwise
 * unlock a movie with nothing in it.
 */
import { dispatch } from "./dispatch.ts";
import { weekOfMonthLabel } from "./chapters.ts";
import { THEME_LABEL, type Theme } from "./graph-palette.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type MovieUnlockKind = "week" | "month" | "year" | "person" | "theme";

export const MIN_MOMENTS_FOR_MOVIE: Record<MovieUnlockKind, number> = {
  week: 3,
  month: 10,
  year: 15,
  person: 10,
  theme: 10,
};

/**
 * Which unlock to announce when a single save crosses several thresholds at
 * once. A movie about a person beats a movie about a stretch of calendar —
 * it's the more surprising, more personal artifact.
 */
const NOTIFY_PRIORITY: MovieUnlockKind[] = [
  "person",
  "theme",
  "week",
  "month",
  "year",
];

/**
 * Belt-and-braces cap. Detection runs from two entry points (a save, and the
 * metadata extraction that follows it), so this guarantees a burst of unlocks
 * can never turn into a burst of pushes. ~30 minutes.
 */
const PUSH_FREQ_CAP_DAYS = 0.021;

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

interface CandidateBucket {
  kind: MovieUnlockKind;
  bucketKey: string;
  label: string;
  momentCount: number;
}

interface MomentRow {
  id: string;
  entry_date: string | null;
  entry_media: { id: string }[] | null;
  entry_metadata:
    | { people: string[] | null; primary_theme: string | null }
    | { people: string[] | null; primary_theme: string | null }[]
    | null;
}

/** Same normalization as canonicalize-people and lib/canonicalPeople.ts. */
function normalizeAlias(raw: string): string {
  return raw
    .trim()
    .replace(/^(my|the|our|a|an)\s+/i, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function parseYmd(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/**
 * Monday opening the week containing this date, as YYYY-MM-DD. Computed in UTC
 * off the calendar parts so a server in any region buckets a given
 * `entry_date` the same way the device does.
 */
function mondayKey(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

function firstEntryMetadata(row: MomentRow) {
  const meta = row.entry_metadata;
  if (!meta) return null;
  return Array.isArray(meta) ? (meta[0] ?? null) : meta;
}

/**
 * Every moment the user has, with just enough of each to bucket it.
 *
 * Paged because PostgREST caps a response at 1000 rows — silently truncating a
 * long-standing user's history would undercount their buckets and quietly stop
 * unlocking movies for exactly the people who have earned the most.
 */
async function fetchAllMoments(
  supabase: SupabaseClient,
  userId: string,
): Promise<MomentRow[]> {
  const PAGE_SIZE = 1000;
  const out: MomentRow[] = [];
  for (let page = 0; ; page += 1) {
    const { data, error } = await supabase
      .from("entries")
      .select(
        "id, entry_date, entry_media(id), entry_metadata(people, primary_theme)",
      )
      .eq("user_id", userId)
      .eq("entry_type", "moment")
      .not("entry_date", "is", null)
      .order("id", { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) {
      console.error("movie_unlocks moment fetch error:", error.message);
      break;
    }
    const rows = (data ?? []) as MomentRow[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

/**
 * Every bucket that currently qualifies for a movie, across all five kinds.
 */
async function computeQualifyingBuckets(
  supabase: SupabaseClient,
  userId: string,
): Promise<CandidateBucket[]> {
  const [rows, statsRes] = await Promise.all([
    fetchAllMoments(supabase, userId),
    supabase
      .from("user_thread_stats")
      .select("recurring_people")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const aliasToCanonical = new Map<string, string>();
  const recurringPeople = (statsRes.data?.recurring_people ?? {}) as Record<
    string,
    { aliases?: string[] }
  >;
  for (const [canonical, entity] of Object.entries(recurringPeople)) {
    for (const alias of entity?.aliases ?? []) {
      aliasToCanonical.set(normalizeAlias(alias), canonical);
    }
  }

  // Distinct moments per bucket key, per kind.
  const counts: Record<MovieUnlockKind, Map<string, number>> = {
    week: new Map(),
    month: new Map(),
    year: new Map(),
    person: new Map(),
    theme: new Map(),
  };
  const bump = (kind: MovieUnlockKind, key: string) => {
    counts[kind].set(key, (counts[kind].get(key) ?? 0) + 1);
  };

  for (const row of rows) {
    // No media means no clips, so this moment can't carry a movie.
    if (!row.entry_media || row.entry_media.length === 0) continue;
    if (!row.entry_date) continue;
    const ymd = parseYmd(row.entry_date);
    if (!ymd) continue;

    bump("week", mondayKey(ymd.y, ymd.m, ymd.d));
    bump("month", `${ymd.y}-${pad2(ymd.m)}`);
    bump("year", String(ymd.y));

    const meta = firstEntryMetadata(row);
    const canonicalSeen = new Set<string>();
    for (const raw of meta?.people ?? []) {
      const canonical = aliasToCanonical.get(normalizeAlias(raw));
      if (canonical) canonicalSeen.add(canonical);
    }
    for (const canonical of canonicalSeen) bump("person", canonical);

    const theme = meta?.primary_theme;
    if (theme && theme in THEME_LABEL) bump("theme", theme);
  }

  const out: CandidateBucket[] = [];
  for (const kind of Object.keys(counts) as MovieUnlockKind[]) {
    for (const [bucketKey, momentCount] of counts[kind]) {
      if (momentCount < MIN_MOMENTS_FOR_MOVIE[kind]) continue;
      out.push({ kind, bucketKey, label: labelFor(kind, bucketKey), momentCount });
    }
  }
  return out;
}

function labelFor(kind: MovieUnlockKind, bucketKey: string): string {
  switch (kind) {
    case "week":
      return weekOfMonthLabel(bucketKey);
    case "month": {
      const [year, month] = bucketKey.split("-");
      return `${MONTH_SHORT[Number(month) - 1] ?? month} '${year.slice(-2)}`;
    }
    case "year":
      return bucketKey;
    case "person":
      return bucketKey;
    case "theme":
      return THEME_LABEL[bucketKey as Theme] ?? bucketKey;
  }
}

/**
 * How the push refers to the movie. A period the user is still living in reads
 * better as "this week" than as "2nd week of June".
 */
function pushPhrase(kind: MovieUnlockKind, bucketKey: string, label: string) {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const d = now.getUTCDate();
  switch (kind) {
    case "week":
      return bucketKey === mondayKey(y, m, d) ? "this week" : label;
    case "month":
      return bucketKey === `${y}-${pad2(m)}` ? "this month" : label;
    case "year":
      return bucketKey === String(y) ? "this year" : label;
    default:
      return label;
  }
}

export interface SyncMovieUnlocksOptions {
  /**
   * Whether this caller should announce a pending unlock.
   *
   * Only `process-threads` passes true. It runs after every save from every
   * screen, and by the time it calls us it also knows the moment's people and
   * theme — so letting it be the one to choose means the user hears "a movie
   * for Julia" rather than the blander "this month" a save-time caller would
   * have picked.
   */
  notify: boolean;
  /**
   * Record everything as already-announced. Used by the backfill so existing
   * users don't wake up to a month of notifications.
   */
  seedOnly?: boolean;
}

export interface SyncMovieUnlocksResult {
  inserted: number;
  notified: boolean;
}

export async function syncMovieUnlocks(
  supabase: SupabaseClient,
  userId: string,
  opts: SyncMovieUnlocksOptions,
): Promise<SyncMovieUnlocksResult> {
  const qualifying = await computeQualifyingBuckets(supabase, userId);
  if (qualifying.length === 0) return { inserted: 0, notified: false };

  const { data: existingRows } = await supabase
    .from("movie_unlocks")
    .select("kind, bucket_key")
    .eq("user_id", userId);

  const existing = new Set(
    (existingRows ?? []).map((r) => `${r.kind}:${r.bucket_key}`),
  );
  const missing = qualifying.filter(
    (b) => !existing.has(`${b.kind}:${b.bucketKey}`),
  );
  if (missing.length === 0 && !opts.notify) {
    return { inserted: 0, notified: false };
  }

  // Insurance against an account that slipped past `backfill-movie-unlocks`:
  // a user with no unlocks on record who suddenly qualifies for a pile of them
  // is meeting this feature for the first time, not someone who just earned
  // five movies in one save. Record, don't celebrate. The bar is deliberately
  // high so a genuine first unlock — or two crossing together — still counts.
  const isSeed =
    opts.seedOnly || ((existingRows ?? []).length === 0 && missing.length > 3);
  const stampedAt = isSeed ? new Date().toISOString() : null;

  if (missing.length > 0) {
    const { error } = await supabase.from("movie_unlocks").upsert(
      missing.map((b) => ({
        user_id: userId,
        kind: b.kind,
        bucket_key: b.bucketKey,
        label: b.label,
        moment_count: b.momentCount,
        notified_at: stampedAt,
      })),
      // A concurrent save may have recorded the same unlock already. Ignoring
      // the duplicate keeps its original unlocked_at / notified_at intact —
      // upserting over it could re-open a row we've already announced.
      { onConflict: "user_id,kind,bucket_key", ignoreDuplicates: true },
    );
    if (error && error.code !== "23505") {
      console.error("movie_unlocks insert error:", error.message);
    }
  }

  if (!opts.notify || isSeed) {
    return { inserted: missing.length, notified: false };
  }

  const notified = await notifyBestPendingUnlock(supabase, userId);
  return { inserted: missing.length, notified };
}

/**
 * Whether the user earned a movie in the last few minutes.
 *
 * Lets a save-time caller stand down from its own notification without having
 * to know whether `process-threads` has already run — the two race, and either
 * order should produce exactly one push.
 */
export async function hasRecentMovieUnlock(
  supabase: SupabaseClient,
  userId: string,
  withinMs: number,
): Promise<boolean> {
  const since = new Date(Date.now() - withinMs).toISOString();
  const { data } = await supabase
    .from("movie_unlocks")
    .select("id")
    .eq("user_id", userId)
    .gte("unlocked_at", since)
    .limit(1)
    .maybeSingle();
  return !!data;
}

/**
 * Announce the single most interesting unlock the user hasn't heard about.
 * Stamps `notified_at` whether or not the send succeeded, so a provider
 * outage doesn't turn into a retry loop on every subsequent save.
 */
async function notifyBestPendingUnlock(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data: pending } = await supabase
    .from("movie_unlocks")
    .select("id, kind, bucket_key, label, moment_count")
    .eq("user_id", userId)
    .is("notified_at", null);

  if (!pending || pending.length === 0) return false;

  const best = [...pending].sort(
    (a, b) =>
      NOTIFY_PRIORITY.indexOf(a.kind as MovieUnlockKind) -
      NOTIFY_PRIORITY.indexOf(b.kind as MovieUnlockKind),
  )[0];

  const kind = best.kind as MovieUnlockKind;
  const phrase = pushPhrase(kind, best.bucket_key, best.label);

  const result = await dispatch(supabase, {
    userId,
    eventKey: `movie_unlocked:${kind}:${best.bucket_key}`,
    channel: "push",
    oneShot: true,
    freqCap: { keyPrefix: "movie_unlocked:", windowDays: PUSH_FREQ_CAP_DAYS },
    payload: { kind, bucket_key: best.bucket_key },
    push: {
      title: `You've just unlocked a movie for ${phrase}`,
      body: `${best.moment_count} moments, stitched together. Tap to watch.`,
      data: { type: "movie_unlocked", kind, bucket_key: best.bucket_key },
    },
  });

  // Frequency-capped means another movie push just went out — leave the row
  // pending so it can be announced later rather than burning it silently.
  if (result.reason === "freq_cap") return false;

  await supabase
    .from("movie_unlocks")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", best.id);

  return result.sent;
}

/**
 * Refresh the user's canonical people map when a moment introduces a name we
 * haven't grouped yet.
 *
 * Without this a person movie can't unlock until the nightly sweep runs, so
 * the tenth moment about Julia would go unremarked for up to a day. Only fires
 * on genuinely new names, which keeps the LLM cost off the common path.
 */
export async function ensurePeopleCanonicalized(
  supabase: SupabaseClient,
  userId: string,
  rawPeople: string[] | null | undefined,
): Promise<void> {
  const names = (rawPeople ?? []).map(normalizeAlias).filter(Boolean);
  if (names.length === 0) return;

  const { data: stats } = await supabase
    .from("user_thread_stats")
    .select("recurring_people")
    .eq("user_id", userId)
    .maybeSingle();

  const known = new Set<string>();
  const recurringPeople = (stats?.recurring_people ?? {}) as Record<
    string,
    { aliases?: string[] }
  >;
  for (const entity of Object.values(recurringPeople)) {
    for (const alias of entity?.aliases ?? []) known.add(normalizeAlias(alias));
  }

  if (names.every((n) => known.has(n))) return;

  const cronSecret = Deno.env.get("CRON_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!cronSecret || !supabaseUrl) return;

  try {
    await fetch(`${supabaseUrl}/functions/v1/canonicalize-people`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: userId }),
    });
  } catch (err) {
    console.error(
      "ensurePeopleCanonicalized error:",
      err instanceof Error ? err.message : String(err),
    );
  }
}
