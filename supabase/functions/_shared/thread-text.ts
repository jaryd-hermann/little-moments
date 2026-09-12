/** Strip `**bold**` markers for push titles / SMS-style previews. */
export function observationPlainPreview(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*/g, "").trim();
}

export function extractBoldFromObservation(text: string): string | null {
  const match = text.match(/\*\*([^*]+)\*\*/);
  return match?.[1]?.trim() ?? null;
}

/** Normalize LLM thread output into DB columns. */
export function normalizeThreadCopy(result: Record<string, unknown>): {
  statement: string;
  question: string;
  questions: string[];
  ellie_observation: string;
} {
  const ellie_observation = String(result.ellie_observation ?? "").trim();
  const rawQuestion =
    String(result.question ?? "").trim() ||
    (Array.isArray(result.questions)
      ? String(result.questions[0] ?? "").trim()
      : "");
  const statement =
    String(result.statement ?? "").trim() ||
    extractBoldFromObservation(ellie_observation) ||
    observationPlainPreview(ellie_observation).split(/[.!?]/)[0]?.trim() ||
    "";
  const question = rawQuestion;
  return {
    statement,
    question,
    questions: question ? [question] : [],
    ellie_observation,
  };
}
