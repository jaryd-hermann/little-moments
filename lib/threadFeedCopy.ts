export const MAX_FEED_STATEMENT_WORDS = 8;
export const MAX_FEED_QUESTION_WORDS = 10;

export function feedWordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function normalizeSpaces(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function isValidFeedStatement(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  const s = text.trim();
  if (feedWordCount(s) > MAX_FEED_STATEMENT_WORDS) return false;
  if (s.length > 56) return false;
  if (/—/.test(s)) return false;
  return true;
}

export function isValidFeedQuestion(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  const q = text.trim();
  if (feedWordCount(q) > MAX_FEED_QUESTION_WORDS) return false;
  if (q.length > 72) return false;
  if (/—/.test(q)) return false;
  if ((q.match(/\?/g) ?? []).length !== 1) return false;
  return true;
}

/** Force legacy / model copy into feed-safe statement shape. */
export function sanitizeFeedStatement(text: string): string {
  let s = normalizeSpaces(text.replace(/\*\*/g, ""));
  s = s.replace(/—/g, "-");
  const clause =
    s.split(/\s+-\s+|\s*,\s+(?:and|but|or)\s+/i)[0]?.trim() ?? s;
  s = clause.replace(/[.!?]+$/, "").trim();
  const words = s.split(/\s+/).filter(Boolean);
  s = words.slice(0, MAX_FEED_STATEMENT_WORDS).join(" ");
  if (s.length > 56) s = s.slice(0, 56).trim();
  return s;
}

/** Force legacy / model copy into feed-safe question shape. */
export function sanitizeFeedQuestion(text: string): string {
  let q = normalizeSpaces(text.replace(/—/g, " "));
  const sentences = q
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const questionSentence =
    [...sentences].reverse().find((part) => part.includes("?")) ??
    sentences[sentences.length - 1] ??
    q;
  q = questionSentence.split(/,\s*or\s+/i)[0]!.trim();

  const askMatch = q.match(
    /\b((?:Does|Do|Did|Is|Are|Was|Were|Could|Would|Will|Can|Have|Has|What|When|Where|How|Why)\b[^.?!]*)/i
  );
  if (askMatch) q = askMatch[1]!.trim();

  q = q.replace(/[.!]+$/, "").trim();
  if (!q.endsWith("?")) q += "?";

  const words = q.slice(0, -1).split(/\s+/).filter(Boolean);
  if (words.length > MAX_FEED_QUESTION_WORDS) {
    q = `${words.slice(0, MAX_FEED_QUESTION_WORDS).join(" ")}?`;
  }
  if (q.length > 72) q = `${q.slice(0, 71).trim()}?`;
  return q;
}

/** Prefer the last short question sentence from legacy compound copy. */
export function extractShortQuestion(text: string): string | null {
  const sanitized = sanitizeFeedQuestion(text);
  return sanitized.trim() ? sanitized : null;
}

export function parseAssistantJson<T extends Record<string, unknown>>(
  raw: string
): T | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*\n?/gm, "")
    .replace(/\n?```\s*$/gm, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
}
