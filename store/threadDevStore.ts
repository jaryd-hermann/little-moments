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
    connection_type: "thematic",
    ellie_observation:
      "**Both of these are about a place that held something for you before you knew you needed it.** " +
      "In your grandmother's kitchen, that east-facing window wasn't just light—it was steadiness before you had words for wanting to belong somewhere. " +
      "Months later, at the new job, you're still hunting that same hush in the mornings before anyone arrives, like you're carrying the old room forward until this building feels safe enough to let you in.",
    questions: [
      "What other places have felt like that for you?",
      "Is there anywhere that feels that way now?",
    ],
    confidence: 0.88,
    dismissed: false,
    created_at: new Date().toISOString(),
    entry_a: {
      id: "dev-entry-a",
      title: "The East-Facing Window",
      body: "There was a window in my grandmother's kitchen that always faced east. Morning light pooled on the table while she made coffee. I didn't know then that I'd still think about that room years later.",
      ai_enhanced_body: null,
      entry_date: today,
      created_at: new Date().toISOString(),
    },
    entry_b: {
      id: "dev-entry-b",
      title: "Before Anyone Gets In",
      body: "First week at the new job. I keep sitting by the window in the mornings before anyone else arrives — same quiet, same light, different city.",
      ai_enhanced_body: null,
      entry_date: format(
        new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
        "yyyy-MM-dd"
      ),
      created_at: new Date().toISOString(),
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
