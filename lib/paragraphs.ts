/**
 * Split prose into paragraphs.
 *
 * 1. Honors explicit blank-line breaks (\n\n) when present.
 * 2. Falls back to grouping sentences into ~3 paragraphs if the AI returns
 *    one wall of text. Without the fallback, dig-deeper bodies that come
 *    back from older models render as a single block.
 */
export function smartParagraphs(text: string): string[] {
  if (!text) return [];

  const explicit = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter(Boolean);

  if (explicit.length > 1) return explicit;

  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return [];

  // Keep the punctuation with each sentence; lookbehind splits AFTER it.
  const sentences = flat.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g);
  if (!sentences || sentences.length <= 4) return [flat];

  const groupSize = Math.ceil(sentences.length / 3);
  const result: string[] = [];
  for (let i = 0; i < sentences.length; i += groupSize) {
    result.push(sentences.slice(i, i + groupSize).join("").trim());
  }
  return result.filter(Boolean);
}
