import { create } from "zustand";

export type TabViewMode = "list" | "grid" | "feed";

interface TabViewIntentStore {
  memoriesView: TabViewMode | null;
  chaptersView: TabViewMode | null;
  openMashupKey: string | null;
  openChapterId: string | null;
  setMemoriesView: (mode: TabViewMode) => void;
  setChaptersView: (mode: TabViewMode) => void;
  setOpenMashupKey: (key: string) => void;
  setOpenChapterId: (id: string) => void;
  consumeMemoriesView: () => TabViewMode | null;
  consumeChaptersView: () => TabViewMode | null;
  consumeOpenMashupKey: () => string | null;
  consumeOpenChapterId: () => string | null;
}

export const useTabViewIntentStore = create<TabViewIntentStore>((set, get) => ({
  memoriesView: null,
  chaptersView: null,
  openMashupKey: null,
  openChapterId: null,
  setMemoriesView: (mode) => set({ memoriesView: mode }),
  setChaptersView: (mode) => set({ chaptersView: mode }),
  setOpenMashupKey: (key) => set({ openMashupKey: key }),
  setOpenChapterId: (id) => set({ openChapterId: id }),
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
  consumeOpenMashupKey: () => {
    const key = get().openMashupKey;
    if (key) set({ openMashupKey: null });
    return key;
  },
  consumeOpenChapterId: () => {
    const id = get().openChapterId;
    if (id) set({ openChapterId: null });
    return id;
  },
}));
