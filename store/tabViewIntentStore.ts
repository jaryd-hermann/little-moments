import type { MashupBucketType } from "@/lib/mashupBuckets";
import { create } from "zustand";

export type TabViewMode = "list" | "grid" | "feed";

export interface OpenMashupIntent {
  key: string;
  /**
   * Narrows the bucket search. Period keys are date-shaped and unambiguous,
   * but a person's canonical name could collide with a theme slug, so pushes
   * that know the kind say so.
   */
  kind: MashupBucketType | null;
}

interface TabViewIntentStore {
  memoriesView: TabViewMode | null;
  chaptersView: TabViewMode | null;
  openMashup: OpenMashupIntent | null;
  openChapterId: string | null;
  magicFillRatingPrompt: boolean;
  setMemoriesView: (mode: TabViewMode) => void;
  setChaptersView: (mode: TabViewMode) => void;
  setOpenMashupKey: (key: string, kind?: MashupBucketType) => void;
  setOpenChapterId: (id: string) => void;
  setMagicFillRatingPrompt: (show: boolean) => void;
  consumeMemoriesView: () => TabViewMode | null;
  consumeChaptersView: () => TabViewMode | null;
  consumeOpenMashup: () => OpenMashupIntent | null;
  consumeOpenChapterId: () => string | null;
  consumeMagicFillRatingPrompt: () => boolean;
}

export const useTabViewIntentStore = create<TabViewIntentStore>((set, get) => ({
  memoriesView: null,
  chaptersView: null,
  openMashup: null,
  openChapterId: null,
  magicFillRatingPrompt: false,
  setMemoriesView: (mode) => set({ memoriesView: mode }),
  setChaptersView: (mode) => set({ chaptersView: mode }),
  setOpenMashupKey: (key, kind) =>
    set({ openMashup: { key, kind: kind ?? null } }),
  setOpenChapterId: (id) => set({ openChapterId: id }),
  setMagicFillRatingPrompt: (show) => set({ magicFillRatingPrompt: show }),
  consumeMemoriesView: () => {
    const mode = get().memoriesView;
    if (mode) set({ memoriesView: null });
    return mode;
  },
  consumeChaptersView: () => {
    const mode = get().chaptersView;
    if (mode) set({ chaptersView: null });
    return mode;
  },
  consumeOpenMashup: () => {
    const intent = get().openMashup;
    if (intent) set({ openMashup: null });
    return intent;
  },
  consumeOpenChapterId: () => {
    const id = get().openChapterId;
    if (id) set({ openChapterId: null });
    return id;
  },
  consumeMagicFillRatingPrompt: () => {
    const show = get().magicFillRatingPrompt;
    if (show) set({ magicFillRatingPrompt: false });
    return show;
  },
}));
