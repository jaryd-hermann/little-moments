import { create } from "zustand";

interface CapsuleFlipbookStore {
  pinnedOnly: boolean;
  setPinnedOnly: (v: boolean) => void;
  togglePinnedOnly: () => void;
  flipbookShuffleEnabled: boolean;
  /** New random seed on each shuffle enable (true random order). */
  flipbookShuffleSeed: number;
  /** Tap: shuffled → chronological; chronological → a fresh random order. */
  toggleFlipbookShuffle: () => void;
  /**
   * Moment the flipbook should open on, set by recap pushes ("this day last
   * year"). Cleared by the flipbook once it has landed on that card.
   */
  focusEntryId: string | null;
  setFocusEntryId: (id: string | null) => void;
}

const randomSeed = () => 1 + Math.floor(Math.random() * 2147483646);

export const useCapsuleFlipbookStore = create<CapsuleFlipbookStore>((set) => ({
  pinnedOnly: false,
  setPinnedOnly: (v) => set({ pinnedOnly: v }),
  togglePinnedOnly: () => set((s) => ({ pinnedOnly: !s.pinnedOnly })),
  // Flipbook opens shuffled so the deck feels different every session.
  flipbookShuffleEnabled: true,
  flipbookShuffleSeed: randomSeed(),
  toggleFlipbookShuffle: () =>
    set((s) =>
      s.flipbookShuffleEnabled
        ? { flipbookShuffleEnabled: false }
        : {
            flipbookShuffleEnabled: true,
            flipbookShuffleSeed: randomSeed(),
          }
    ),
  focusEntryId: null,
  setFocusEntryId: (focusEntryId) => set({ focusEntryId }),
}));
