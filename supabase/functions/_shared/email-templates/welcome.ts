import { causeNameOrFallback, greetingFirstName } from "./format.ts";
import { emailLayout, ctaButton } from "./layout.ts";

export function welcomeEmail(opts: {
  displayName?: string | null;
  causeTitle?: string | null;
}): { subject: string; html: string } {
  const who = greetingFirstName(opts.displayName);
  const causeNamed = opts.causeTitle?.trim();
  const causeParagraph = causeNamed
    ? `<p style="margin:0 0 16px;">
        One thing before you go: you chose ${causeNameOrFallback(opts.causeTitle)} as your cause during signup, which means 5% of your subscription goes directly to them. I wanted that to be a real commitment, not a footnote — so thank you for picking something that matters to you.
      </p>`
    : `<p style="margin:0 0 16px;">
        One thing to know: 5% of your subscription goes to the cause you choose in the app. I wanted that to be a real commitment, not a footnote — thank you for taking a moment to pick something that matters when you get there.
      </p>`;

  return {
    subject: "You're in. Now capture something tonight.",
    html: emailLayout({
      preheader: "Welcome to Little Moments — open the app and log your first moment tonight.",
      body: `
        <p style="margin:0 0 16px;">Hey ${who},</p>
        <p style="margin:0 0 16px;">
          Welcome to Little Moments. Really glad you're here.
        </p>
        <p style="margin:0 0 16px;">
          I built this app because I kept losing days. Not in a dramatic way — just in the way that happens when life moves fast and you're not paying attention. I'd get to Sunday and barely remember Tuesday. And I didn't love that.
        </p>
        <p style="margin:0 0 16px;">
          This practice changed that for me. I think it'll do the same for you.
        </p>
        ${causeParagraph}
        <p style="margin:0 0 16px;">
          Now, one small ask for tonight.
        </p>
        <p style="margin:0 0 16px;">
          Open the app. Capture your first moment. It doesn't have to be good. It doesn't have to be meaningful. It just has to be something that happened today — the thing you'd mention if someone asked how your day actually went.
        </p>
        <p style="margin:0 0 16px;">
          That's it. That's the whole practice.
        </p>
        ${ctaButton("Open Little Moments")}
        <p style="margin:20px 0 0;">Talk soon,<br/>Jaryd</p>
        <p style="margin:16px 0 0;color:rgba(0,0,0,0.65);font-size:15px;line-height:24px;">
          <em>P.S. If you're not sure what to write, just answer this: what was different about today?</em>
        </p>
      `,
    }),
  };
}
