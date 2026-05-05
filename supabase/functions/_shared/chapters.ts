/**
 * Shared helpers for the cron-chapters edge function.
 * Weekly chapter prompt construction, JSON schema validation,
 * image-slide layout resolution, and week labelling.
 */

export type ChapterSlide = {
  body: string;
};

export type ImageSlideLayout = "v1" | "v2" | "v3" | "v4" | "v5";

export type ImageSlideData = {
  layout: ImageSlideLayout;
  media_ids: string[];
  storage_paths: string[];
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthName(month: number): string {
  return MONTH_NAMES[(month - 1) % 12] ?? `Month ${month}`;
}

const ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th", "6th"];

/**
 * Compute the week-of-month for a Monday-start week, returning the ordinal label
 * "Nth week of <Month>" — matches the Capsule list grouping headers.
 *
 * `weekStartIso` should be the YYYY-MM-DD string of the Monday that opens the week.
 */
export function weekOfMonthLabel(weekStartIso: string): string {
  const d = new Date(`${weekStartIso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "this week";
  // Anchor to UTC to avoid TZ drift; the date is already a calendar Monday.
  const month = d.getUTCMonth();
  const year = d.getUTCFullYear();

  // First Monday of that month.
  const first = new Date(Date.UTC(year, month, 1));
  const dow = first.getUTCDay(); // 0=Sun..6=Sat
  // Days to add to reach Monday (Mon=1). If first is Mon already, 0.
  const offset = ((1 - dow) + 7) % 7;
  const firstMonday = new Date(Date.UTC(year, month, 1 + offset));
  const diffDays = Math.round(
    (d.getTime() - firstMonday.getTime()) / (1000 * 60 * 60 * 24)
  );
  const weekNum = Math.max(1, Math.floor(diffDays / 7) + 1);
  const ord = ORDINALS[weekNum] ?? `${weekNum}th`;
  return `${ord} week of ${monthName(month + 1)}`;
}

export function buildChapterPrompt(
  chapterNumber: number,
  weekLabel: string,
  rangeLabel: string,
  momentCount: number,
  entries: { title: string | null; body: string; entry_date: string | null }[],
): string {
  const entriesText = entries
    .map((e, i) => {
      const title = e.title ? ` — ${e.title}` : "";
      const date = e.entry_date ?? "unknown date";
      return `Entry ${i + 1} (${date}${title}):\n${e.body}`;
    })
    .join("\n\n---\n\n");

  return `You are a warm, thoughtful memory guide helping someone reflect on their week.

Below are ${momentCount} personal journal entries ("moments") written during the ${weekLabel} (${rangeLabel}). This is Chapter ${chapterNumber} of their life story.

INSTRUCTIONS:
- Write exactly 5 short reflection slides, each a single paragraph (2-4 sentences).
- Mirror the user's own voice, vocabulary, and emotional register. If they write casually, be casual. If they write poetically, match that.
- Reference specific details, feelings, people, and events from their entries. Do not invent facts.
- The tone should feel like a personal letter to the writer — warm, honest, sometimes gently humorous.
- Capture the arc of the week: what themes emerged, what small moments stood out, what feelings recurred.
- Use simple markdown for emphasis: wrap key phrases in *asterisks* for italic emphasis (sparingly, 0-2 per slide).
- Do NOT use emoji.
- Do NOT use generic platitudes. Be specific to this person's week.

OUTPUT FORMAT:
Return a JSON array of exactly 5 objects. Each object has one key: "body" (string).
Example: [{"body":"Your week started with..."}, ...]

Do not include any text outside the JSON array.

---

THE ENTRIES:

${entriesText}`;
}

export function parseChapterSlidesResponse(raw: string): ChapterSlide[] | null {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return null;

  try {
    const arr = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(arr)) return null;

    const slides: ChapterSlide[] = [];
    for (const item of arr) {
      if (typeof item?.body === "string" && item.body.trim().length > 0) {
        slides.push({ body: item.body.trim() });
      }
    }

    if (slides.length < 1) return null;
    return slides.slice(0, 8);
  } catch {
    return null;
  }
}

const MAX_COLLAGE_IMAGES = 12;

export function resolveImageSlide(
  mediaRows: { id: string; storage_path: string }[],
): ImageSlideData | null {
  if (mediaRows.length === 0) return null;

  const seen = new Set<string>();
  const deduped: typeof mediaRows = [];
  for (const m of mediaRows) {
    if (!seen.has(m.storage_path)) {
      seen.add(m.storage_path);
      deduped.push(m);
    }
  }

  const count = Math.min(deduped.length, MAX_COLLAGE_IMAGES);
  if (count < 1) return null;
  const capped = deduped.slice(0, count);

  // Layouts are defined in components/today/ChapterImageSlide.tsx — we have
  // dedicated 1/2/3/4 layouts; counts ≥5 fall through to the alternating
  // two-column v5 layout which handles arbitrary lengths.
  let layout: ImageSlideLayout;
  if (count === 1) layout = "v1";
  else if (count === 2) layout = "v2";
  else if (count === 3) layout = "v3";
  else if (count === 4) layout = "v4";
  else layout = "v5";

  return {
    layout,
    media_ids: capped.map((m) => m.id),
    storage_paths: capped.map((m) => m.storage_path),
  };
}
