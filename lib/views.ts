import type { PostHog } from "posthog-react-native";
import { supabase } from "@/lib/supabase";
import { useUnseenStore } from "@/store/unseenStore";

/**
 * Mark a thread as viewed by its owner, idempotently.
 *
 * - Sets `threads.viewed_at` only if it's still null (so we capture the
 *   first-view timestamp, not the latest open).
 * - Decrements the in-app `unseenThreadCount` so the tab bar shimmer stops
 *   the moment the user lands on the detail screen.
 * - Fires `thread_viewed` to PostHog with `was_unseen` so we can compute
 *   "share of threads ever opened" and time-to-view distributions.
 *
 * Safe to call repeatedly — subsequent calls hit the idempotent UPDATE and
 * skip the analytics event.
 */
export async function markThreadViewed(args: {
  threadId: string;
  posthog: PostHog | null | undefined;
  /** Optional metadata for richer PostHog properties. */
  connectionType?: string | null;
  createdAt?: string | null;
  /** Already-known viewed_at (from cached row). When provided and non-null, we skip the network round-trip. */
  alreadyViewedAt?: string | null;
}): Promise<{ wasUnseen: boolean }> {
  const { threadId, posthog, connectionType, createdAt, alreadyViewedAt } =
    args;

  if (alreadyViewedAt) {
    return { wasUnseen: false };
  }

  // Conditional update so we only flip the bit once per thread per user.
  const { data, error } = await supabase
    .from("threads")
    .update({ viewed_at: new Date().toISOString() })
    .eq("id", threadId)
    .is("viewed_at", null)
    .select("id, viewed_at")
    .maybeSingle();

  if (error) {
    console.warn("[markThreadViewed] update failed:", error.message);
    return { wasUnseen: false };
  }

  const wasUnseen = !!data;
  // Always record the in-session view so any other mounted list (with its
  // own cached thread row) can drop its shimmer too. Cheap to do
  // unconditionally.
  useUnseenStore.getState().recordThreadViewed(threadId);
  if (wasUnseen) {
    useUnseenStore.getState().decrementUnseenThread();
    posthog?.capture("thread_viewed", {
      thread_id: threadId,
      connection_type: connectionType ?? null,
      was_unseen: true,
      ms_since_created:
        createdAt != null
          ? Math.max(0, Date.now() - new Date(createdAt).getTime())
          : null,
    });
  }

  return { wasUnseen };
}

/**
 * Mark a chapter as viewed by its owner, idempotently. Same contract as
 * `markThreadViewed` but for `chapters.viewed_at`. Fires `chapter_viewed` —
 * complementary to the existing `viewed_chapter` (which fires every open);
 * `chapter_viewed` only fires the first time, so PostHog can distinguish
 * first-views from re-reads.
 */
export async function markChapterViewed(args: {
  chapterId: string;
  posthog: PostHog | null | undefined;
  chapterNumber?: number | null;
  refWeekStartDate?: string | null;
  createdAt?: string | null;
  alreadyViewedAt?: string | null;
}): Promise<{ wasUnseen: boolean }> {
  const {
    chapterId,
    posthog,
    chapterNumber,
    refWeekStartDate,
    createdAt,
    alreadyViewedAt,
  } = args;

  if (alreadyViewedAt) {
    return { wasUnseen: false };
  }

  const { data, error } = await supabase
    .from("chapters")
    .update({ viewed_at: new Date().toISOString() })
    .eq("id", chapterId)
    .is("viewed_at", null)
    .select("id, viewed_at")
    .maybeSingle();

  if (error) {
    console.warn("[markChapterViewed] update failed:", error.message);
    return { wasUnseen: false };
  }

  const wasUnseen = !!data;
  useUnseenStore.getState().recordChapterViewed(chapterId);
  if (wasUnseen) {
    useUnseenStore.getState().decrementUnseenChapter();
    posthog?.capture("chapter_viewed", {
      chapter_id: chapterId,
      chapter_number: chapterNumber ?? null,
      ref_week_start_date: refWeekStartDate ?? null,
      was_unseen: true,
      ms_since_created:
        createdAt != null
          ? Math.max(0, Date.now() - new Date(createdAt).getTime())
          : null,
    });
  }

  return { wasUnseen };
}
