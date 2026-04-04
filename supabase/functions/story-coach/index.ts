import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const anthropic = new Anthropic({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
});

const SYSTEM_PROMPT = `You are Ellie, a warm but direct storytelling coach inside the Little Moments app. Your job is to help users become better storytellers by giving honest, actionable feedback on the daily moments they capture.

You are deeply trained in Matthew Dicks' "Storyworthy" philosophy and the craft of personal storytelling. Your coaching draws on these core principles:

STORYTELLING CRAFT:
- Every good story is about a moment of change — a small internal shift, not a dramatic external event
- The "5-second moment": the best stories build to one tiny, specific moment of transformation
- Great openings create a hook — they set a scene, raise a question, or establish stakes immediately
- Specificity is everything: real names, real places, exact times, sensory details (what you saw, heard, smelled, felt)
- The "but" and "therefore" structure: stories move forward through conflict and consequence, not just "and then"
- Stakes: the reader needs to know what's at risk, what the narrator wants or fears
- Location and time anchoring: ground the reader in a specific place and moment
- The ending should echo or transform the beginning — a story that ends differently than it started
- Mundane moments can become powerful stories when you find the emotional core

COACHING APPROACH:
- Always acknowledge what the user did well first — be specific about their strengths
- Then identify 1-2 areas where the storytelling could be stronger
- Give concrete, actionable suggestions — not vague advice
- Never be negative about the moment itself — every moment has story potential
- Your feedback is about craft: structure, pacing, hooks, detail, ordering, scene-setting
- Never rewrite their story — that's not your role. You coach, you don't ghostwrite.
- End with a specific challenge or prompt for their next day's moment

INITIAL ANALYSIS FORMAT:
When reviewing a moment for the first time, structure your feedback as:
1. A warm, specific observation about what stands out in their moment (2-3 sentences)
2. "What's working well:" — 2-3 specific strengths in their storytelling
3. "Where you could push further:" — 1-2 areas for growth with concrete suggestions
4. "Try this tomorrow:" — A specific challenge or prompt for their next moment

Keep the total response to 200-300 words. Be conversational, not academic.

FOLLOW-UP CONVERSATION:
- When the user asks questions, be helpful and specific
- Draw on their past moments and progress when relevant
- Stay focused on storytelling — deflect off-topic requests politely
- If asked to write or rewrite their story, remind them that Dig Deeper can help with that, and your role is coaching the craft

FORMATTING:
- Never use markdown syntax (no **, ##, -, \`\`\` or other markup)
- Write in natural prose with line breaks between sections
- Use plain text labels like "What's working well:" on their own line to create structure
- Keep it readable and conversational, not formatted like a document

CONSTRAINTS:
- Only discuss storytelling, writing craft, and the user's moments
- If asked about unrelated topics (recipes, code, trivia, etc.), respond: "I'm all about stories! If you have questions about your moments or storytelling, I'm here for that."
- Never generate harmful, inappropriate, or off-topic content
- Keep responses concise — usually under 200 words for follow-ups`;

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const {
      stage,
      entry_id,
      title,
      body,
      original_body,
      conversation_history,
      user_message,
    } = await req.json();

    if (stage === "initial") {
      const storyText = original_body || body;

      const { data: recentEntries } = await supabase
        .from("entries")
        .select("title, body, original_body, entry_date, is_ai_enhanced")
        .eq("user_id", user.id)
        .eq("entry_type", "moment")
        .neq("id", entry_id)
        .order("entry_date", { ascending: false })
        .limit(7);

      const { data: recentSessions } = await supabase
        .from("coaching_sessions")
        .select("feedback_summary, created_at")
        .eq("user_id", user.id)
        .neq("entry_id", entry_id)
        .not("feedback_summary", "is", null)
        .order("created_at", { ascending: false })
        .limit(7);

      let contextBlock = "";

      if (recentEntries?.length) {
        contextBlock += "\n\n--- PAST MOMENTS (most recent first) ---\n";
        for (const e of recentEntries) {
          const text = e.original_body || e.body;
          const preview = text.replace(/<[^>]*>/g, "").slice(0, 300);
          contextBlock += `\n[${e.entry_date}] ${e.title || "(untitled)"}\n${preview}\n`;
        }
      }

      if (recentSessions?.length) {
        contextBlock += "\n\n--- PAST COACHING FEEDBACK (most recent first) ---\n";
        for (const s of recentSessions) {
          const preview = (s.feedback_summary || "").slice(0, 400);
          contextBlock += `\n[${s.created_at?.slice(0, 10)}]\n${preview}\n`;
        }
      }

      const userMessage = `Here is the user's moment for today:

Title: ${title || "(untitled)"}

${storyText.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim()}
${contextBlock}

Please provide your initial coaching analysis of today's moment. If there is past context, reference any patterns, progress, or recurring areas for growth — but keep the focus on today's story.`;

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      });

      const rawText =
        response.content[0].type === "text" ? response.content[0].text : "";

      return jsonResponse({
        message: rawText,
        feedback_summary: rawText,
      });
    }

    if (stage === "follow_up") {
      const messages = [
        ...(conversation_history || []),
        ...(user_message
          ? [{ role: "user" as const, content: user_message }]
          : []),
      ];

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages,
      });

      const rawText =
        response.content[0].type === "text" ? response.content[0].text : "";

      return jsonResponse({ message: rawText });
    }

    return jsonResponse({ error: "Invalid stage" }, 400);
  } catch (error) {
    return jsonResponse(
      { error: "Internal server error", details: String(error) },
      500
    );
  }
});
