/**
 * Send a welcome email when a new profile is created.
 *
 * Triggered by the on_profile_created_send_welcome Postgres trigger (migration 0012)
 * which POSTs { user_id, email, display_name } via pg_net.
 *
 * Auth: Bearer CRON_SECRET (same secret used by cron functions).
 * Disable JWT verification for this function in the Dashboard.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendEmail } from "../_shared/resend.ts";
import { welcomeEmail } from "../_shared/email-templates/welcome.ts";

Deno.serve(async (req) => {
  try {
    const secret = Deno.env.get("CRON_SECRET");
    const auth = req.headers.get("Authorization");
    if (!secret || auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { user_id, email, display_name } = await req.json();
    if (!user_id || !email) {
      return new Response(JSON.stringify({ error: "Missing user_id or email" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: existing } = await supabase
      .from("email_sends")
      .select("id")
      .eq("user_id", user_id)
      .eq("email_key", "welcome")
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, donation_cause_id")
      .eq("id", user_id)
      .maybeSingle();

    let causeTitle: string | null = null;
    if (profile?.donation_cause_id) {
      const { data: cause } = await supabase
        .from("donation_causes")
        .select("title")
        .eq("id", profile.donation_cause_id)
        .maybeSingle();
      causeTitle = cause?.title ?? null;
    }

    const tpl = welcomeEmail({
      displayName: profile?.display_name ?? display_name ?? undefined,
      causeTitle,
    });
    await sendEmail({ to: email, subject: tpl.subject, html: tpl.html });

    await supabase
      .from("email_sends")
      .insert({ user_id, email_key: "welcome" });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "error";
    console.error("send-welcome-email error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
