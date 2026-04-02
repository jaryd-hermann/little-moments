import { causeNameOrFallback, greetingFirstName } from "./format.ts";
import { emailLayout, ctaButton } from "./layout.ts";

export interface TrialEmailOpts {
  displayName?: string | null;
  causeTitle?: string | null;
}

function trialLead(opts?: TrialEmailOpts): string {
  return `<p style="margin:0 0 16px;">Hey ${greetingFirstName(opts?.displayName)},</p>`;
}

export function trialExpiringEmail(
  daysLeft: number,
  opts?: TrialEmailOpts,
): {
  emailKey: string;
  subject: string;
  html: string;
} {
  const dayWord = daysLeft === 1 ? "day" : "days";
  const cause = causeNameOrFallback(opts?.causeTitle);

  if (daysLeft === 3) {
    return {
      emailKey: `trial-expiring-${daysLeft}d`,
      subject: "Your trial ends in 3 days",
      html: emailLayout({
        preheader: "Three days left on your Little Moments trial.",
        body: `
          ${trialLead(opts)}
          <p style="margin:0 0 16px;">
            Just a heads up — your 14-day trial wraps up in three days.
          </p>
          <p style="margin:0 0 16px;">
            I hope the last couple of weeks gave you a real feel for what the practice is like. Even a few entries is enough to start noticing what it does to how you move through your days.
          </p>
          <p style="margin:0 0 16px;">
            If you want to keep going — and keep access to Dig Deeper, Memory Jog, Rewind, Capsule, and Chapters — you can subscribe anytime inside the app.
          </p>
          <p style="margin:0 0 16px;">
            And remember: 5% of every subscription goes directly to ${cause}. So it's not just good for you.
          </p>
          <p style="margin:0 0 16px;">
            No pressure either way. But if this has been useful, I'd love for you to stick around.
          </p>
          ${ctaButton("Continue with Little Moments")}
          <p style="margin:20px 0 0;">Jaryd</p>
        `,
      }),
    };
  }

  if (daysLeft === 1) {
    return {
      emailKey: `trial-expiring-${daysLeft}d`,
      subject: "Last day of your trial",
      html: emailLayout({
        preheader: "Your Little Moments trial ends tomorrow.",
        body: `
          ${trialLead(opts)}
          <p style="margin:0 0 16px;">
            Your trial ends tomorrow.
          </p>
          <p style="margin:0 0 16px;">
            I'll keep this short: if Little Moments has been useful — even a little — it's worth continuing. The practice compounds. One week of moments is a start. A year of them is something you'll genuinely treasure.
          </p>
          <p style="margin:0 0 16px;">
            Subscribe before tomorrow and nothing changes. Your moments stay, your streak stays, everything continues.
          </p>
          <p style="margin:0 0 16px;">
            If now isn't the right time, no worries. Your data will still be there if you come back.
          </p>
          ${ctaButton("Subscribe in the app")}
          <p style="margin:20px 0 0;">Jaryd</p>
          <p style="margin:16px 0 0;color:rgba(0,0,0,0.65);font-size:15px;line-height:24px;">
            <em>P.S. Still on the fence? Go read your first entry. Then decide.</em>
          </p>
        `,
      }),
    };
  }

  return {
    emailKey: `trial-expiring-${daysLeft}d`,
    subject: `Your trial ends in ${daysLeft} ${dayWord}`,
    html: emailLayout({
      preheader: `${daysLeft} ${dayWord} left on your free trial.`,
      body: `
        ${trialLead(opts)}
        <p style="margin:0 0 16px;">
          Your 14-day Little Moments trial ends in ${daysLeft} ${dayWord}.
        </p>
        <p style="margin:0 0 16px;">
          Subscribe inside the app to keep writing, reflecting, and building your archive — and remember, 5% goes to ${cause}.
        </p>
        ${ctaButton("Continue with Little Moments")}
        <p style="margin:20px 0 0;">Jaryd</p>
      `,
    }),
  };
}

export function trialExpiredEmail(opts?: TrialEmailOpts): {
  emailKey: string;
  subject: string;
  html: string;
} {
  const cause = causeNameOrFallback(opts?.causeTitle);
  return {
    emailKey: "trial-expired",
    subject: "Your trial has ended — here's how to continue",
    html: emailLayout({
      preheader: "Your moments are safe — subscribe anytime to keep adding new ones.",
      body: `
        ${trialLead(opts)}
        <p style="margin:0 0 16px;">
          Your trial ended today. Your moments are safe — nothing gets deleted — but you won't be able to add new ones until you subscribe.
        </p>
        <p style="margin:0 0 16px;">
          If the timing wasn't right, that's completely fine. Life is busy. Come back whenever you're ready.
        </p>
        <p style="margin:0 0 16px;">
          But if you found yourself noticing things differently over the last two weeks — pausing at the end of the day, looking for what mattered — that instinct doesn't have to stop. That's the practice working. And it only gets better from here.
        </p>
        <p style="margin:0 0 16px;">
          Subscribe anytime inside the app to pick up where you left off.
        </p>
        ${ctaButton("Subscribe now")}
        <p style="margin:20px 0 0;">Jaryd</p>
        <p style="margin:16px 0 0;color:rgba(0,0,0,0.65);font-size:15px;line-height:24px;">
          <em>P.S. We donate 5% of every subscription to ${cause} — your chosen cause from when you signed up. Just another reason to come back.</em>
        </p>
      `,
    }),
  };
}
