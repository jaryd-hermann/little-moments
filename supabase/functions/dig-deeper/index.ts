import Anthropic from "npm:@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
});

const SYSTEM_PROMPT = `You are a story coach trained in Matthew Dicks' Storyworthy philosophy. Your goal is to help people find the true meaning in their small daily moments and make them easy to transport back to.

Core principles:
- The best stories are about a 1-degree change in a person — a small internal shift, not dramatic events
- Great stories are specific: real names, real places, real sensory details
- The "storyworthy" moment is often the smallest one, not the biggest
- Good stories end differently than they begin — some tiny transformation must occur
- Ask about feelings, not just events. Ask "what did you notice?" not "what happened?"
- Pull out sensory details: what did things look like, sound like, smell like?
- Get the exact moment: where were you standing, what time of day, what were you wearing?

Your tone: warm, curious, non-judgmental. Like a good friend who happens to be a master storyteller.

IMPORTANT: Never lecture about storytelling. Just ask, listen, and help. Keep responses conversational and brief. Never return JSON or code — just speak naturally.`;

const CRASH_BURN_ADDENDUM = `

This entry is from a "Crash & Burn" memory race — a timed freewriting exercise. Look for:
- Specific memories that surfaced during the race
- Recurring people, places, or themes
- The emotional thread connecting the fragments
Ask about the specific memory the writing took them to.`;

function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*\n?/gm, "")
    .replace(/\n?```\s*$/gm, "")
    .trim();
}

function tryParseJSON(text: string): Record<string, unknown> | null {
  const cleaned = stripCodeFences(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    const {
      stage,
      title,
      body,
      is_crash_and_burn,
      conversation_history,
      user_answers,
      revision_request,
      round,
    } = await req.json();

    const systemPrompt =
      SYSTEM_PROMPT + (is_crash_and_burn ? CRASH_BURN_ADDENDUM : "");

    let userMessage = "";

    if (stage === "initial") {
      userMessage = `The user has written this moment:\n\nTitle: ${title}\n\nBody: ${body}\n\nBriefly reflect on what you notice in this moment (1-2 sentences), then ask 2-3 short, specific follow-up questions that will help you pull out the sensory details, feelings, and the real transformation underneath. Make the questions easy to answer — the kind you'd ask a friend over coffee.`;
    } else if (stage === "follow_up") {
      userMessage = `The user answered your questions: "${user_answers}"\n\nGreat — you're getting closer to the real moment. Based on what they've shared, ask 2-3 MORE follow-up questions that dig even deeper. Focus on:\n- Specific sensory details (what did it look/sound/feel like?)\n- The exact moment of internal shift\n- What they were thinking or feeling right before vs. after\n- Small physical details that make the scene vivid\n\nKeep it warm and conversational. Don't repeat questions they've already answered.`;
    } else if (stage === "enhance") {
      userMessage = `Based on everything the user has shared across this conversation, write an enhanced version of their moment.\n\nRules:\n- Write in the user's own voice and style (match their vocabulary and tone)\n- Weave in the specific sensory details and feelings they shared\n- Make it feel like THEIR story, not a generic retelling\n- Keep it to 150-250 words\n- Don't over-dramatize — stay true to the small, honest moment\n- Make the reader feel like they're standing right there\n\nRespond with ONLY a JSON object (no markdown, no code fences) with two fields:\n{"message": "a brief one-sentence framing of what you did", "enhanced_body": "the full enhanced story text"}`;
    } else if (stage === "revise") {
      userMessage = `The user wants these changes to the enhanced version: "${revision_request}"\n\nRevise accordingly, keeping their voice intact.\n\nRespond with ONLY a JSON object (no markdown, no code fences) with two fields:\n{"message": "brief acknowledgment of the change", "enhanced_body": "the revised story text"}`;
    }

    const messages = [
      ...(conversation_history || []),
      { role: "user" as const, content: userMessage },
    ];

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const responseText =
      response.content[0].type === "text"
        ? response.content[0].text
        : "";

    if (stage === "enhance" || stage === "revise") {
      const parsed = tryParseJSON(responseText);
      if (parsed && parsed.enhanced_body) {
        return new Response(JSON.stringify(parsed), {
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          message: "Here's your enhanced story:",
          enhanced_body: stripCodeFences(responseText),
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ message: responseText }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: String(error),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
