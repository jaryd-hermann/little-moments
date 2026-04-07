import { greetingFirstName } from "./format.ts";
import { emailLayout, ctaButton } from "./layout.ts";

export function welcomeEmail(opts: {
  displayName?: string | null;
  causeTitle?: string | null;
}): { subject: string; html: string } {
  const who = greetingFirstName(opts.displayName);

  return {
    subject: "Most people can't remember last Tuesday — Little Moments fixes that",
    html: emailLayout({
      preheader:
        "One daily starting point. Two minutes. A lifetime of little moments.",
      body: `
        <p style="margin:0 0 16px;">Hey ${who},</p>
        <p style="margin:0 0 16px;">
          Glad you're here. Life moves fast — without a nudge, whole days blur. Most of us can't pin down what made last Tuesday different. This app is the nudge.
        </p>
        <p style="margin:0 0 16px;">
          <strong>How it works:</strong> every day you get a starting point — a <strong>random word</strong>, a <strong>photo from your camera roll</strong>, or a <strong>simple question</strong>. It's a trigger to get your mind reaching for something real.
        </p>
        <p style="margin:0 0 16px;">
          Give yourself about <strong>two minutes</strong>: talk, type, or add a line. No grades — just capture. Ellie helps with one quick follow-up when it helps. Speak, write, add. That's the habit.
        </p>
        <p style="margin:0 0 16px;">
          Over time, those moments become a searchable archive — a lifetime of little things you would have forgotten.
        </p>
        <p style="margin:0 0 16px;">
          Open the app when you're ready and log your next moment.
        </p>
        ${ctaButton("Open Little Moments")}
        <p style="margin:20px 0 0;">Talk soon,<br/>Jaryd</p>
      `,
    }),
  };
}
