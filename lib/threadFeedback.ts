/** Quick-feedback chip ids — stored on thread_feedback.chips and aggregated for model tuning. */

export const THREAD_FEEDBACK_POSITIVE_CHIPS = [
  { id: "more_like_this", label: "More like this" },
  { id: "surprising", label: "Surprising" },
  { id: "made_me_reflect", label: "Made me reflect" },
  { id: "beautifully_put", label: "Beautifully put" },
] as const;

export const THREAD_FEEDBACK_NEGATIVE_CHIPS = [
  { id: "not_relevant", label: "Not relevant" },
  { id: "too_obvious", label: "Too obvious" },
  { id: "wrong_vibe", label: "Wrong vibe" },
  { id: "not_this_theme", label: "Not this theme" },
] as const;

export type ThreadFeedbackSentiment = "positive" | "negative";

export type ThreadFeedbackAction = "none" | "hidden" | "highlighted";

export type ThreadFeedbackChipId =
  | (typeof THREAD_FEEDBACK_POSITIVE_CHIPS)[number]["id"]
  | (typeof THREAD_FEEDBACK_NEGATIVE_CHIPS)[number]["id"];

export function threadFeedbackChipsForSentiment(sentiment: ThreadFeedbackSentiment) {
  return sentiment === "positive"
    ? THREAD_FEEDBACK_POSITIVE_CHIPS
    : THREAD_FEEDBACK_NEGATIVE_CHIPS;
}

/** Human label for the purple learn callout in the feedback sheet. */
export function threadFeedbackLearnTopic(args: {
  connectionType: string | null | undefined;
  statement: string;
}): string {
  const type = args.connectionType ?? "pattern";
  const labels: Record<string, string> = {
    place: "recurring places",
    person: "people from your past",
    pattern: "longitudinal patterns",
    evolution: "how you've changed",
    emotional: "emotional patterns",
    thematic: "recurring themes",
  };
  return labels[type] ?? "patterns like this";
}
