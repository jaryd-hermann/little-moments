/**
 * Daily check: send trial-expiring and trial-expired emails.
 *
 * Sends at 3 days left, 1 day left, and on expiry (day 14).
 * Skips users who already have an active subscription.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 * Disable JWT verification for this function in the Dashboard.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendEmail } from "../_shared/resend.ts";
import {
  trialExpiringEmail,
  trialExpiredEmail,
} from "../_shared/email-templates/trial.ts";

const TRIAL_DAYS = 14;
const NOTIFY_AT_DAYS_LEFT = [3, 1];

Deno.serve(async (req) => {
  try {
    const secret = Deno.env.get("CRON_SECRET");
    const auth = req.headers.get("Authorization");
    if (!secret || auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let totalSent = 0;

    const { data: trialUsers, error } = await supabase
      .from("profiles")
      .select("id, email, trial_start_date, subscription_status")
      .eq("subscription_status", "trial")
      .not("email", "is", null)
      .not("trial_start_date", "is", null);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!trialUsers || trialUsers.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const now = Date.now();

    for (const user of trialUsers) {
      const trialEnd =
        new Date(user.trial_start_date).getTime() +
        TRIAL_DAYS * 24 * 60 * 60 * 1000;
      const daysLeft = Math.ceil((trialEnd - now) / (24 * 60 * 60 * 1000));

      let tpl: { emailKey: string; subject: string; html: string } | null =
        null;

      if (daysLeft <= 0) {
        tpl = trialExpiredEmail();
      } else if (NOTIFY_AT_DAYS_LEFT.includes(daysLeft)) {
        tpl = trialExpiringEmail(daysLeft);
      }

      if (!tpl) continue;

      const { data: existing } = await supabase
        .from("email_sends")
        .select("id")
        .eq("user_id", user.id)
        .eq("email_key", tpl.emailKey)
        .maybeSingle();

      if (existing) continue;

      try {
        await sendEmail({
          to: user.email,
          subject: tpl.subject,
          html: tpl.html,
        });
        await supabase
          .from("email_sends")
          .insert({ user_id: user.id, email_key: tpl.emailKey });
        totalSent++;
      } catch (err) {
        console.error(
          `Failed to send ${tpl.emailKey} to ${user.id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    return new Response(JSON.stringify({ ok: true, sent: totalSent }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "error";
    console.error("cron-trial-expiring error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
