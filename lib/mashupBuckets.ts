import { THEME_LABEL, type Theme } from "@/constants/GraphPalette";
import { resolveCanonical, type AliasLookup } from "@/lib/canonicalPeople";
import type { Entry, EntryMedia } from "@/store/entryStore";

/**
 * A single "clip" in the mashup playback sequence. Each media item across all
 * moment entries becomes its own 2s clip, carrying a reference back to the
 * parent entry so the player can read date / title / location.
 */
export type MashupClip = {
  media: EntryMedia;
  entry: Entry;
};

/**
 * Period buckets slice the timeline; identity buckets ("person" / "theme")
 * slice by who or what a moment is about, so the same moment can appear in
 * several of them.
 */
export type MashupBucketType = "week" | "month" | "year" | "person" | "theme";

export interface MashupBucket {
  type: MashupBucketType;
  /**
   * Stable string key — "2026-06-08" / "2026-06" / "2026" for periods, the
   * canonical name for a person, the palette slug for a theme.
   */
  key: string;
  /** Big display label rendered on the card. */
  label: string;
  /** Number of media clips in this bucket (== clips.length). */
  count: number;
  /**
   * Number of distinct moments behind those clips. Always <= `count`, since a
   * single moment can contribute several photos — so this is the figure to use
   * for "does this period have enough to be worth a movie?".
   */
  momentCount: number;
  /** Anchor date for the bucket — the start of the period. Used for sorting. */
  anchor: Date;
  /** Chronologically-ordered (oldest → newest) clips. */
  clips: MashupClip[];
}

/**
 * Movie thresholds.
 *
 * These count moments that actually carry media, since a moment with no photo
 * or video contributes no clips — ten text-only moments would otherwise
 * "unlock" an empty movie. Keep in sync with
 * `supabase/functions/_shared/movie-unlocks.ts`, which decides when to push.
 */
export const MIN_MOMENTS_FOR_WEEK_MOVIE = 3;
export const MIN_MOMENTS_FOR_MONTH_MOVIE = 10;
export const MIN_MOMENTS_FOR_YEAR_MOVIE = 15;
export const MIN_MOMENTS_FOR_PERSON_MOVIE = 10;
export const MIN_MOMENTS_FOR_THEME_MOVIE = 10;

/** Minimum moments before a bucket of this type is worth showing as a movie. */
export function minMomentsForMashupBucket(type: MashupBucketType): number {
  switch (type) {
    case "week":
      return MIN_MOMENTS_FOR_WEEK_MOVIE;
    case "month":
      return MIN_MOMENTS_FOR_MONTH_MOVIE;
    case "year":
      return MIN_MOMENTS_FOR_YEAR_MOVIE;
    case "person":
      return MIN_MOMENTS_FOR_PERSON_MOVIE;
    case "theme":
      return MIN_MOMENTS_FOR_THEME_MOVIE;
  }
}

/** Whether this bucket has enough moments behind it to render a movie. */
export function mashupBucketHasEnoughMoments(bucket: MashupBucket): boolean {
  return bucket.momentCount >= minMomentsForMashupBucket(bucket.type);
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

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

const ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th", "6th"];

/**
 * Monday-start week boundary for a given date. Mirrors the convention used by
 * the chapters product so the weekly mashup buckets line up with chapter
 * boundaries.
 */
function startOfMondayWeek(d: Date): Date {
  const r = new Date(d);
  const day = r.getDay();
  const diff = (day + 6) % 7;
  r.setDate(r.getDate() - diff);
  r.setHours(0, 0, 0, 0);
  return r;
}

/**
 * "Nth week of <Month>" label — anchored on the Monday of the week. Matches
 * the existing chapter week label format from `lib/chapters.ts`.
 */
function weekOfMonthLabel(weekStart: Date): string {
  const month = weekStart.getMonth();
  const year = weekStart.getFullYear();
  const first = new Date(year, month, 1);
  const dow = first.getDay();
  const offset = ((1 - dow) + 7) % 7;
  const firstMonday = new Date(year, month, 1 + offset);
  const diffDays = Math.round(
    (weekStart.getTime() - firstMonday.getTime()) / (1000 * 60 * 60 * 24)
  );
  const weekNum = Math.max(1, Math.floor(diffDays / 7) + 1);
  const ord = ORDINALS[weekNum] ?? `${weekNum}th`;
  return `${ord} week of ${MONTH_NAMES[month]}`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Parses an entry's `entry_date` (YYYY-MM-DD) into a local-midnight Date.
 * Returns null for entries without a usable date (we skip those for mashups).
 */
function entryDate(entry: Entry): Date | null {
  if (!entry.entry_date) return null;
  const d = new Date(`${entry.entry_date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Returns one flat, chronologically-ordered list of mashup clips. Only
 * "moment" entries with media participate. Within an entry, media are ordered
 * by `display_order` so the user sees them in the order they uploaded them.
 */
export function flattenMomentsToClips(entries: Entry[]): MashupClip[] {
  const out: MashupClip[] = [];
  for (const e of entries) {
    if (e.entry_type !== "moment") continue;
    if (!entryDate(e)) continue;
    const media = (e.media ?? []).slice().sort(
      (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
    );
    for (const m of media) {
      out.push({ media: m, entry: e });
    }
  }
  out.sort((a, b) => {
    const da = entryDate(a.entry)!.getTime();
    const db = entryDate(b.entry)!.getTime();
    if (da !== db) return da - db;
    return (a.media.display_order ?? 0) - (b.media.display_order ?? 0);
  });
  return out;
}

function buildBuckets(
  clips: MashupClip[],
  keyForDate: (d: Date) => string,
  anchorForKey: (key: string, d: Date) => Date,
  labelForAnchor: (d: Date) => string,
  type: MashupBucketType
): MashupBucket[] {
  const byKey = new Map<string, { anchor: Date; clips: MashupClip[] }>();
  for (const clip of clips) {
    const d = entryDate(clip.entry);
    if (!d) continue;
    const key = keyForDate(d);
    const slot = byKey.get(key);
    if (slot) {
      slot.clips.push(clip);
    } else {
      byKey.set(key, { anchor: anchorForKey(key, d), clips: [clip] });
    }
  }
  const out: MashupBucket[] = [];
  for (const [key, { anchor, clips: bucketClips }] of byKey.entries()) {
    out.push({
      type,
      key,
      label: labelForAnchor(anchor),
      count: bucketClips.length,
      momentCount: new Set(bucketClips.map((c) => c.entry.id)).size,
      anchor,
      clips: bucketClips,
    });
  }
  // Newest first across the carousel.
  out.sort((a, b) => b.anchor.getTime() - a.anchor.getTime());
  return out;
}

/** Stable bucket key for a calendar date — mirrors `bucketMomentsByWeek`. */
export function weekBucketKeyForDate(d: Date): string {
  const ws = startOfMondayWeek(d);
  return `${ws.getFullYear()}-${pad2(ws.getMonth() + 1)}-${pad2(ws.getDate())}`;
}

/** Stable bucket key for a calendar date — mirrors `bucketMomentsByMonth`. */
export function monthBucketKeyForDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/** Stable bucket key for a calendar date — mirrors `bucketMomentsByYear`. */
export function yearBucketKeyForDate(d: Date): string {
  return `${d.getFullYear()}`;
}

/**
 * Weekly movie buckets, thin weeks removed.
 *
 * The threshold is applied here rather than at each call site so a period can
 * never appear as a movie on one screen and be absent on another. Callers that
 * need the unfiltered count (e.g. the Capture "N more moments" placeholder)
 * should use {@link movieProgress}.
 */
export function bucketMomentsByWeek(entries: Entry[]): MashupBucket[] {
  return unfilteredWeeks(entries).filter(mashupBucketHasEnoughMoments);
}

function unfilteredWeeks(entries: Entry[]): MashupBucket[] {
  const clips = flattenMomentsToClips(entries);
  return buildBuckets(
    clips,
    (d) => {
      const ws = startOfMondayWeek(d);
      return `${ws.getFullYear()}-${pad2(ws.getMonth() + 1)}-${pad2(ws.getDate())}`;
    },
    (_key, d) => startOfMondayWeek(d),
    (anchor) => weekOfMonthLabel(anchor),
    "week"
  );
}

/** Monthly movie buckets, thin months removed. See {@link bucketMomentsByWeek}. */
export function bucketMomentsByMonth(entries: Entry[]): MashupBucket[] {
  return unfilteredMonths(entries).filter(mashupBucketHasEnoughMoments);
}

function unfilteredMonths(entries: Entry[]): MashupBucket[] {
  const clips = flattenMomentsToClips(entries);
  return buildBuckets(
    clips,
    (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`,
    (_key, d) => new Date(d.getFullYear(), d.getMonth(), 1),
    (anchor) => {
      const yy = String(anchor.getFullYear()).slice(-2);
      return `${MONTH_SHORT[anchor.getMonth()]} '${yy}`;
    },
    "month"
  );
}

/** Yearly movie buckets, thin years removed. See {@link bucketMomentsByWeek}. */
export function bucketMomentsByYear(entries: Entry[]): MashupBucket[] {
  return unfilteredYears(entries).filter(mashupBucketHasEnoughMoments);
}

function unfilteredYears(entries: Entry[]): MashupBucket[] {
  const clips = flattenMomentsToClips(entries);
  return buildBuckets(
    clips,
    (d) => `${d.getFullYear()}`,
    (_key, d) => new Date(d.getFullYear(), 0, 1),
    (anchor) => String(anchor.getFullYear()),
    "year"
  );
}

/**
 * Identity buckets group the same clips by *who* or *what* rather than when,
 * so one clip can land in several buckets. The anchor is the newest clip in
 * the bucket, which keeps the most recently-active person or theme first in
 * the carousel.
 */
function buildIdentityBuckets(
  clips: MashupClip[],
  keysForClip: (clip: MashupClip) => string[],
  labelForKey: (key: string) => string,
  type: MashupBucketType
): MashupBucket[] {
  const byKey = new Map<string, MashupClip[]>();
  for (const clip of clips) {
    for (const key of keysForClip(clip)) {
      const slot = byKey.get(key);
      if (slot) slot.push(clip);
      else byKey.set(key, [clip]);
    }
  }
  const out: MashupBucket[] = [];
  for (const [key, bucketClips] of byKey.entries()) {
    const newest = bucketClips.reduce((acc, c) => {
      const d = entryDate(c.entry);
      return d && d.getTime() > acc ? d.getTime() : acc;
    }, 0);
    out.push({
      type,
      key,
      label: labelForKey(key),
      count: bucketClips.length,
      momentCount: new Set(bucketClips.map((c) => c.entry.id)).size,
      anchor: new Date(newest),
      clips: bucketClips,
    });
  }
  out.sort((a, b) => b.anchor.getTime() - a.anchor.getTime());
  return out;
}

/**
 * Movie buckets per canonical person, thin people removed.
 *
 * `peopleLookup` comes from `user_thread_stats.recurring_people` via
 * `buildAliasLookup` — without it every moment resolves to zero people and
 * the section stays empty, which is the right failure mode for a user whose
 * canonicalization hasn't run yet.
 */
export function bucketMomentsByPerson(
  entries: Entry[],
  peopleLookup: AliasLookup
): MashupBucket[] {
  return unfilteredPeople(entries, peopleLookup).filter(
    mashupBucketHasEnoughMoments
  );
}

function unfilteredPeople(
  entries: Entry[],
  peopleLookup: AliasLookup
): MashupBucket[] {
  if (peopleLookup.size === 0) return [];
  return buildIdentityBuckets(
    flattenMomentsToClips(entries),
    (clip) => resolveCanonical(clip.entry.metadata?.people, peopleLookup),
    (key) => key,
    "person"
  );
}

/** Movie buckets per theme, thin themes removed. */
export function bucketMomentsByTheme(entries: Entry[]): MashupBucket[] {
  return unfilteredThemes(entries).filter(mashupBucketHasEnoughMoments);
}

function unfilteredThemes(entries: Entry[]): MashupBucket[] {
  return buildIdentityBuckets(
    flattenMomentsToClips(entries),
    (clip) => {
      const theme = clip.entry.metadata?.primary_theme;
      return theme && theme in THEME_LABEL ? [theme] : [];
    },
    (key) => THEME_LABEL[key as Theme] ?? key,
    "theme"
  );
}

/**
 * Every bucket of a type, *including* those still short of the threshold.
 * Used for progress countdowns — the filtered bucketers above deliberately
 * hide thin buckets, so they can't answer "how close am I?".
 */
export function unfilteredMashupBuckets(
  entries: Entry[],
  type: MashupBucketType,
  peopleLookup?: AliasLookup
): MashupBucket[] {
  switch (type) {
    case "week":
      return unfilteredWeeks(entries);
    case "month":
      return unfilteredMonths(entries);
    case "year":
      return unfilteredYears(entries);
    case "person":
      return unfilteredPeople(entries, peopleLookup ?? new Map());
    case "theme":
      return unfilteredThemes(entries);
  }
}

export interface MovieProgress {
  /** Moments with media currently in the bucket. */
  current: number;
  required: number;
  remaining: number;
  /** 0–1, for the unlock bar. */
  ratio: number;
}

/**
 * Progress toward a specific bucket's movie. Counts only moments that carry
 * media, so the countdown can never sit at "0 more" while the movie refuses
 * to appear.
 */
export function movieProgress(
  entries: Entry[],
  type: MashupBucketType,
  key: string,
  peopleLookup?: AliasLookup
): MovieProgress {
  const bucket = unfilteredMashupBuckets(entries, type, peopleLookup).find(
    (b) => b.key === key
  );
  return movieProgressForCount(type, bucket?.momentCount ?? 0);
}

export function movieProgressForCount(
  type: MashupBucketType,
  current: number
): MovieProgress {
  const required = minMomentsForMashupBucket(type);
  return {
    current,
    required,
    remaining: Math.max(0, required - current),
    ratio: required === 0 ? 1 : Math.min(1, current / required),
  };
}

/**
 * The person / theme closest to earning a movie, for the "3 more moments with
 * Julia" placeholder. Returns null when nothing is in flight yet.
 */
export function closestPendingIdentityBucket(
  entries: Entry[],
  type: "person" | "theme",
  peopleLookup?: AliasLookup
): MashupBucket | null {
  const pending = unfilteredMashupBuckets(entries, type, peopleLookup)
    .filter((b) => !mashupBucketHasEnoughMoments(b))
    .sort((a, b) => b.momentCount - a.momentCount);
  return pending[0] ?? null;
}

/** Helper for the player's top-left overlay — `Mon · Jun 9, 2026 · 19:34`. */
export function formatClipTimestamp(clip: MashupClip): string {
  const e = clip.entry;
  const ed = entryDate(e);
  if (!ed) return "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][ed.getDay()];
  const dateLabel = `${MONTH_SHORT[ed.getMonth()]} ${ed.getDate()}, ${ed.getFullYear()}`;

  // Prefer the photo's original capture time over the entry's save time so the
  // overlay reflects when the moment actually happened, not when the user
  // logged it. Falls back to the entry's `created_at` and finally just the
  // date.
  const timeSource = clip.media.taken_at ?? e.created_at;
  if (timeSource) {
    const t = new Date(timeSource);
    if (!Number.isNaN(t.getTime())) {
      const hh = pad2(t.getHours());
      const mm = pad2(t.getMinutes());
      return `${weekday} · ${dateLabel} · ${hh}:${mm}`;
    }
  }
  return `${weekday} · ${dateLabel}`;
}

/** Title shown in the splash-hero treatment at the bottom of each clip. */
export function clipTitleText(clip: MashupClip): string {
  const e = clip.entry;
  if (e.title && e.title.trim().length > 0) return e.title.trim();
  const body = (e.body ?? "").trim();
  if (body.length === 0) return "";
  return body.length > 40 ? `${body.slice(0, 40).trimEnd()}…` : body;
}
