import { emailLayout, ctaButton } from "./layout.ts";

export function trialExpiringEmail(daysLeft: number): {
  emailKey: string;
  subject: string;
  html: string;
} {
  const dayWord = daysLeft === 1 ? "day" : "days";
  return {
    emailKey: `trial-expiring-${daysLeft}d`,
    subject: `Your trial ends in ${daysLeft} ${dayWord}`,
    html: emailLayout({
      preheader: `${daysLeft} ${dayWord} left on your free trial.`,
      body: `
        <p style="margin:0 0 16px;">
          Your 14-day Little Moments trial ends in ${daysLeft} ${dayWord}.
        </p>
        <p style="margin:0 0 16px;">
          If you have been enjoying the app, subscribe to keep writing,
          reflecting, and building your time capsule. Everything you have
          written so far will still be there.
        </p>
        ${ctaButton("Continue with Little Moments")}
      `,
    }),
  };
}

export function trialExpiredEmail(): {
  emailKey: string;
  subject: string;
  html: string;
} {
  return {
    emailKey: "trial-expired",
    subject: "Your trial has ended",
    html: emailLayout({
      preheader: "Your free trial is over, but your moments are safe.",
      body: `
        <p style="margin:0 0 16px;">
          Your Little Moments trial has ended. Your moments are still saved
          and waiting for you.
        </p>
        <p style="margin:0 0 16px;">
          Subscribe any time to pick up where you left off.
        </p>
        ${ctaButton("Subscribe now")}
      `,
    }),
  };
}
