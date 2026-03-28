import { createClient } from "npm:@supabase/supabase-js";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

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
        { status: 400 }
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
          { status: 200 }
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
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500 }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        subscriptionStatus,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500 }
    );
  }
});
