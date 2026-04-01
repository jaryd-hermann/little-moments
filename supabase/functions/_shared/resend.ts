const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const DEFAULT_FROM = "Little Moments <hello@littlemoments.app>";

export interface SendEmailOpts {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export async function sendEmail(opts: SendEmailOpts): Promise<{ id: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from ?? DEFAULT_FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend ${res.status}: ${text}`);
  }

  return (await res.json()) as { id: string };
}
