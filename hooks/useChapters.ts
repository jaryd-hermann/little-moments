import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import { useUnseenStore } from "@/store/unseenStore";
import {
  parseChapterRow,
  type ChapterRecord,
} from "@/lib/chapters";
import { enqueueChapterCoversForPrefetch } from "@/lib/mediaPrefetch";

// Free-tier paywalling — must match the server-side constants in
// supabase/functions/cron-chapters/index.ts. First N weekly chapters
// (chronologically) are openable; chapters past this are stored as locked
// teasers; tapping a locked chapter routes to the paywall.
const FREE_VISIBLE_LIMIT = 4;

export function useChapters() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const subscriptionStatus = useAuthStore(
    (s) => s.profile?.subscription_status ?? "free"
  );
  // Trial counts as paid (mirrors useThreads.hasUnlimitedThreads).
  const hasUnlimitedChapters =
    subscriptionStatus === "active" || subscriptionStatus === "trial";

  const [chapters, setChapters] = useState<ChapterRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchChapters = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from("chapters")
      .select("*")
      .eq("user_id", userId)
      .order("chapter_number", { ascending: false });

    if (error) {
      console.log("[useChapters] fetch error:", error.message);
    }
    if (data) {
      const parsed = data
        .map((r) => parseChapterRow(r))
        .filter((r): r is ChapterRecord => r != null)
        // Hide legacy monthly chapters — only weekly chapters surface now.
        .filter((r) => Boolean(r.ref_week_start_date));
      setChapters(parsed);
      enqueueChapterCoversForPrefetch(parsed);
    }
    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchChapters();
  }, [fetchChapters]);

  /**
   * Map chapter id → 1-indexed chronological position (oldest = 1). The
   * unlock gate uses chapter_number-derived position rather than display
   * index because the user owns the first N chapters they ever received,
   * regardless of the sort order of the current view. Mirrors useThreads.
   */
  const positionByChapterId = useMemo(() => {
    const sortedOldestFirst = [...chapters].sort(
      (a, b) => a.chapter_number - b.chapter_number
    );
    const map = new Map<string, number>();
    sortedOldestFirst.forEach((c, idx) => {
      map.set(c.id, idx + 1);
    });
    return map;
  }, [chapters]);

  const isChapterLocked = useCallback(
    (chapter: ChapterRecord) => {
      if (hasUnlimitedChapters) return false;
      const pos = positionByChapterId.get(chapter.id) ?? Infinity;
      return pos > FREE_VISIBLE_LIMIT;
    },
    [hasUnlimitedChapters, positionByChapterId]
  );

  // Push the count of viewable-and-unseen chapters into `useUnseenStore` so
  // the tab bar can drive its attention animation. Locked chapters are
  // excluded — the user can't actually open them.
  //
  // We also subscribe to `viewedChapterIds` (the cross-screen "viewed in
  // this session" set written by `markChapterViewed`) so that any of the
  // multiple `useChapters` instances mounted in the tree (chapters tab +
  // memories tab) collapse the count to 0 the moment a chapter is opened
  // — without waiting for the local `chapters` cache to refetch. Without
  // this, an instance whose local cache still has `viewed_at = null` would
  // re-write a stale positive count after the viewer closed and the
  // tab-bar shimmer would stay on.
  const viewedChapterIds = useUnseenStore((s) => s.viewedChapterIds);
  useEffect(() => {
    let unseen = 0;
    chapters.forEach((c) => {
      if (c.viewed_at != null) return;
      if (viewedChapterIds.has(c.id)) return;
      if (isChapterLocked(c)) return;
      unseen += 1;
    });
    useUnseenStore.getState().setUnseenChapterCount(unseen);
  }, [chapters, isChapterLocked, viewedChapterIds]);

  /** Optimistic local flip — caller pairs this with `markChapterViewed` to also persist. */
  const markChapterViewedLocal = useCallback((chapterId: string) => {
    setChapters((prev) =>
      prev.map((c) =>
        c.id === chapterId && c.viewed_at == null
          ? { ...c, viewed_at: new Date().toISOString() }
          : c
      )
    );
  }, []);

  const latestChapter = chapters.length > 0 ? chapters[0] : null;

  return {
    chapters,
    latestChapter,
    isLoading,
    fetchChapters,
    markChapterViewedLocal,
    isChapterLocked,
    hasUnlimitedChapters,
  };
}
