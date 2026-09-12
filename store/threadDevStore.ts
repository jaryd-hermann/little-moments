import { create } from "zustand";
import { format } from "date-fns";
import type { Thread } from "@/hooks/useThreads";

/** Route param for dev preview thread detail (no Supabase row). */
export const THREAD_DEV_PREVIEW_ID = "__dev_thread__";

export function makeDummyThread(): Thread {
  const today = format(new Date(), "yyyy-MM-dd");
  return {
    id: THREAD_DEV_PREVIEW_ID,
    user_id: "dev",
    entry_id_a: "dev-entry-a",
    entry_id_b: "dev-entry-b",
    connection_type: "place",
    statement: "You're calmest near water.",
    question: "What is it about being near water that settles you?",
    ellie_observation:
      "Both of these moments circle back to water — not as scenery, but as the one place your shoulders actually drop. " +
      "In your grandmother's kitchen you watched the light on the bay through that east-facing window. " +
      "Months later, at the new job, you're still hunting that same hush in the mornings before anyone arrives.",
    questions: [
      "What is it about being near water that settles you?",
    ],
    user_answer: null,
    answered_at: null,
    confidence: 0.88,
    dismissed: false,
    hidden_from_feed: false,
    highlighted: false,
    feedback_sentiment: null,
    created_at: new Date().toISOString(),
    viewed_at: null,
    chronological_index: 1,
    entry_a: {
      id: "dev-entry-a",
      title: "The East-Facing Window",
      body: "There was a window in my grandmother's kitchen that always faced east. Morning light pooled on the table while she made coffee.",
      ai_enhanced_body: null,
      entry_date: today,
      created_at: new Date().toISOString(),
      media: [],
    },
    entry_b: {
      id: "dev-entry-b",
      title: "Before Anyone Gets In",
      body: "First week at the new job. I keep sitting by the window in the mornings before anyone else arrives — same quiet, same light, different city.",
      ai_enhanced_body: null,
      entry_date: format(
        new Date(Date.now() - 21 * 24 * 60 * 60 * 1000),
        "yyyy-MM-dd"
      ),
      created_at: new Date().toISOString(),
      media: [],
    },
  };
}

interface ThreadDevStore {
  dummyThreadEnabled: boolean;
  toggleDummyThread: () => void;
}

export const useThreadDevStore = create<ThreadDevStore>((set) => ({
  dummyThreadEnabled: false,
  toggleDummyThread: () =>
    set((s) => ({ dummyThreadEnabled: !s.dummyThreadEnabled })),
}));
