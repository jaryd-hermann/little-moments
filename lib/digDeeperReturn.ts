export type DigDeeperPendingResult = {
  enhancedBody: string;
  enhancedTitle: string;
  originalBody: string;
  originalTitle: string;
  aiConversationJson: string;
};

let pending: DigDeeperPendingResult | null = null;

export function setDigDeeperPendingResult(payload: DigDeeperPendingResult) {
  pending = payload;
}

export function takeDigDeeperPendingResult(): DigDeeperPendingResult | null {
  const p = pending;
  pending = null;
  return p;
}

/** Plain text from Dig Deeper → minimal HTML for react-native-pell-rich-editor. */
export function plainTextToComposerHtml(plain: string): string {
  const escaped = plain
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escaped
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${block.replace(/\n/g, "<br/>")}</p>`);
  return paragraphs.length > 0 ? paragraphs.join("") : `<p>${escaped}</p>`;
}
