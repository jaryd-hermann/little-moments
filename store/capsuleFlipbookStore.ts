import { create } from "zustand";

interface CapsuleFlipbookStore {
  pinnedOnly: boolean;
  setPinnedOnly: (v: boolean) => void;
  togglePinnedOnly: () => void;
  flipbookShuffleEnabled: boolean;
  /** New random seed on each shuffle enable (true random order). */
  flipbookShuffleSeed: number;
  /** Tap: off → random order; on → chronological. */
  toggleFlipbookShuffle: () => void;
}

export const useCapsuleFlipbookStore = create<CapsuleFlipbookStore>((set) => ({
  pinnedOnly: false,
  setPinnedOnly: (v) => set({ pinnedOnly: v }),
  togglePinnedOnly: () => set((s) => ({ pinnedOnly: !s.pinnedOnly })),
  flipbookShuffleEnabled: false,
  flipbookShuffleSeed: 0,
  toggleFlipbookShuffle: () =>
    set((s) =>
      s.flipbookShuffleEnabled
        ? { flipbookShuffleEnabled: false }
        : {
            flipbookShuffleEnabled: true,
            flipbookShuffleSeed:
              1 + Math.floor(Math.random() * 2147483646),
          }
    ),
}));
