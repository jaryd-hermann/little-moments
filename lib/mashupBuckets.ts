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

export type MashupBucketType = "week" | "month" | "year";

export interface MashupBucket {
  type: MashupBucketType;
  /** Stable string key, e.g. "2026-W23" / "2026-06" / "2026". */
  key: string;
  /** Big display label rendered on the card. */
  label: string;
  /** Number of media clips in this bucket (== clips.length). */
  count: number;
  /** Anchor date for the bucket — the start of the period. Used for sorting. */
  anchor: Date;
  /** Chronologically-ordered (oldest → newest) clips. */
  clips: MashupClip[];
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

export function mashupBucketKeyForEntryDate(
  type: MashupBucketType,
  entryDate: Date
): string {
  switch (type) {
    case "week":
      return weekBucketKeyForDate(entryDate);
    case "month":
      return monthBucketKeyForDate(entryDate);
    case "year":
      return yearBucketKeyForDate(entryDate);
  }
}

/** Clip count for one mashup bucket across the given entries. */
export function countClipsInMashupBucket(
  entries: Entry[],
  type: MashupBucketType,
  key: string
): number {
  const buckets =
    type === "week"
      ? bucketMomentsByWeek(entries)
      : type === "month"
        ? bucketMomentsByMonth(entries)
        : bucketMomentsByYear(entries);
  return buckets.find((b) => b.key === key)?.count ?? 0;
}

export function bucketMomentsByWeek(entries: Entry[]): MashupBucket[] {
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

export function bucketMomentsByMonth(entries: Entry[]): MashupBucket[] {
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

export function bucketMomentsByYear(entries: Entry[]): MashupBucket[] {
  const clips = flattenMomentsToClips(entries);
  return buildBuckets(
    clips,
    (d) => `${d.getFullYear()}`,
    (_key, d) => new Date(d.getFullYear(), 0, 1),
    (anchor) => String(anchor.getFullYear()),
    "year"
  );
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
