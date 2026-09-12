import { useCallback, useEffect, useState } from "react";
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
  statement: string | null;
  question: string | null;
  ellie_observation: string;
  questions: string[];
  user_answer: string | null;
  answered_at: string | null;
  confidence: number;
  dismissed: boolean;
  hidden_from_feed: boolean;
  highlighted: boolean;
  feedback_sentiment: "positive" | "negative" | null;
  created_at: string;
  /** First time the owner opened the thread detail view. Null = never opened. */
  viewed_at: string | null;
  /** Stable oldest-first position (1 = first thread ever received). */
  chronological_index: number;
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
    storage_path?: string | null;
    media_type: string;
    taken_at?: string | null;
    paired_video_storage_path?: string | null;
    paired_video_storage_url?: string | null;
  }[];
}

export interface ThreadStats {
  total_connections: number;
  last_analyzed_at: string | null;
  connections_tab_seen_at: string | null;
  recurring_people: Record<string, number>;
  recurring_places: Record<string, number>;
  dominant_themes: Record<string, number>;
}

const THREAD_PAGE_SIZE = 8;

/** Feed/card surfaces — no entry bodies; detail screen loads full rows. */
const THREAD_FEED_SELECT = `
  id,
  user_id,
  entry_id_a,
  entry_id_b,
  connection_type,
  statement,
  question,
  ellie_observation,
  questions,
  user_answer,
  answered_at,
  confidence,
  dismissed,
  hidden_from_feed,
  highlighted,
  feedback_sentiment,
  created_at,
  viewed_at,
  chronological_index,
  entry_a:entries!threads_entry_id_a_fkey(
    id,
    entry_date,
    created_at,
    entry_media(id, storage_url, storage_path, media_type, taken_at)
  ),
  entry_b:entries!threads_entry_id_b_fkey(
    id,
    entry_date,
    created_at,
    entry_media(id, storage_url, storage_path, media_type, taken_at)
  )
`;

function mapThreadRow(t: Record<string, unknown>): Thread {
  const entryA = t.entry_a as
    | (ThreadEntry & { entry_media?: ThreadEntry["media"] })
    | null
    | undefined;
  const entryB = t.entry_b as
    | (ThreadEntry & { entry_media?: ThreadEntry["media"] })
    | null
    | undefined;

  return {
    ...(t as Omit<Thread, "entry_a" | "entry_b" | "chronological_index">),
    statement: (t.statement as string | null | undefined) ?? null,
    question: (t.question as string | null | undefined) ?? null,
    user_answer: (t.user_answer as string | null | undefined) ?? null,
    answered_at: (t.answered_at as string | null | undefined) ?? null,
    hidden_from_feed: (t.hidden_from_feed as boolean | undefined) ?? false,
    highlighted: (t.highlighted as boolean | undefined) ?? false,
    feedback_sentiment:
      (t.feedback_sentiment as Thread["feedback_sentiment"]) ?? null,
    questions: (t.questions as string[]) ?? [],
    viewed_at: (t.viewed_at as string | null | undefined) ?? null,
    chronological_index: Number(t.chronological_index) || 0,
    entry_a: entryA
      ? {
          id: entryA.id,
          title: entryA.title ?? null,
          body: entryA.body ?? "",
          ai_enhanced_body: entryA.ai_enhanced_body ?? null,
          entry_date: entryA.entry_date ?? null,
          created_at: entryA.created_at,
          media: entryA.entry_media ?? entryA.media ?? [],
        }
      : null,
    entry_b: entryB
      ? {
          id: entryB.id,
          title: entryB.title ?? null,
          body: entryB.body ?? "",
          ai_enhanced_body: entryB.ai_enhanced_body ?? null,
          entry_date: entryB.entry_date ?? null,
          created_at: entryB.created_at,
          media: entryB.entry_media ?? entryB.media ?? [],
        }
      : null,
  };
}

export function useThreads() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const subscriptionStatus = useAuthStore(
    (s) => s.profile?.subscription_status ?? "free"
  );

  const [threads, setThreads] = useState<Thread[]>([]);
  const [stats, setStats] = useState<ThreadStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMoreThreads, setHasMoreThreads] = useState(true);
  const [loadingMoreThreads, setLoadingMoreThreads] = useState(false);
  const [fullListLoaded, setFullListLoaded] = useState(false);

  const hasUnlimitedThreads =
    subscriptionStatus === "active" || subscriptionStatus === "trial";
  const isPremium = hasUnlimitedThreads;
  const totalConnections = stats?.total_connections ?? 0;
  const FREE_VISIBLE_LIMIT = 5;

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
        connections_tab_seen_at:
          (data as { connections_tab_seen_at?: string | null })
            .connections_tab_seen_at ?? null,
        recurring_people: (data.recurring_people as Record<string, number>) ?? {},
        recurring_places: (data.recurring_places as Record<string, number>) ?? {},
        dominant_themes: (data.dominant_themes as Record<string, number>) ?? {},
      });
    }
  }, [userId]);

  const fetchThreads = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    setFullListLoaded(false);
    try {
      const { data } = await supabase
        .from("threads")
        .select(THREAD_FEED_SELECT)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(0, THREAD_PAGE_SIZE - 1);

      if (data) {
        setThreads(data.map((row) => mapThreadRow(row as Record<string, unknown>)));
        setHasMoreThreads(data.length === THREAD_PAGE_SIZE);
      } else {
        setThreads([]);
        setHasMoreThreads(false);
      }
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const fetchMoreThreads = useCallback(async () => {
    if (!userId || loadingMoreThreads || !hasMoreThreads || fullListLoaded) {
      return;
    }
    setLoadingMoreThreads(true);
    try {
      const offset = threads.length;
      const { data } = await supabase
        .from("threads")
        .select(THREAD_FEED_SELECT)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(offset, offset + THREAD_PAGE_SIZE - 1);

      if (data?.length) {
        setThreads((prev) => {
          const seen = new Set(prev.map((t) => t.id));
          const next = [...prev];
          for (const row of data) {
            const mapped = mapThreadRow(row as Record<string, unknown>);
            if (!seen.has(mapped.id)) next.push(mapped);
          }
          return next;
        });
        setHasMoreThreads(data.length === THREAD_PAGE_SIZE);
      } else {
        setHasMoreThreads(false);
      }
    } finally {
      setLoadingMoreThreads(false);
    }
  }, [userId, threads.length, loadingMoreThreads, hasMoreThreads, fullListLoaded]);

  /** Lightweight full history for Capsule list / Capture cards (no pagination). */
  const fetchAllThreadsLightweight = useCallback(async () => {
    if (!userId || fullListLoaded) return;
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from("threads")
        .select(THREAD_FEED_SELECT)
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (data) {
        setThreads(data.map((row) => mapThreadRow(row as Record<string, unknown>)));
        setHasMoreThreads(false);
        setFullListLoaded(true);
      }
    } finally {
      setIsLoading(false);
    }
  }, [userId, fullListLoaded]);

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

  const visibleThreads = threads.filter(
    (t) => !t.dismissed && !t.hidden_from_feed
  );

  const dismissThread = useCallback(async (threadId: string) => {
    await supabase
      .from("threads")
      .update({ dismissed: true })
      .eq("id", threadId);
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, dismissed: true } : t))
    );
  }, []);

  const isThreadLocked = useCallback(
    (thread: Thread, _index: number) => {
      if (hasUnlimitedThreads) return false;
      const pos = thread.chronological_index || Infinity;
      return pos > FREE_VISIBLE_LIMIT;
    },
    [hasUnlimitedThreads]
  );

  const connectionsTabSeenAt = stats?.connections_tab_seen_at ?? null;
  useEffect(() => {
    let unseen = 0;
    visibleThreads.forEach((t, i) => {
      if (
        connectionsTabSeenAt &&
        new Date(t.created_at).getTime() <=
          new Date(connectionsTabSeenAt).getTime()
      ) {
        return;
      }
      if (isThreadLocked(t, i)) return;
      unseen += 1;
    });
    useUnseenStore.getState().setUnseenThreadCount(unseen);
  }, [visibleThreads, isThreadLocked, connectionsTabSeenAt]);

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

  const markThreadViewedLocal = useCallback((threadId: string) => {
    setThreads((prev) =>
      prev.map((t) =>
        t.id === threadId && t.viewed_at == null
          ? { ...t, viewed_at: new Date().toISOString() }
          : t
      )
    );
  }, []);

  const markConnectionsTabSeenLocal = useCallback((seenAt: string) => {
    setStats((prev) =>
      prev
        ? { ...prev, connections_tab_seen_at: seenAt }
        : {
            total_connections: 0,
            last_analyzed_at: null,
            connections_tab_seen_at: seenAt,
            recurring_people: {},
            recurring_places: {},
            dominant_themes: {},
          }
    );
  }, []);

  const updateThreadAnswerLocal = useCallback(
    (threadId: string, answer: string) => {
      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId
            ? {
                ...t,
                user_answer: answer,
                answered_at: new Date().toISOString(),
              }
            : t
        )
      );
    },
    []
  );

  const updateThreadFeedbackLocal = useCallback(
    (
      threadId: string,
      patch: Partial<
        Pick<Thread, "hidden_from_feed" | "highlighted" | "feedback_sentiment">
      >
    ) => {
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, ...patch } : t))
      );
    },
    []
  );

  return {
    threads,
    visibleThreads,
    stats,
    totalConnections,
    isLoading,
    isPremium,
    hasMoreThreads,
    loadingMoreThreads,
    fetchAll,
    fetchThreads,
    fetchMoreThreads,
    fetchAllThreadsLightweight,
    fetchStats,
    threadsForEntry,
    todayThreads,
    dismissThread,
    isThreadLocked,
    markThreadViewedLocal,
    markConnectionsTabSeenLocal,
    updateThreadAnswerLocal,
    updateThreadFeedbackLocal,
  };
}
