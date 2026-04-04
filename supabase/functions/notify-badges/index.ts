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
      .select("total_moments, streak_count")
      .eq("id", user.id)
      .single();

    const totalMoments = profFull?.total_moments ?? 0;
    const streakCount = profFull?.streak_count ?? 0;

    const { count: photoCount, error: photoErr } = await supabase
      .from("entry_media")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("media_type", "image");

    if (photoErr) {
      return new Response(JSON.stringify({ error: photoErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // --- Badges ---

    if (totalMoments >= 1 && !state.story_starter) {
      pushToAllDevices(
        "New badge: Story Starter",
        "Your first moment is in the books — the journey begins."
      );
      nextState.story_starter = true;
    }

    if ((crashCount ?? 0) >= 1 && !state.story_finder) {
      pushToAllDevices(
        "New badge: Story Finder",
        "First memory race complete — you found a story worth keeping."
      );
      nextState.story_finder = true;
    }

    if (totalMoments >= 10 && !state.story_builder) {
      pushToAllDevices(
        "New badge: Story Builder",
        "10 moments captured — your story is really taking shape."
      );
      nextState.story_builder = true;
    }

    if ((photoCount ?? 0) >= 1 && !state.the_photographer) {
      pushToAllDevices(
        "New badge: The Photographer",
        "You added your first photo to a moment — a picture worth a thousand words."
      );
      nextState.the_photographer = true;
    }

    // --- Milestone notifications ---

    if (streakCount >= 7 && !state.streak_seven) {
      pushToAllDevices(
        "7-day streak!",
        "You've shown up 7 days in a row — that's a real habit forming. Keep it going!"
      );
      nextState.streak_seven = true;
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
