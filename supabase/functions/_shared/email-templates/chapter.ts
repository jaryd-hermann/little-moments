import { escapeHtml, greetingFirstName } from "./format.ts";
import { emailLayout, ctaButton, emailDeepLinks } from "./layout.ts";

export function chapterEmail(opts: {
  displayName?: string | null;
  weekLabel: string;
  momentCount: number;
  chapterNumber: number;
  /**
   * Chapter row id — when present, the CTA deep-links the user directly
   * to that chapter inside the app via the `/app/chapter/<id>` Universal
   * Link. Without it (older callers, preview script) the CTA falls back
   * to the generic "open the app" link.
   */
  chapterId?: string;
}): { subject: string; html: string } {
  const who = greetingFirstName(opts.displayName);
  const week = escapeHtml(opts.weekLabel);
  const ctaUrl = opts.chapterId
    ? emailDeepLinks.chapter(opts.chapterId)
    : emailDeepLinks.chapters();
  return {
    subject: `Your chapter for the ${opts.weekLabel} is ready`,
    html: emailLayout({
      preheader: `${opts.momentCount} moments woven into your ${opts.weekLabel} chapter.`,
      body: `
        <p style="margin:0 0 16px;">Hey ${who},</p>
        <p style="margin:0 0 16px;">
          Your <strong>Chapter ${opts.chapterNumber}</strong> is ready — a quiet
          look back at your <strong>${week}</strong>.
        </p>
        <p style="margin:0 0 16px;font-size:14px;color:rgba(0,0,0,0.6);">
          ${opts.momentCount} moments captured · woven together by Ellie.
        </p>
        ${ctaButton("Read your chapter", ctaUrl)}
        <p style="margin:20px 0 0;color:rgba(0,0,0,0.5);font-size:14px;">
          Open the app to read the full chapter — and start your next week of moments.
        </p>
      `,
    }),
  };
}
