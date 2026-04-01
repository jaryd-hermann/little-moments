import { create } from "zustand";

interface ChapterNotifStore {
  pendingChapterId: string | null;
  setPendingChapterId: (id: string | null) => void;
  consume: () => string | null;
}

export const useChapterNotifStore = create<ChapterNotifStore>((set, get) => ({
  pendingChapterId: null,
  setPendingChapterId: (id) => set({ pendingChapterId: id }),
  consume: () => {
    const id = get().pendingChapterId;
    if (id) set({ pendingChapterId: null });
    return id;
  },
}));
