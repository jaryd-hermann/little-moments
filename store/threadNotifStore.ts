import { create } from "zustand";

interface ThreadNotifStore {
  pendingThreadId: string | null;
  setPendingThreadId: (id: string | null) => void;
  consume: () => string | null;
}

export const useThreadNotifStore = create<ThreadNotifStore>((set, get) => ({
  pendingThreadId: null,
  setPendingThreadId: (id) => set({ pendingThreadId: id }),
  consume: () => {
    const id = get().pendingThreadId;
    if (id) set({ pendingThreadId: null });
    return id;
  },
}));
