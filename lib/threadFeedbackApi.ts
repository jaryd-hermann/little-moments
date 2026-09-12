import { supabase } from "@/lib/supabase";
import type {
  ThreadFeedbackAction,
  ThreadFeedbackChipId,
  ThreadFeedbackSentiment,
} from "@/lib/threadFeedback";

export interface SubmitThreadFeedbackArgs {
  threadId: string;
  sentiment: ThreadFeedbackSentiment;
  chips: ThreadFeedbackChipId[];
  note?: string;
  action: ThreadFeedbackAction;
}

export interface SubmitThreadFeedbackResult {
  ok: boolean;
  hidden_from_feed?: boolean;
  highlighted?: boolean;
  feedback_sentiment?: ThreadFeedbackSentiment;
}

export async function submitThreadFeedback(
  args: SubmitThreadFeedbackArgs
): Promise<SubmitThreadFeedbackResult> {
  const { data, error } = await supabase.functions.invoke<SubmitThreadFeedbackResult>(
    "submit-thread-feedback",
    { body: args }
  );

  if (error) {
    console.warn("[submitThreadFeedback] invoke failed:", error.message);
    return { ok: false };
  }

  return data ?? { ok: false };
}

/** After saving a thread answer, re-embed linked entries with answer context. */
export async function refreshThreadEntryEmbeddings(
  threadId: string
): Promise<void> {
  const { error } = await supabase.functions.invoke("refresh-thread-entry-embeddings", {
    body: { thread_id: threadId },
  });
  if (error) {
    console.warn("[refreshThreadEntryEmbeddings] invoke failed:", error.message);
  }
}
