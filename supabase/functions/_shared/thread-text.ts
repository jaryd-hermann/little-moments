/** Strip `**bold**` markers for push titles / SMS-style previews. */
export function observationPlainPreview(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*/g, "").trim();
}
