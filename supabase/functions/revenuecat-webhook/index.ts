import { createClient } from "npm:@supabase/supabase-js@2";
import { sendEmail } from "../_shared/resend.ts";
import {
  PREMIUM_WELCOME_EMAIL_KEY,
  premiumWelcomeEmail,
} from "../_shared/email-templates/premium-welcome.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function sendPremiumWelcomeEmailIfNeeded(userId: string): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from("email_sends")
      .select("id")
      .eq("user_id", userId)
      .eq("email_key", PREMIUM_WELCOME_EMAIL_KEY)
      .maybeSingle();

    if (existing) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("email, display_name")
      .eq("id", userId)
      .maybeSingle();

    if (!profile?.email?.trim()) return;

    const tpl = premiumWelcomeEmail({ displayName: profile.display_name });
    await sendEmail({
      to: profile.email.trim(),
      subject: tpl.subject,
      html: tpl.html,
    });

    await supabase.from("email_sends").insert({
      user_id: userId,
      email_key: tpl.emailKey,
    });
  } catch (e) {
    console.error("revenuecat-webhook premium welcome email:", e);
  }
}

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get("authorization");
    const expectedSecret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");
    if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    const event = body.event;
    const appUserId = event?.app_user_id;

    if (!appUserId) {
      return new Response(
        JSON.stringify({ error: "Missing app_user_id" }),
        { status: 400 },
      );
    }

    const eventType = event?.type;
    let subscriptionStatus: string;

    switch (eventType) {
      case "INITIAL_PURCHASE":
      case "RENEWAL":
      case "PRODUCT_CHANGE":
        subscriptionStatus = "active";
        break;
      case "CANCELLATION":
        subscriptionStatus = "cancelled";
        break;
      case "EXPIRATION":
        subscriptionStatus = "expired";
        break;
      default:
        return new Response(
          JSON.stringify({ message: "Unhandled event type", eventType }),
          { status: 200 },
        );
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        subscription_status: subscriptionStatus,
        revenuecat_customer_id: appUserId,
      })
      .eq("id", appUserId);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
      });
    }

    if (eventType === "INITIAL_PURCHASE" && subscriptionStatus === "active") {
      await sendPremiumWelcomeEmailIfNeeded(appUserId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        subscriptionStatus,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
    });
  }
});
