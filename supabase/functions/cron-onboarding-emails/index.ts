/**
 * Daily drip: send onboarding emails on days 1-10 after signup.
 *
 * STATUS: DEPRECATED (2026-05-04 / superseded by cron-lifecycle-emails).
 *
 * The new behavior-triggered system in `cron-lifecycle-emails` replaces
 * this time-based drip. Migration 0043 unschedules this cron and
 * schedules the new one. The function below is kept as a no-op safety
 * net for any stray scheduled invocations during the migration window.
 *
 * Do NOT re-enable. Add new lifecycle emails to
 * `_shared/email-templates/lifecycle.ts` and a corresponding trigger
 * predicate in `cron-lifecycle-emails/index.ts`.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendEmail } from "../_shared/resend.ts";
import {
  onboardingEmail,
  ONBOARDING_DAY_COUNT,
} from "../_shared/email-templates/onboarding.ts";

const ONBOARDING_DRIP_DISABLED = true;

Deno.serve(async (req) => {
  try {
    const secret = Deno.env.get("CRON_SECRET");
    const auth = req.headers.get("Authorization");
    if (!secret || auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    if (ONBOARDING_DRIP_DISABLED) {
      // Hard no-op. Returns 200 so the cron job's `net.http_post` doesn't
      // log spurious failures while we transition to the external sender.
      return new Response(
        JSON.stringify({ ok: true, sent: 0, disabled: true }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let totalSent = 0;

    for (let day = 1; day <= ONBOARDING_DAY_COUNT; day++) {
      const meta = onboardingEmail(day);
      if (!meta) continue;

      // Users who signed up exactly `day` days ago (calendar day in UTC)
      const targetDate = new Date();
      targetDate.setUTCDate(targetDate.getUTCDate() - day);
      const dateStr = targetDate.toISOString().slice(0, 10);

      const { data: users, error } = await supabase
        .from("profiles")
        .select("id, email, display_name")
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
        .eq("email_key", meta.emailKey);

      const sentSet = new Set((alreadySent ?? []).map((r) => r.user_id));

      for (const user of users) {
        if (sentSet.has(user.id)) continue;
        const tpl = onboardingEmail(day, { displayName: user.display_name });
        if (!tpl) continue;
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
