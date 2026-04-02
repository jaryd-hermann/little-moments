/** Safe text for HTML email bodies */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** "Hey [First Name]," — first token of display name, HTML-safe */
export function greetingFirstName(displayName?: string | null): string {
  if (!displayName?.trim()) return escapeHtml("there");
  const first = displayName.trim().split(/\s+/)[0]!;
  return escapeHtml(first);
}

export function causeNameOrFallback(causeTitle?: string | null): string {
  const t = causeTitle?.trim();
  return t ? escapeHtml(t) : escapeHtml("your chosen cause");
}
