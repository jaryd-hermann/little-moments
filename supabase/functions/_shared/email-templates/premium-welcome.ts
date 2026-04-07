import { greetingFirstName } from "./format.ts";
import { emailLayout, ctaButton } from "./layout.ts";

export const PREMIUM_WELCOME_EMAIL_KEY = "premium-welcome";

export function premiumWelcomeEmail(opts: {
  displayName?: string | null;
}): { emailKey: string; subject: string; html: string } {
  const who = greetingFirstName(opts.displayName);
  return {
    emailKey: PREMIUM_WELCOME_EMAIL_KEY,
    subject: "Welcome to Little Moments Premium",
    html: emailLayout({
      preheader: "Thank you — here's what unlocks in the app.",
      body: `
        <p style="margin:0 0 16px;">Hey ${who},</p>
        <p style="margin:0 0 16px;">
          Thank you for going Premium. You're supporting the app and unlocking the full experience — Chapters, advanced Capsule search, memory connections, and everything Premium includes in-app.
        </p>
        <p style="margin:0 0 16px;">
          Open Little Moments whenever you're ready to explore what's new.
        </p>
        ${ctaButton("Open Little Moments")}
        <p style="margin:20px 0 0;">Grateful you're here,<br/>Jaryd</p>
      `,
    }),
  };
}
