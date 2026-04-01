import { createClient } from "npm:@supabase/supabase-js@2";
import { sendExpoPushTickets } from "../_shared/expo-push.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type BadgeState = Record<string, boolean>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("badge_push_state, notification_enabled")
      .eq("id", user.id)
      .single();

    if (profErr || !profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!profile.notification_enabled) {
      return new Response(JSON.stringify({ skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const state = (profile.badge_push_state ?? {}) as BadgeState;

    const { count: crashCount, error: crashErr } = await supabase
      .from("entries")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("entry_type", "crash_and_burn");

    if (crashErr) {
      return new Response(JSON.stringify({ error: crashErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tokens, error: tokErr } = await supabase
      .from("push_tokens")
      .select("expo_push_token, platform")
      .eq("user_id", user.id);

    if (tokErr || !tokens?.length) {
      return new Response(JSON.stringify({ ok: true, noTokens: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tickets: {
      to: string;
      title: string;
      body: string;
      sound: "default";
      priority: "high";
      channelId: string;
    }[] = [];

    const nextState: BadgeState = { ...state };

    const { data: profFull } = await supabase
      .from("profiles")
      .select("total_moments")
      .eq("id", user.id)
      .single();

    const totalMoments = profFull?.total_moments ?? 0;

    const pushToAllDevices = (
      title: string,
      body: string
    ) => {
      for (const t of tokens) {
        tickets.push({
          to: t.expo_push_token,
          title,
          body,
          sound: "default",
          priority: "high",
          channelId: "default",
        });
      }
    };

    if (totalMoments >= 1 && !state.story_starter) {
      pushToAllDevices(
        "New badge",
        "You earned Story Starter — your first moment is in the books."
      );
      nextState.story_starter = true;
    }

    if ((crashCount ?? 0) >= 1 && !state.story_finder) {
      pushToAllDevices(
        "New badge",
        "You earned Story finder — first memory race complete."
      );
      nextState.story_finder = true;
    }

    if (tickets.length > 0) {
      await sendExpoPushTickets(tickets);
      await supabase
        .from("profiles")
        .update({ badge_push_state: nextState })
        .eq("id", user.id);
    }

    return new Response(
      JSON.stringify({ ok: true, sent: tickets.length > 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
