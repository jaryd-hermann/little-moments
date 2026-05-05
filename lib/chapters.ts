import type { EntryMedia } from "@/store/entryStore";

export type ChapterSlide = {
  body: string;
};

export type ImageSlideLayout = "v1" | "v2" | "v3" | "v4" | "v5";

export type ChapterImageSlide = {
  layout: ImageSlideLayout;
  media_ids: string[];
  storage_paths: string[];
};

export type ChapterRecord = {
  id: string;
  user_id: string;
  chapter_number: number;
  /** Legacy monthly chapters set ref_year/ref_month; weekly set ref_iso_week_year/ref_iso_week + ref_week_start_date. */
  ref_year: number | null;
  ref_month: number | null;
  ref_iso_week: number | null;
  ref_iso_week_year: number | null;
  ref_week_start_date: string | null;
  moment_count: number;
  slides: ChapterSlide[];
  image_slide: ChapterImageSlide | null;
  source_entry_ids: string[];
  source_media_ids: string[];
  created_at: string;
  updated_at: string;
  /** First time the owner opened the chapter story. Null = never opened. */
  viewed_at: string | null;
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function chapterMonthName(month: number): string {
  return MONTH_NAMES[(month - 1) % 12] ?? `Month ${month}`;
}

const ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th", "6th"];

/**
 * "Nth week of <Month>" — Monday-start week-of-month, anchored on the chapter's
 * Monday `ref_week_start_date`. Matches the Capsule list grouping headers.
 */
export function chapterWeekLabel(chapter: ChapterRecord): string {
  if (!chapter.ref_week_start_date) return "";
  const d = new Date(`${chapter.ref_week_start_date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";

  const month = d.getMonth();
  const year = d.getFullYear();
  const first = new Date(year, month, 1);
  const dow = first.getDay();
  const offset = ((1 - dow) + 7) % 7;
  const firstMonday = new Date(year, month, 1 + offset);
  const diffDays = Math.round(
    (d.getTime() - firstMonday.getTime()) / (1000 * 60 * 60 * 24)
  );
  const weekNum = Math.max(1, Math.floor(diffDays / 7) + 1);
  const ord = ORDINALS[weekNum] ?? `${weekNum}th`;
  return `${ord} week of ${chapterMonthName(month + 1)}`;
}

export function isWeeklyChapter(chapter: ChapterRecord): boolean {
  return Boolean(chapter.ref_week_start_date);
}

export function chapterCardTitle(chapter: ChapterRecord): string {
  if (chapter.ref_week_start_date) {
    return `Chapter ${chapter.chapter_number}: ${chapterWeekLabel(chapter)}`;
  }
  if (chapter.ref_month != null) {
    return `Chapter ${chapter.chapter_number}: ${chapterMonthName(chapter.ref_month)}`;
  }
  return `Chapter ${chapter.chapter_number}`;
}

export function parseChapterRow(row: {
  id: string;
  user_id: string;
  chapter_number: number;
  ref_year: number | null;
  ref_month: number | null;
  ref_iso_week: number | null;
  ref_iso_week_year: number | null;
  ref_week_start_date: string | null;
  moment_count: number;
  slides: unknown;
  image_slide: unknown;
  source_entry_ids: string[];
  source_media_ids: string[];
  created_at: string;
  updated_at: string;
  viewed_at?: string | null;
}): ChapterRecord | null {
  if (!Array.isArray(row.slides)) return null;

  const slides: ChapterSlide[] = [];
  for (const s of row.slides) {
    if (s && typeof s === "object" && typeof (s as { body?: unknown }).body === "string") {
      slides.push({ body: (s as { body: string }).body });
    }
  }
  if (slides.length === 0) return null;

  let imageSlide: ChapterImageSlide | null = null;
  if (row.image_slide && typeof row.image_slide === "object") {
    const is = row.image_slide as Record<string, unknown>;
    if (
      typeof is.layout === "string" &&
      Array.isArray(is.storage_paths) &&
      is.storage_paths.length > 0
    ) {
      imageSlide = {
        layout: is.layout as ImageSlideLayout,
        media_ids: Array.isArray(is.media_ids) ? is.media_ids as string[] : [],
        storage_paths: is.storage_paths as string[],
      };
    }
  }

  return {
    id: row.id,
    user_id: row.user_id,
    chapter_number: row.chapter_number,
    ref_year: row.ref_year,
    ref_month: row.ref_month,
    ref_iso_week: row.ref_iso_week,
    ref_iso_week_year: row.ref_iso_week_year,
    ref_week_start_date: row.ref_week_start_date,
    moment_count: row.moment_count,
    slides,
    image_slide: imageSlide,
    source_entry_ids: row.source_entry_ids ?? [],
    source_media_ids: row.source_media_ids ?? [],
    created_at: row.created_at,
    updated_at: row.updated_at,
    viewed_at: row.viewed_at ?? null,
  };
}

/**
 * Total slide count for progress indicator:
 * 1 (cover) + N text slides + 1 optional image slide
 */
export function chapterTotalSlides(chapter: ChapterRecord): number {
  return 1 + chapter.slides.length + (chapter.image_slide ? 1 : 0);
}

/**
 * Build fake EntryMedia objects from chapter image_slide storage paths.
 * Used by the image slide component to resolve display URLs.
 */
export function chapterImageSlideToMedia(
  imageSlide: ChapterImageSlide,
): EntryMedia[] {
  return imageSlide.storage_paths.map((path, i) => ({
    id: imageSlide.media_ids[i] ?? `chapter-media-${i}`,
    entry_id: "",
    user_id: "",
    storage_path: path,
    storage_url: null,
    media_type: "image" as const,
    display_order: i,
    created_at: "",
  }));
}
