import { greetingFirstName } from "./format.ts";
import { emailLayout, ctaButton } from "./layout.ts";

/**
 * Welcome email — fired by `send-welcome-email` Edge Function on
 * profile insert (DB trigger from migration 0012). This is the FIRST
 * thing every new user receives.
 *
 * The `causeTitle` parameter is unused in the current photo-focus
 * onboarding (donation flow was removed) but kept on the signature so
 * existing callers — and the preview script — don't break.
 */
export function welcomeEmail(opts: {
  displayName?: string | null;
  causeTitle?: string | null;
}): { subject: string; html: string } {
  const who = greetingFirstName(opts.displayName);

  return {
    subject: "Welcome to Little Moments",
    html: emailLayout({
      preheader: "60 seconds. One photo. One moment a day.",
      body: `
        <p style="margin:0 0 16px;">Hey ${who},</p>
        <p style="margin:0 0 16px;">
          Glad you're here. The whole thing comes down to one habit:
          <strong>one moment a day, 60 seconds</strong>.
        </p>
        <p style="margin:0 0 16px;">
          Each day, the app picks a <strong>photo you already took</strong> and hands it back
          to you. Tap the mic, talk it out — or jot a line if you'd rather. Don't aim for
          poetic. Aim for honest. The little stuff (the offhand thing your kid said, the way
          the light hit at lunch) is what your future self will be glad you grabbed.
        </p>
        <p style="margin:0 0 16px;">
          Over time, those daily 60 seconds become an archive of your actual life —
          searchable, full of texture, weirdly emotional to look back on.
        </p>
        <p style="margin:0 0 16px;">
          Today's photo is waiting. Two minutes is all it takes.
        </p>
        ${ctaButton("Capture today's moment")}
        <p style="margin:20px 0 0;">Talk soon,<br/>Jaryd</p>
        <p style="margin:16px 0 0;color:rgba(0,0,0,0.65);font-size:15px;line-height:24px;">
          <em>P.S. The bar really is this low. One moment, 60 seconds. Streaks take care of
          themselves.</em>
        </p>
      `,
    }),
  };
}
