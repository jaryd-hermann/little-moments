/**
 * Daily drip: send onboarding emails on days 1-6 after signup.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 * Disable JWT verification for this function in the Dashboard.
 *
 * Scheduling: migration 0013 registers a pg_cron job that POSTs here
 * every hour. The function finds users whose profiles.created_at is
 * 1-6 days ago, checks email_sends for duplicates, and sends the
 * appropriate day's email via Resend.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendEmail } from "../_shared/resend.ts";
import {
  onboardingEmail,
  ONBOARDING_DAY_COUNT,
} from "../_shared/email-templates/onboarding.ts";

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

    for (let day = 1; day <= ONBOARDING_DAY_COUNT; day++) {
      const tpl = onboardingEmail(day);
      if (!tpl) continue;

      // Users who signed up exactly `day` days ago (calendar day in UTC)
      const targetDate = new Date();
      targetDate.setUTCDate(targetDate.getUTCDate() - day);
      const dateStr = targetDate.toISOString().slice(0, 10);

      const { data: users, error } = await supabase
        .from("profiles")
        .select("id, email")
        .gte("created_at", `${dateStr}T00:00:00Z`)
        .lt("created_at", `${dateStr}T23:59:59.999Z`)
        .not("email", "is", null);

      if (error) {
        console.error(`Day ${day} query error:`, error.message);
        continue;
      }
      if (!users || users.length === 0) continue;

      const userIds = users.map((u) => u.id);

      const { data: alreadySent } = await supabase
        .from("email_sends")
        .select("user_id")
        .in("user_id", userIds)
        .eq("email_key", tpl.emailKey);

      const sentSet = new Set((alreadySent ?? []).map((r) => r.user_id));

      for (const user of users) {
        if (sentSet.has(user.id)) continue;
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
    }

    return new Response(JSON.stringify({ ok: true, sent: totalSent }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "error";
    console.error("cron-onboarding-emails error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
