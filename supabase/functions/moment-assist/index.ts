import Anthropic from "npm:@anthropic-ai/sdk";
import { requireAuthUser } from "../_shared/requireAuthUser.ts";

const anthropic = new Anthropic({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
});

const SYSTEM_PROMPT = `You are Ellie, a warm and curious memory guide. Your job is to help people capture their everyday moments — the small, real things that make up a life.

Core principles:
- You care about the specific, sensory details: what things looked like, sounded like, felt like
- You're interested in feelings and small internal shifts, not big dramatic events
- You sound like a curious friend — brief, warm, never clinical or therapeutic
- Never say "great answer" or give empty affirmations
- Never lecture or coach — just be curious and helpful
- Keep everything conversational and brief

You are NOT a storytelling coach. You are a memory guide. Your goal is to help people remember and capture, not to teach them to write.`;

const FOLLOW_UP_INSTRUCTION = `The user just spoke or wrote about a moment triggered by a starting point. Your job: ask ONE specific follow-up question to pull out one more detail from this memory.

Rules:
- Ask exactly ONE question — no exceptions
- Make it SPECIFIC, not open-ended. Examples: "What were you feeling right in that moment?", "Who else was there?", "What did the room look like?", "What time of day was it?"
- Never ask "tell me more" or "can you elaborate"
- Keep it to 1-2 sentences max
- Match the warmth and specificity of what they shared`;

const ASSEMBLE_INSTRUCTION = `Your job: take the user's raw words and their follow-up answer, and assemble them into a clean, readable moment.

Rules:
- Write in FIRST PERSON ("I") as if the user wrote it
- Do NOT add anything they didn't say — only organize and lightly clean up their words
- Generate a short, evocative title (3-7 words) from the content
- Keep the body 50-200 words — concise but complete
- Preserve their voice, vocabulary, and tone exactly
- Structure it as one or two natural paragraphs
- Do NOT dramatize, embellish, or add literary flourish
- This should read like a personal memory entry, not a polished essay

Respond with ONLY a JSON object (no markdown, no code fences):
{"title": "short evocative title", "body": "the assembled moment in first person"}`;

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
      raw_text,
      prompt_type,
      prompt_value,
      follow_up_answer,
    } = await req.json();

    if (stage === "follow_up") {
      const contextLine =
        prompt_type === "word"
          ? `Starting point: the word "${prompt_value}"`
          : prompt_type === "photo"
            ? `Starting point: a photo from their camera roll`
            : prompt_type === "question"
              ? `Starting point: the question "${prompt_value}"`
              : `Starting point: free-form entry`;

      const userMessage = `${contextLine}\n\nHere's what the user said:\n\n${raw_text}\n\n${FOLLOW_UP_INSTRUCTION}`;

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      });

      const text =
        response.content[0].type === "text" ? response.content[0].text : "";

      return new Response(
        JSON.stringify({ question: text.trim() }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (stage === "assemble") {
      const contextLine =
        prompt_type === "word"
          ? `Starting point: the word "${prompt_value}"`
          : prompt_type === "photo"
            ? `Starting point: a photo from their camera roll`
            : prompt_type === "question"
              ? `Starting point: the question "${prompt_value}"`
              : `Starting point: free-form entry`;

      const userMessage = `${contextLine}\n\nOriginal response:\n${raw_text}\n\nFollow-up answer:\n${follow_up_answer ?? "(skipped)"}\n\n${ASSEMBLE_INSTRUCTION}`;

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [
          { role: "user", content: userMessage },
          { role: "assistant", content: "{" },
        ],
      });

      const rawText =
        response.content[0].type === "text" ? response.content[0].text : "";
      const fullText = `{${rawText}`;

      const parsed = tryParseJSON(fullText);
      if (
        parsed &&
        typeof parsed.title === "string" &&
        typeof parsed.body === "string"
      ) {
        return new Response(
          JSON.stringify({ title: parsed.title, body: parsed.body }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          title: "A moment",
          body: stripCodeFences(fullText),
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown stage: ${stage}` }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: String(error),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
