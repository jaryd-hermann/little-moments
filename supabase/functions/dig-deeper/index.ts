import Anthropic from "npm:@anthropic-ai/sdk";
import { anthropicAssistantText } from "../_shared/anthropicAssistantText.ts";
import { requireAuthUser } from "../_shared/requireAuthUser.ts";

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

IMPORTANT: Never lecture about storytelling. Just ask, listen, and help. Keep responses conversational and brief. During the question phase, speak naturally — no JSON or code. When told to produce the enhanced story, follow the output format exactly as instructed.`;

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
  const auth = await requireAuthUser(req);
  if (!auth.ok) return auth.response;

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
      userMessage = `The user has written this moment:\n\nTitle: ${title}\n\nBody: ${body}\n\nWrite ONLY this — no preamble, no warm-up, no commentary about the writing or the title:\n\nLine 1 (literal): "A few things I'm curious about:"\nThen a blank line.\nThen exactly THREE bullet questions, each on its own line starting with "• ", with a BLANK LINE between each bullet so they read with breathing room. Each question must be one sentence — specific to THIS moment, asking about sensory details, the moment of internal shift, or feelings underneath. Do not number them. Do not add any other lines. Output exactly: opener, blank line, bullet, blank line, bullet, blank line, bullet.`;
    } else if (stage === "follow_up") {
      userMessage = `The user answered your questions: "${user_answers}"\n\nGreat — you're getting closer to the real moment. Based on what they've shared, ask 2-3 MORE follow-up questions that dig even deeper. Focus on:\n- Specific sensory details (what did it look/sound/feel like?)\n- The exact moment of internal shift\n- What they were thinking or feeling right before vs. after\n- Small physical details that make the scene vivid\n\nKeep it warm and conversational. Don't repeat questions they've already answered.`;
    } else if (stage === "enhance") {
      userMessage = `IMPORTANT — STOP ASKING QUESTIONS. The conversation phase is over.

Your ONLY task now: write an enhanced version of the user's moment as a polished first-person story.

CRITICAL RULES:
- Write the story IN FIRST PERSON ("I") as if the user themselves wrote it
- Do NOT address the user — no "you", "your", or speaking TO them
- Do NOT include any conversational commentary, coaching, or questions
- Weave in the specific sensory details, feelings, and moments they shared in the conversation
- Match the user's own vocabulary and tone
- Keep it 150–250 words
- Stay true to the small, honest moment — don't over-dramatize
- Break the story into 2–3 paragraphs. Use a real blank line (\\n\\n) between paragraphs so it reads like prose, not one wall of text.

Original entry title: ${title}
Original entry body: ${body}

Respond with ONLY a JSON object (no markdown, no code fences). The "enhanced_body" string MUST contain literal \\n\\n sequences between paragraphs.
{"message": "one brief sentence about the enhancement", "enhanced_body": "the full enhanced story in first person, with \\n\\n paragraph breaks"}`;
    } else if (stage === "revise") {
      userMessage = `IMPORTANT — STOP CONVERSING. Produce a revised story only.

The user wants these changes to the enhanced version: "${revision_request}"

CRITICAL RULES:
- Write the revised story IN FIRST PERSON ("I") as if the user themselves wrote it
- Do NOT address the user — no "you", "your", or speaking TO them
- Do NOT include any conversational commentary, coaching, or questions
- Apply the requested changes while keeping their voice intact
- Break the story into 2–3 paragraphs separated by blank lines (\\n\\n).

Respond with ONLY a JSON object (no markdown, no code fences). The "enhanced_body" string MUST contain literal \\n\\n sequences between paragraphs.
{"message": "brief acknowledgment of the change", "enhanced_body": "the revised story in first person, with \\n\\n paragraph breaks"}`;
    }

    const needsJson = stage === "enhance" || stage === "revise";

    // Claude Sonnet 4.6+ does not support assistant message prefill; conversation must end with user.
    const messages = [
      ...(conversation_history || []),
      { role: "user" as const, content: userMessage },
    ];

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const rawText = anthropicAssistantText(response.content);

    const responseText = needsJson ? stripCodeFences(rawText.trim()) : rawText;

    if (needsJson) {
      const parsed = tryParseJSON(responseText);
      if (parsed && typeof parsed.enhanced_body === "string" && parsed.enhanced_body.trim()) {
        return new Response(
          JSON.stringify({
            message: typeof parsed.message === "string" ? parsed.message : "Here's your enhanced story:",
            enhanced_body: parsed.enhanced_body,
            ...(typeof parsed.enhanced_title === "string" ? { enhanced_title: parsed.enhanced_title } : {}),
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      const storyMatch = responseText.match(
        /"enhanced_body"\s*:\s*"((?:[^"\\]|\\.)*)"/s
      );
      if (storyMatch) {
        let body: string;
        try {
          body = JSON.parse(`"${storyMatch[1]}"`);
        } catch {
          body = storyMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
        }
        return new Response(
          JSON.stringify({
            message: "Here's your enhanced story:",
            enhanced_body: body,
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          message: "Here's your enhanced story:",
          enhanced_body: stripCodeFences(responseText),
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const message =
      responseText.trim() ||
      "What is one detail from this moment — a place, a person, or something you were feeling — that still feels vivid when you think about it?";

    return new Response(JSON.stringify({ message }), {
      headers: { "Content-Type": "application/json" },
    });
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
