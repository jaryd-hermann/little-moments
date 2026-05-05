import { create } from "zustand";
import type { ChapterRecord } from "@/lib/chapters";

const DUMMY_SLIDES_WEEK_1 = [
  { body: "This week opened on a Tuesday morning where the light caught you off guard. You wrote about it in two sentences, then put the phone down. That's the whole story." },
  { body: "You came back to coffee three times — not the cup, the ritual. The pause before the day begins. *Some weeks,* that pause is the entire chapter." },
  { body: "Mid-week, a small conversation didn't land the way you expected. You mentioned it briefly, then circled back two days later. The thing you didn't say first is the thing that matters." },
  { body: "By Friday you were laughing at something small — a kid's offhand comment, a stranger's expression. You captured it in a line. A line is enough." },
  { body: "Five moments. Some days you wrote a paragraph, some days only a sentence. They're already a thread in the fabric of who you are right now." },
];

const DUMMY_SLIDES_WEEK_2 = [
  { body: "You started this week tired. Not dramatic, just the weight of showing up. You wrote about it without softening it — that takes practice." },
  { body: "The walk on Wednesday surprised you. The wind, the air, the way the light fell across the street. You stopped and pulled out your phone. *Good.*" },
  { body: "There's a thread you keep returning to — someone you love, a thing they do that you haven't fully named. This week, you wrote one more sentence about it. Slowly, slowly, you're getting there." },
  { body: "Saturday felt different. Softer. Like you finally had room to hear your own thoughts. You wrote less but it was clearer." },
  { body: "Six moments. They're not perfect entries. They don't need to be. They are honest, and that's the only thing that matters." },
];

function makeDummyChapter(opts: {
  chapterNumber: number;
  weekStartIso: string;
  momentCount: number;
  slides: { body: string }[];
  id: string;
}): ChapterRecord {
  const start = new Date(`${opts.weekStartIso}T00:00:00`);
  return {
    id: opts.id,
    user_id: "dummy-user",
    chapter_number: opts.chapterNumber,
    ref_year: start.getFullYear(),
    ref_month: start.getMonth() + 1,
    ref_iso_week: 1,
    ref_iso_week_year: start.getFullYear(),
    ref_week_start_date: opts.weekStartIso,
    moment_count: opts.momentCount,
    slides: opts.slides,
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
    created_at: start.toISOString(),
    updated_at: start.toISOString(),
    viewed_at: null,
  };
}

function startOfMondayWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day + 6) % 7; // days since Monday
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function makeDummyChapters(): ChapterRecord[] {
  const today = new Date();
  const lastWeekMonday = startOfMondayWeek(today);
  lastWeekMonday.setDate(lastWeekMonday.getDate() - 7);
  const twoWeeksAgoMonday = new Date(lastWeekMonday);
  twoWeeksAgoMonday.setDate(twoWeeksAgoMonday.getDate() - 7);

  return [
    makeDummyChapter({
      id: "dummy-chapter-2",
      chapterNumber: 2,
      weekStartIso: isoDate(lastWeekMonday),
      momentCount: 6,
      slides: DUMMY_SLIDES_WEEK_2,
    }),
    makeDummyChapter({
      id: "dummy-chapter-1",
      chapterNumber: 1,
      weekStartIso: isoDate(twoWeeksAgoMonday),
      momentCount: 5,
      slides: DUMMY_SLIDES_WEEK_1,
    }),
  ];
}

interface ChapterDevStore {
  dummyChapterEnabled: boolean;
  toggleDummyChapter: () => void;
  /** Latest dummy chapter (most recent week). */
  getDummyChapter: () => ChapterRecord | null;
  /** Full list of dummy chapters (most recent first). */
  getDummyChapters: () => ChapterRecord[];
}

export const useChapterDevStore = create<ChapterDevStore>((set, get) => ({
  dummyChapterEnabled: false,
  toggleDummyChapter: () =>
    set((s) => ({ dummyChapterEnabled: !s.dummyChapterEnabled })),
  getDummyChapter: () => {
    if (!get().dummyChapterEnabled) return null;
    return makeDummyChapters()[0] ?? null;
  },
  getDummyChapters: () =>
    get().dummyChapterEnabled ? makeDummyChapters() : [],
}));
