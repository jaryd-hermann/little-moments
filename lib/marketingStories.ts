import type { StorySlide } from "@/constants/storySlides";
import {
  CHANGE_LENS_SLIDES,
  STORYTELLING_SLIDES,
  EVERYDAY_MOMENTS_SLIDES,
  DAILY_HABIT_SLIDES,
  MEMORY_JOG_SLIDES,
} from "@/constants/storySlides";

export type MarketingStoryListItem = {
  slug: string;
  title: string;
  description?: string | null;
  slideCount: number;
};

export function toMarketingStoryListItems(
  records: MarketingStoryRecord[]
): MarketingStoryListItem[] {
  return records.map((s) => ({
    slug: s.slug,
    title: s.card_title,
    description: s.card_description,
    slideCount: s.slides.length,
  }));
}

export type MarketingStoryCategory = "philosophy" | "memory_jog";

export type MarketingStoryRecord = {
  slug: string;
  category: MarketingStoryCategory;
  card_title: string;
  card_description: string | null;
  slides: StorySlide[];
  sort_order: number;
};

export const STREAK_PHILOSOPHY_SLUG = "philosophy-daily-habit";
export const MEMORY_JOG_STORY_SLUG = "memory-jog";

/** Canonical four HOME / THE PHILOSOPHY story slugs (order = sort_order). */
export const PHILOSOPHY_STORY_SLUGS = [
  "philosophy-change-lens",
  "philosophy-storytelling",
  "philosophy-everyday-moments",
  "philosophy-daily-habit",
] as const;

/** Legacy numeric keys from PHILOSOPHY_ITEMS order (0–3). */
const LEGACY_PHILOSOPHY_SLUG_BY_INDEX: Record<number, string> = {
  0: "philosophy-change-lens",
  1: "philosophy-storytelling",
  2: "philosophy-everyday-moments",
  3: "philosophy-daily-habit",
};

function isStorySlide(x: unknown): x is StorySlide {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.title === "string" && typeof o.body === "string";
}

export function parseStorySlidesJson(raw: unknown): StorySlide[] | null {
  if (!Array.isArray(raw)) return null;
  const slides = raw.filter(isStorySlide);
  return slides.length > 0 ? slides : null;
}

export function rowToMarketingStory(row: {
  slug: string;
  category: string;
  card_title: string;
  card_description: string | null;
  slides: unknown;
  sort_order: number;
}): MarketingStoryRecord | null {
  const slides = parseStorySlidesJson(row.slides);
  if (!slides) return null;
  if (row.category !== "philosophy" && row.category !== "memory_jog")
    return null;
  return {
    slug: row.slug,
    category: row.category,
    card_title: row.card_title,
    card_description: row.card_description,
    slides,
    sort_order: row.sort_order,
  };
}

/** Progress ring / resume: map new slugs to old persisted keys. */
export function resolveStoryProgress(
  slug: string,
  progress: Record<string, number>
): number {
  const direct = progress[slug];
  if (direct != null && direct > 0) return direct;

  if (slug === MEMORY_JOG_STORY_SLUG) {
    const legacy = progress.memory_jog;
    if (legacy != null && legacy > 0) return legacy;
  }

  for (const [idx, s] of Object.entries(LEGACY_PHILOSOPHY_SLUG_BY_INDEX)) {
    if (s === slug) {
      const v = progress[idx];
      if (v != null && v > 0) return v;
    }
  }

  return direct ?? 0;
}

/**
 * StoryViewer persists the furthest "depth" as (currentSlideIndex + 1) while on a slide;
 * on full completion it equals slideCount. Map that to the slide index to reopen on.
 */
export function resumeSlideIndexFromProgress(
  progressValue: number,
  slideCount: number
): number {
  if (slideCount <= 0) return 0;
  if (progressValue <= 0) return 0;
  if (progressValue > slideCount) return 0;
  const idx = progressValue - 1;
  return Math.min(Math.max(0, idx), slideCount - 1);
}

export const MARKETING_STORIES_FALLBACK: MarketingStoryRecord[] = [
  {
    slug: "philosophy-change-lens",
    category: "philosophy",
    card_title: "Change the way you look at your life",
    card_description:
      "Homework for Life and why the smallest shifts carry the story.",
    sort_order: 1,
    slides: [...CHANGE_LENS_SLIDES],
  },
  {
    slug: "philosophy-storytelling",
    category: "philosophy",
    card_title: "Develop the greatest skill: storytelling",
    card_description:
      "Practice noticing narratives everywhere and going deeper with questions.",
    sort_order: 2,
    slides: [...STORYTELLING_SLIDES],
  },
  {
    slug: "philosophy-everyday-moments",
    category: "philosophy",
    card_title: "Finding stories in the everyday",
    card_description:
      "Your archive grows from ordinary days — that's where the plot lives.",
    sort_order: 3,
    slides: [...EVERYDAY_MOMENTS_SLIDES],
  },
  {
    slug: "philosophy-daily-habit",
    category: "philosophy",
    card_title: "Do it easy. Do it daily",
    card_description:
      "A few minutes a night and Memory Jog as a lever for habit.",
    sort_order: 4,
    slides: [...DAILY_HABIT_SLIDES],
  },
  {
    slug: MEMORY_JOG_STORY_SLUG,
    category: "memory_jog",
    card_title: "Amaze yourself with your memory",
    card_description:
      "How the race works and why timed free-writing unlocks memories.",
    sort_order: 5,
    slides: [...MEMORY_JOG_SLIDES],
  },
];

/**
 * True when the user has reached the final slide.
 * Uses strict equality so that stale progress from a previous slide-count
 * (e.g. 8-slide deck replaced by 6-slide deck) doesn't falsely complete.
 */
export function isMarketingStoryComplete(
  slug: string,
  slideCount: number,
  progress: Record<string, number>
): boolean {
  if (slideCount <= 0) return false;
  return resolveStoryProgress(slug, progress) === slideCount;
}

export function hasCompletedAllPhilosophyStories(
  progress: Record<string, number>,
  philosophyRecords: MarketingStoryRecord[]
): boolean {
  for (const slug of PHILOSOPHY_STORY_SLUGS) {
    const rec =
      philosophyRecords.find((r) => r.slug === slug) ??
      MARKETING_STORIES_FALLBACK.find((r) => r.slug === slug);
    if (!rec) return false;
    if (!isMarketingStoryComplete(slug, rec.slides.length, progress))
      return false;
  }
  return true;
}
