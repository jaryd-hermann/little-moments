import { create } from "zustand";
import type { ChapterRecord } from "@/lib/chapters";

const DUMMY_SLIDES = [
  { body: "This month started quietly — a Tuesday morning where you noticed the light differently, and something in you *shifted*." },
  { body: "You wrote about coffee more than once. Not the coffee itself, but the ritual. The pause before the day begins. That's not about caffeine. That's about needing a moment that's yours." },
  { body: "There was a conversation with someone close to you that didn't go the way you expected. You didn't write much about it, but you came back to it three days later. That's the moment that mattered." },
  { body: "Mid-month, you found yourself laughing at something small — a thing your kid said, a look from a stranger, a memory that surfaced without warning. You wrote it down in two sentences. Those two sentences are the whole story." },
  { body: "You mentioned feeling tired more than once. Not the dramatic kind. The quiet kind — the weight of *showing up every day* without anyone noticing. This chapter notices." },
  { body: "The weekend entries were different from the weekday ones. Softer. More spacious. Like you finally had room to hear your own thoughts." },
  { body: "Near the end of the month, you wrote something that surprised even you. A memory from years ago, triggered by a smell or a song. That's what this practice does — it doesn't just capture the present. It unlocks the past." },
  { body: "Twenty-three moments. Some days you wrote a paragraph, some days a single line. Every single one of them is a thread in the fabric of who you are right now." },
];

function makeDummyChapter(): ChapterRecord {
  const now = new Date();
  const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  return {
    id: "dummy-chapter-id",
    user_id: "dummy-user",
    chapter_number: 3,
    ref_year: prevYear,
    ref_month: prevMonth,
    moment_count: 23,
    slides: DUMMY_SLIDES,
    image_slide: {
      layout: "v4",
      media_ids: ["demo-1", "demo-2", "demo-3", "demo-4"],
      storage_paths: [
        "https://images.unsplash.com/photo-1773318427480-1058e1059f99?q=80&w=774&auto=format&fit=crop&ixlib=rb-4.1.0",
        "https://plus.unsplash.com/premium_photo-1774354371597-1b649ba507da?q=80&w=774&auto=format&fit=crop&ixlib=rb-4.1.0",
        "https://images.unsplash.com/photo-1773929483999-52ac8e6af2cc?q=80&w=870&auto=format&fit=crop&ixlib=rb-4.1.0",
        "https://images.unsplash.com/photo-1774333406492-2806c117fe59?q=80&w=774&auto=format&fit=crop&ixlib=rb-4.1.0",
      ],
    },
    source_entry_ids: [],
    source_media_ids: [],
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
}

interface ChapterDevStore {
  dummyChapterEnabled: boolean;
  toggleDummyChapter: () => void;
  getDummyChapter: () => ChapterRecord | null;
}

export const useChapterDevStore = create<ChapterDevStore>((set, get) => ({
  dummyChapterEnabled: false,
  toggleDummyChapter: () =>
    set((s) => ({ dummyChapterEnabled: !s.dummyChapterEnabled })),
  getDummyChapter: () =>
    get().dummyChapterEnabled ? makeDummyChapter() : null,
}));
