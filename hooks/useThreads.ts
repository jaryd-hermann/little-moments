import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import { useUnseenStore } from "@/store/unseenStore";
import { syncOneSignalThreadTags } from "@/lib/onesignal";
import { format } from "date-fns";

export interface Thread {
  id: string;
  user_id: string;
  entry_id_a: string;
  entry_id_b: string;
  connection_type: string;
  ellie_observation: string;
  questions: string[];
  confidence: number;
  dismissed: boolean;
  created_at: string;
  /** First time the owner opened the thread detail view. Null = never opened. */
  viewed_at: string | null;
  entry_a?: ThreadEntry | null;
  entry_b?: ThreadEntry | null;
}

export interface ThreadEntry {
  id: string;
  title: string | null;
  body: string;
  ai_enhanced_body: string | null;
  entry_date: string | null;
  created_at: string;
  media?: {
    id: string;
    storage_url: string | null;
    media_type: string;
    taken_at?: string | null;
  }[];
}

export interface ThreadStats {
  total_connections: number;
  last_analyzed_at: string | null;
  recurring_people: Record<string, number>;
  recurring_places: Record<string, number>;
  dominant_themes: Record<string, number>;
}

export function useThreads() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const subscriptionStatus = useAuthStore(
    (s) => s.profile?.subscription_status ?? "free"
  );

  const [threads, setThreads] = useState<Thread[]>([]);
  const [stats, setStats] = useState<ThreadStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Trial counts as paid (matches server-side gating in
  // supabase/functions/process-threads/index.ts and cron-threads-nightly).
  const hasUnlimitedThreads =
    subscriptionStatus === "active" || subscriptionStatus === "trial";
  // `isPremium` retained for any external consumer that may still read it.
  const isPremium = hasUnlimitedThreads;
  const totalConnections = stats?.total_connections ?? 0;
  // First N threads (chronologically) are openable. Threads past this are
  // stored as locked teasers; tapping a locked card routes to the paywall.
  // Keep in sync with the two server functions referenced above.
  const FREE_VISIBLE_LIMIT = 5;

  const fetchThreads = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from("threads")
        .select(
          `
          *,
          entry_a:entries!threads_entry_id_a_fkey(id, title, body, ai_enhanced_body, entry_date, created_at, entry_media(id, storage_url, media_type, taken_at)),
          entry_b:entries!threads_entry_id_b_fkey(id, title, body, ai_enhanced_body, entry_date, created_at, entry_media(id, storage_url, media_type, taken_at))
        `
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (data) {
        const mapped: Thread[] = data.map((t) => ({
          ...t,
          questions: (t.questions as string[]) ?? [],
          viewed_at: (t as { viewed_at?: string | null }).viewed_at ?? null,
          entry_a: t.entry_a
            ? { ...t.entry_a, media: t.entry_a.entry_media ?? [] }
            : null,
          entry_b: t.entry_b
            ? { ...t.entry_b, media: t.entry_b.entry_media ?? [] }
            : null,
        }));
        setThreads(mapped);
      }
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const fetchStats = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("user_thread_stats")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (data) {
      setStats({
        total_connections: data.total_connections ?? 0,
        last_analyzed_at: data.last_analyzed_at,
        recurring_people: (data.recurring_people as Record<string, number>) ?? {},
        recurring_places: (data.recurring_places as Record<string, number>) ?? {},
        dominant_themes: (data.dominant_themes as Record<string, number>) ?? {},
      });
    }
  }, [userId]);

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchThreads(), fetchStats()]);
  }, [fetchThreads, fetchStats]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const threadsForEntry = useCallback(
    (entryId: string) =>
      threads.filter(
        (t) =>
          !t.dismissed &&
          (t.entry_id_a === entryId || t.entry_id_b === entryId)
      ),
    [threads]
  );

  const todayThreads = useCallback(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    return threads.filter(
      (t) =>
        !t.dismissed &&
        (t.entry_a?.entry_date === today || t.entry_b?.entry_date === today)
    );
  }, [threads]);

  const visibleThreads = threads.filter((t) => !t.dismissed);

  /**
   * Map thread id → 1-indexed chronological position (oldest = 1). The
   * unlock gate uses this rather than display index because the user owns
   * the first N threads they ever received, regardless of the sort order
   * of the current view.
   */
  const positionByThreadId = useMemo(() => {
    const sortedOldestFirst = [...threads].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const map = new Map<string, number>();
    sortedOldestFirst.forEach((t, idx) => {
      map.set(t.id, idx + 1);
    });
    return map;
  }, [threads]);

  const dismissThread = useCallback(
    async (threadId: string) => {
      await supabase
        .from("threads")
        .update({ dismissed: true })
        .eq("id", threadId);
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, dismissed: true } : t))
      );
    },
    []
  );

  const isThreadLocked = useCallback(
    (thread: Thread, _index: number) => {
      if (hasUnlimitedThreads) return false;
      const pos = positionByThreadId.get(thread.id) ?? Infinity;
      return pos > FREE_VISIBLE_LIMIT;
    },
    [hasUnlimitedThreads, positionByThreadId]
  );

  /**
   * Push the count of viewable-and-unseen threads into `useUnseenStore` so
   * the tab bar can drive its attention animation without subscribing to the
   * full thread list. Locked threads are excluded — the user can't actually
   * open them.
   *
   * We also subscribe to `viewedThreadIds` (cross-screen session set written
   * by `markThreadViewed`) so the count drops to 0 immediately when any
   * `useThreads` instance opens a thread — without needing the local cache
   * to refetch. Otherwise a stale positive count from a different instance
   * could keep the tab-bar shimmer running after the user returned.
   */
  const viewedThreadIds = useUnseenStore((s) => s.viewedThreadIds);
  useEffect(() => {
    let unseen = 0;
    visibleThreads.forEach((t, i) => {
      if (t.viewed_at != null) return;
      if (viewedThreadIds.has(t.id)) return;
      if (isThreadLocked(t, i)) return;
      unseen += 1;
    });
    useUnseenStore.getState().setUnseenThreadCount(unseen);
  }, [visibleThreads, isThreadLocked, viewedThreadIds]);

  // Re-tag OneSignal whenever subscription tier or thread totals change so we
  // can run marketing campaigns by status / thread count from the dashboard.
  useEffect(() => {
    syncOneSignalThreadTags({
      subscription_status: subscriptionStatus,
      is_paid: hasUnlimitedThreads ? "true" : "false",
      total_threads: String(totalConnections),
      visible_threads: String(
        hasUnlimitedThreads
          ? totalConnections
          : Math.min(totalConnections, FREE_VISIBLE_LIMIT)
      ),
    });
  }, [subscriptionStatus, hasUnlimitedThreads, totalConnections]);

  /** Optimistically flip viewed_at locally so the in-feed shimmer drops immediately. */
  const markThreadViewedLocal = useCallback((threadId: string) => {
    setThreads((prev) =>
      prev.map((t) =>
        t.id === threadId && t.viewed_at == null
          ? { ...t, viewed_at: new Date().toISOString() }
          : t
      )
    );
  }, []);

  return {
    threads,
    visibleThreads,
    stats,
    totalConnections,
    isLoading,
    isPremium,
    fetchAll,
    fetchThreads,
    fetchStats,
    threadsForEntry,
    todayThreads,
    dismissThread,
    isThreadLocked,
    markThreadViewedLocal,
  };
}
