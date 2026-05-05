import { create } from "zustand";

/**
 * Process-global "unseen content" counters consumed by `CustomTabBar` to drive
 * the slow-rotate + shimmer attention loop on the Connect (threads) and
 * Chapters tab icons.
 *
 * Writers:
 *   - `useThreads` calls `setUnseenThreadCount` after every fetch.
 *   - `useChapters` calls `setUnseenChapterCount` after every fetch.
 *   - `markThreadViewed` / `markChapterViewed` decrement optimistically.
 *
 * Readers:
 *   - `CustomTabBar` to gate the icon attention animation.
 */
interface UnseenStore {
  unseenThreadCount: number;
  unseenChapterCount: number;
  setUnseenThreadCount: (n: number) => void;
  setUnseenChapterCount: (n: number) => void;
  /** Decrement by one (clamped at 0) — used when a single item is marked viewed. */
  decrementUnseenThread: () => void;
  decrementUnseenChapter: () => void;

  /**
   * IDs the user has opened during this app session. The list-rendering
   * screens (`brain.tsx`, `chapters.tsx`) own their own copy of the thread /
   * chapter list — when the detail screen marks something viewed there's no
   * easy way to mutate that other hook instance without a refetch. Cards can
   * subscribe to these sets and treat membership as "viewed" so the shimmer
   * disappears the moment the user comes back from the detail screen.
   */
  viewedThreadIds: Set<string>;
  viewedChapterIds: Set<string>;
  recordThreadViewed: (id: string) => void;
  recordChapterViewed: (id: string) => void;

  /**
   * Dev-only "force shimmer" overrides used by the Settings dev panel to
   * preview the tab-bar attention animation without needing real unseen
   * content in the database. When true, `CustomTabBar` treats the
   * corresponding tab as having unseen content regardless of the real count.
   */
  forceUnseenThreadAttention: boolean;
  forceUnseenChapterAttention: boolean;
  toggleForceUnseenThreadAttention: () => void;
  toggleForceUnseenChapterAttention: () => void;
}

export const useUnseenStore = create<UnseenStore>((set) => ({
  unseenThreadCount: 0,
  unseenChapterCount: 0,
  setUnseenThreadCount: (n) => set({ unseenThreadCount: Math.max(0, n) }),
  setUnseenChapterCount: (n) => set({ unseenChapterCount: Math.max(0, n) }),
  decrementUnseenThread: () =>
    set((s) => ({ unseenThreadCount: Math.max(0, s.unseenThreadCount - 1) })),
  decrementUnseenChapter: () =>
    set((s) => ({ unseenChapterCount: Math.max(0, s.unseenChapterCount - 1) })),

  viewedThreadIds: new Set<string>(),
  viewedChapterIds: new Set<string>(),
  recordThreadViewed: (id) =>
    set((s) => {
      if (s.viewedThreadIds.has(id)) return s;
      const next = new Set(s.viewedThreadIds);
      next.add(id);
      return { viewedThreadIds: next };
    }),
  recordChapterViewed: (id) =>
    set((s) => {
      if (s.viewedChapterIds.has(id)) return s;
      const next = new Set(s.viewedChapterIds);
      next.add(id);
      return { viewedChapterIds: next };
    }),

  forceUnseenThreadAttention: false,
  forceUnseenChapterAttention: false,
  toggleForceUnseenThreadAttention: () =>
    set((s) => ({
      forceUnseenThreadAttention: !s.forceUnseenThreadAttention,
    })),
  toggleForceUnseenChapterAttention: () =>
    set((s) => ({
      forceUnseenChapterAttention: !s.forceUnseenChapterAttention,
    })),
}));
