import { escapeHtml, greetingFirstName } from "./format.ts";
import { emailLayout, ctaButton } from "./layout.ts";

/** Turn `**like this**` into <strong> after escaping. */
function observationHtml(observation: string): string {
  const parts = observation.split(/\*\*/);
  return parts
    .map((part, i) => {
      const esc = escapeHtml(part);
      return i % 2 === 1 ? `<strong>${esc}</strong>` : esc;
    })
    .join("");
}

export function threadEmail(opts: {
  displayName?: string | null;
  ellieObservation: string;
  entryTitleA?: string | null;
  entryTitleB?: string | null;
}): { subject: string; html: string } {
  const who = greetingFirstName(opts.displayName);
  const obs = observationHtml(opts.ellieObservation);
  const titleA = opts.entryTitleA ? escapeHtml(opts.entryTitleA) : "a recent moment";
  const titleB = opts.entryTitleB ? escapeHtml(opts.entryTitleB) : "an earlier moment";

  return {
    subject: "Ellie noticed something",
    html: emailLayout({
      preheader: opts.ellieObservation.replace(/\*\*/g, "").slice(0, 100),
      body: `
        <p style="margin:0 0 16px;">Hey ${who},</p>
        <p style="margin:0 0 16px;">
          Two of your moments are connected — here's what I found.
        </p>
        <p style="margin:0 0 8px;font-style:italic;color:#444;">
          "${obs}"
        </p>
        <p style="margin:0 0 16px;font-size:14px;color:rgba(0,0,0,0.5);">
          Between <strong>${titleA}</strong> and <strong>${titleB}</strong>
        </p>
        ${ctaButton("See the Thread")}
        <p style="margin:20px 0 0;color:rgba(0,0,0,0.5);font-size:14px;">
          The more you log, the more Ellie can see across your story.
        </p>
      `,
    }),
  };
}
