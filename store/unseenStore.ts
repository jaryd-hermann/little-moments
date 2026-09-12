import { create } from "zustand";

/**
 * Process-global "unseen content" counters consumed by `CustomTabBar` to drive
 * the slow-rotate attention loop on the Connect (threads) and Chapters tab
 * icons.
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

  /**
   * High-water mark of how much unseen content the user has already been
   * shown on each tab, recorded when they actually visit it.
   *
   * The raw counts can't drive the tab icon on their own: they're recomputed
   * from server data on every fetch, so visiting the tab without opening an
   * individual item left the icon spinning forever. Comparing against this
   * mark means "you've seen that there were 3 waiting" silences the icon,
   * while a 4th arriving still wakes it up.
   */
  threadsSeenAtCount: number;
  chaptersSeenAtCount: number;
  markThreadsTabSeen: () => void;
  markChaptersTabSeen: () => void;
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
  // Clamp the seen mark down with the count, so it stays a mark of "seen"
  // rather than drifting above the real number and masking new content.
  setUnseenThreadCount: (n) =>
    set((s) => {
      const next = Math.max(0, n);
      return {
        unseenThreadCount: next,
        threadsSeenAtCount: Math.min(s.threadsSeenAtCount, next),
      };
    }),
  setUnseenChapterCount: (n) =>
    set((s) => {
      const next = Math.max(0, n);
      return {
        unseenChapterCount: next,
        chaptersSeenAtCount: Math.min(s.chaptersSeenAtCount, next),
      };
    }),
  decrementUnseenThread: () =>
    set((s) => {
      const next = Math.max(0, s.unseenThreadCount - 1);
      return {
        unseenThreadCount: next,
        threadsSeenAtCount: Math.min(s.threadsSeenAtCount, next),
      };
    }),
  decrementUnseenChapter: () =>
    set((s) => {
      const next = Math.max(0, s.unseenChapterCount - 1);
      return {
        unseenChapterCount: next,
        chaptersSeenAtCount: Math.min(s.chaptersSeenAtCount, next),
      };
    }),

  threadsSeenAtCount: 0,
  chaptersSeenAtCount: 0,
  markThreadsTabSeen: () =>
    set((s) => ({ threadsSeenAtCount: s.unseenThreadCount })),
  markChaptersTabSeen: () =>
    set((s) => ({ chaptersSeenAtCount: s.unseenChapterCount })),

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
