import type { PostHog } from "posthog-react-native";
import { refreshThreadEntryEmbeddings } from "@/lib/threadFeedbackApi";
import { supabase } from "@/lib/supabase";
import { useUnseenStore } from "@/store/unseenStore";

/**
 * Mark the Connect tab as seen — resets the tab-bar unread badge.
 * Unread is driven by threads created since this timestamp, not per-thread detail visits.
 */
export async function markConnectionsTabSeen(args: {
  posthog?: PostHog | null;
}): Promise<string | null> {
  const { posthog } = args;
  const { data, error } = await supabase.rpc("mark_connections_tab_seen");
  if (error) {
    console.warn("[markConnectionsTabSeen] rpc failed:", error.message);
    return null;
  }
  useUnseenStore.getState().setUnseenThreadCount(0);
  posthog?.capture("connections_tab_seen", {
    seen_at: data as string,
  });
  return (data as string) ?? null;
}

/** Persist a journal-style answer on a thread. */
export async function saveThreadAnswer(
  threadId: string,
  answer: string
): Promise<{ ok: boolean }> {
  const trimmed = answer.trim();
  if (!trimmed) return { ok: false };
  const { error } = await supabase
    .from("threads")
    .update({
      user_answer: trimmed,
      answered_at: new Date().toISOString(),
    })
    .eq("id", threadId);
  if (error) {
    console.warn("[saveThreadAnswer] update failed:", error.message);
    return { ok: false };
  }
  void refreshThreadEntryEmbeddings(threadId);
  return { ok: true };
}
