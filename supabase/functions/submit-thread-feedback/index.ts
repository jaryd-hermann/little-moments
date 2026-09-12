import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";
import { anthropicAssistantText } from "../_shared/anthropicAssistantText.ts";
import { refreshUserThreadPreferences } from "../_shared/thread-context.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const VALID_CHIPS = new Set([
  "more_like_this",
  "surprising",
  "made_me_reflect",
  "beautifully_put",
  "not_relevant",
  "too_obvious",
  "wrong_vibe",
  "not_this_theme",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const userSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: userErr,
    } = await userSupabase.auth.getUser();
    if (userErr || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json();
    const threadId = body.threadId as string;
    const sentiment = body.sentiment as string;
    const chips = (body.chips as string[]) ?? [];
    const note = (body.note as string | undefined)?.trim() ?? "";
    const action = (body.action as string) ?? "none";

    if (!threadId || !["positive", "negative"].includes(sentiment)) {
      return json({ error: "Invalid payload" }, 400);
    }
    if (!["none", "hidden", "highlighted"].includes(action)) {
      return json({ error: "Invalid action" }, 400);
    }

    const filteredChips = chips.filter((c) => VALID_CHIPS.has(c));

    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: thread, error: threadErr } = await serviceSupabase
      .from("threads")
      .select("id, user_id, hidden_from_feed")
      .eq("id", threadId)
      .eq("user_id", user.id)
      .single();

    if (threadErr || !thread) {
      return json({ error: "Thread not found" }, 404);
    }

    // Hidden threads stay hidden — user cannot unhide from feed UI.
    const hiddenFromFeed =
      thread.hidden_from_feed === true
        ? true
        : action === "hidden";
    const highlighted = action === "highlighted";

    await serviceSupabase.from("thread_feedback").insert({
      user_id: user.id,
      thread_id: threadId,
      sentiment,
      chips: filteredChips,
      note: note || null,
      action,
    });

    const { error: updateErr } = await serviceSupabase
      .from("threads")
      .update({
        feedback_sentiment: sentiment,
        hidden_from_feed: hiddenFromFeed,
        highlighted: hiddenFromFeed ? false : highlighted,
      })
      .eq("id", threadId);

    if (updateErr) {
      console.error(updateErr);
      return json({ error: "Update failed" }, 500);
    }

    const anthropic = new Anthropic({
      apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
    });

    try {
      await refreshUserThreadPreferences(
        serviceSupabase,
        anthropic,
        user.id,
        anthropicAssistantText
      );
    } catch (prefErr) {
      console.warn("Preference refresh failed:", prefErr);
    }

    return json({
      ok: true,
      hidden_from_feed: hiddenFromFeed,
      highlighted: hiddenFromFeed ? false : highlighted,
      feedback_sentiment: sentiment,
    });
  } catch (err) {
    console.error(err);
    return json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500
    );
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
