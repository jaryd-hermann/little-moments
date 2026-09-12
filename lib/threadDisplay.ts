import {
  differenceInDays,
  differenceInMonths,
  format,
  isThisWeek,
  isThisYear,
} from "date-fns";
import type { Thread, ThreadEntry } from "@/hooks/useThreads";
import { connectionLabel } from "@/lib/threadOrdinal";
import {
  extractShortQuestion,
  isValidFeedQuestion,
  isValidFeedStatement,
  sanitizeFeedQuestion,
  sanitizeFeedStatement,
} from "@/lib/threadFeedCopy";

const PEACH_BG = "#FECFB4";

export { PEACH_BG as THREAD_PEACH_BG };

/** Accent dot color per connection type (feed + capture cards). */
export const CONNECTION_TYPE_DOT_COLORS: Record<string, string> = {
  place: "#2A9D8F",
  pattern: "#E07A2F",
  person: "#7B5EA7",
  emotional: "#D4537E",
  thematic: "#5B7FD4",
  evolution: "#C4A035",
};

export function connectionDotColor(connectionType: string | null | undefined): string {
  if (!connectionType) return "#888888";
  return CONNECTION_TYPE_DOT_COLORS[connectionType] ?? "#888888";
}

export function connectionTypeLabelUpper(connectionType: string | null | undefined): string {
  return connectionLabel(connectionType).toUpperCase();
}

function isUsableImage(m: NonNullable<ThreadEntry["media"]>[number]): boolean {
  return (
    !!m.storage_url &&
    (m.media_type ?? "").toLowerCase().startsWith("image")
  );
}

/** First image URL per entry (max 2 — one per linked moment). */
export function threadCollageImageUrls(thread: Thread): string[] {
  const urls: string[] = [];
  for (const entry of [thread.entry_a, thread.entry_b]) {
    const first = (entry?.media ?? []).find(isUsableImage);
    if (first?.storage_url) urls.push(first.storage_url);
  }
  return urls;
}

function entryEffectiveDateString(entry: ThreadEntry): string | null {
  const taken = entry.media?.find((m) => m.taken_at)?.taken_at ?? null;
  return taken ?? entry.entry_date ?? entry.created_at ?? null;
}

export function threadTimeGapLabel(thread: Thread): string {
  const a = thread.entry_a ? entryEffectiveDateString(thread.entry_a) : null;
  const b = thread.entry_b ? entryEffectiveDateString(thread.entry_b) : null;
  if (!a || !b) return "";
  const dateA = new Date(a);
  const dateB = new Date(b);
  const months = Math.abs(differenceInMonths(dateA, dateB));
  if (months >= 2) return `${months} months apart`;
  const days = Math.abs(differenceInDays(dateA, dateB));
  if (days >= 14) return `${Math.round(days / 7)} weeks apart`;
  return `${days} days apart`;
}

/** Extract **bold** takeaway from legacy observations. */
export function extractBoldStatement(observation: string): string | null {
  const match = observation.match(/\*\*([^*]+)\*\*/);
  return match?.[1]?.trim() ?? null;
}

function firstSentence(text: string): string {
  const trimmed = text.replace(/\*\*/g, "").trim();
  const match = trimmed.match(/^(.+?[.!?])(?:\s|$)/);
  return (match?.[1] ?? trimmed).trim();
}

/** Display hook — DB column with client fallback from legacy fields. */
export function threadStatement(thread: Thread): string {
  if (isValidFeedStatement(thread.statement)) return thread.statement!.trim();

  const candidates = [
    thread.statement,
    extractBoldStatement(thread.ellie_observation ?? ""),
    firstSentence(thread.ellie_observation ?? ""),
    thread.ellie_observation,
  ].filter((value): value is string => !!value?.trim());

  for (const candidate of candidates) {
    const sanitized = sanitizeFeedStatement(candidate);
    if (sanitized) return sanitized;
  }

  return "A pattern across your moments";
}

/** Body copy for detail view — strips legacy **bold** hook so it isn't duplicated under the statement title. */
export function threadObservationBody(observation: string): string {
  return observation
    .replace(/\*\*[^*]+\*\*/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s.,;]+/, "")
    .trim();
}

/** Single inline question — DB column with fallback to questions[0]. */
export function threadQuestion(thread: Thread): string | null {
  if (isValidFeedQuestion(thread.question)) return thread.question!.trim();

  const candidates = [
    thread.question,
    thread.questions?.[0],
  ].filter((value): value is string => !!value?.trim());

  for (const candidate of candidates) {
    const extracted = extractShortQuestion(candidate);
    if (extracted && isValidFeedQuestion(extracted)) return extracted;
    const sanitized = sanitizeFeedQuestion(candidate);
    if (isValidFeedQuestion(sanitized)) return sanitized;
  }

  return null;
}

export type ThreadFeedSection = {
  key: string;
  title: string;
  data: Thread[];
};

/** Group threads newest-first into time buckets for the feed. */
export function groupThreadsForFeed(threads: Thread[]): ThreadFeedSection[] {
  const buckets = new Map<string, { title: string; data: Thread[] }>();
  const order: string[] = [];

  for (const thread of threads) {
    const created = new Date(thread.created_at);
    let key: string;
    let title: string;

    if (isThisWeek(created, { weekStartsOn: 1 })) {
      key = "this-week";
      title = "THIS WEEK";
    } else if (isThisYear(created)) {
      key = `month-${format(created, "yyyy-MM")}`;
      title = `EARLIER IN ${format(created, "MMMM").toUpperCase()}`;
    } else {
      key = `year-${format(created, "yyyy-MM")}`;
      title = format(created, "MMMM yyyy").toUpperCase();
    }

    if (!buckets.has(key)) {
      buckets.set(key, { title, data: [] });
      order.push(key);
    }
    buckets.get(key)!.data.push(thread);
  }

  return order.map((key) => {
    const bucket = buckets.get(key)!;
    return { key, title: bucket.title, data: bucket.data };
  });
}

/** True when thread was created after the user last opened the Connect tab. */
export function isThreadNewSinceTabVisit(
  thread: Thread,
  connectionsTabSeenAt: string | null | undefined
): boolean {
  if (!connectionsTabSeenAt) return true;
  return new Date(thread.created_at).getTime() > new Date(connectionsTabSeenAt).getTime();
}
