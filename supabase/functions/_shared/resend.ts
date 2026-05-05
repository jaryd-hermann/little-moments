const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const DEFAULT_FROM = "Little Moments <hello@getlittlemoments.com>";

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

export interface AddContactOpts {
  audienceId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  unsubscribed?: boolean;
}

export interface AddContactResult {
  id?: string;
  alreadyExists: boolean;
  status: number;
}

/**
 * Add (or upsert) a contact in a Resend audience/segment.
 *
 * Uses the audience-scoped contacts endpoint:
 *   POST https://api.resend.com/audiences/{audience_id}/contacts
 *
 * Idempotent at the API level — duplicate emails return a 4xx that we treat as
 * a no-op so callers can safely retry without bookkeeping.
 */
export async function addContactToAudience(
  opts: AddContactOpts,
): Promise<AddContactResult> {
  const res = await fetch(
    `https://api.resend.com/audiences/${opts.audienceId}/contacts`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: opts.email,
        first_name: opts.firstName ?? undefined,
        last_name: opts.lastName ?? undefined,
        unsubscribed: opts.unsubscribed ?? false,
      }),
    },
  );

  if (res.ok) {
    const json = (await res.json()) as { id?: string };
    return { id: json.id, alreadyExists: false, status: res.status };
  }

  const text = await res.text();
  const lowered = text.toLowerCase();
  const looksDuplicate =
    res.status === 409 ||
    lowered.includes("already exists") ||
    lowered.includes("contact already") ||
    lowered.includes("duplicate");

  if (looksDuplicate) {
    return { alreadyExists: true, status: res.status };
  }

  throw new Error(`Resend addContact ${res.status}: ${text}`);
}
