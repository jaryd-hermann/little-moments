/**
 * Anthropic message responses may include multiple content blocks (e.g. thinking + text).
 * Concatenate every assistant `text` block and skip other block types.
 */
export function anthropicAssistantText(
  content: unknown[] | null | undefined,
): string {
  if (!Array.isArray(content) || content.length === 0) return "";
  let out = "";
  for (const block of content as { type?: string; text?: string }[]) {
    if (block?.type === "text" && typeof block.text === "string") {
      out += block.text;
    }
  }
  return out;
}
