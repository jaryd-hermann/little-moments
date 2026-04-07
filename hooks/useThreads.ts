import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
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
  media?: { id: string; storage_url: string | null; media_type: string }[];
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

  const isPremium = subscriptionStatus === "active";
  const totalConnections = stats?.total_connections ?? 0;
  const FREE_THREAD_LIMIT = 3;

  const fetchThreads = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from("threads")
        .select(
          `
          *,
          entry_a:entries!threads_entry_id_a_fkey(id, title, body, ai_enhanced_body, entry_date, created_at, entry_media(id, storage_url, media_type)),
          entry_b:entries!threads_entry_id_b_fkey(id, title, body, ai_enhanced_body, entry_date, created_at, entry_media(id, storage_url, media_type))
        `
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (data) {
        const mapped: Thread[] = data.map((t) => ({
          ...t,
          questions: (t.questions as string[]) ?? [],
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
    (thread: Thread, index: number) => {
      if (isPremium) return false;
      return index >= FREE_THREAD_LIMIT;
    },
    [isPremium]
  );

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
  };
}
