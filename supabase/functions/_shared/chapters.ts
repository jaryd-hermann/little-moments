/**
 * Shared helpers for the cron-chapters edge function.
 * Prompt construction, JSON schema validation, image-slide layout resolution.
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

export function buildChapterPrompt(
  chapterNumber: number,
  month: number,
  year: number,
  momentCount: number,
  entries: { title: string | null; body: string; entry_date: string | null }[],
): string {
  const name = monthName(month);
  const entriesText = entries
    .map((e, i) => {
      const title = e.title ? ` — ${e.title}` : "";
      const date = e.entry_date ?? "unknown date";
      return `Entry ${i + 1} (${date}${title}):\n${e.body}`;
    })
    .join("\n\n---\n\n");

  return `You are a warm, thoughtful storyteller helping someone reflect on their month.

Below are ${momentCount} personal journal entries ("moments") written during ${name} ${year}. This is Chapter ${chapterNumber} of their life story.

INSTRUCTIONS:
- Write exactly 8 short reflection slides, each a single paragraph (2-4 sentences).
- Mirror the user's own voice, vocabulary, and emotional register. If they write casually, be casual. If they write poetically, match that.
- Reference specific details, feelings, people, and events from their entries. Do not invent facts.
- The tone should feel like a personal letter to the writer — warm, honest, sometimes gently humorous.
- Capture the arc of the month: what themes emerged, what small moments stood out, what feelings recurred.
- Use simple markdown for emphasis: wrap key phrases in *asterisks* for italic emphasis (sparingly, 0-2 per slide).
- Do NOT use emoji.
- Do NOT use generic platitudes. Be specific to this person's month.

OUTPUT FORMAT:
Return a JSON array of exactly 8 objects. Each object has one key: "body" (string).
Example: [{"body":"Your month started with..."}, ...]

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

  const capped = deduped.slice(0, MAX_COLLAGE_IMAGES);
  const count = capped.length;

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
