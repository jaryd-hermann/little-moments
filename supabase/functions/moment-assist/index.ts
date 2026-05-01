import Anthropic from "npm:@anthropic-ai/sdk";
import { anthropicAssistantText } from "../_shared/anthropicAssistantText.ts";
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

/** Recover a JSON string value for "key" when full JSON.parse fails (truncation, extra prose). */
function parseJsonStringField(raw: string, key: string): string | null {
  const re = new RegExp(
    `"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`,
    "s",
  );
  const m = raw.match(re);
  if (!m?.[1]) return null;
  try {
    return JSON.parse(`"${m[1]}"`) as string;
  } catch {
    return m[1]
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
}

function fallbackTitleFromRaw(raw: string): string {
  const words = raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
  if (words.length === 0) return "A moment";
  const t = words.join(" ");
  return t.length > 56 ? `${t.slice(0, 53)}…` : t;
}

function fallbackAssembleBody(
  raw_text: string,
  follow_up_answer: string | null | undefined,
): string {
  const parts = [raw_text?.trim(), follow_up_answer?.trim()].filter(
    (p): p is string => Boolean(p),
  );
  return parts.join("\n\n") || raw_text?.trim() || "";
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
        model: "claude-sonnet-4-6",
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      });

      const text = anthropicAssistantText(response.content).trim();
      const question =
        text ||
        "What is one small detail from that moment — a sound, a face, or where you were standing — that you still remember clearly?";

      return new Response(
        JSON.stringify({ question }),
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

      // Claude Sonnet 4.6+ rejects trailing assistant "prefill" messages; end with user only.
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      });

      const fullText = stripCodeFences(
        anthropicAssistantText(response.content).trim(),
      );

      const parsed = tryParseJSON(fullText);
      if (
        parsed &&
        typeof parsed.title === "string" &&
        typeof parsed.body === "string"
      ) {
        return new Response(
          JSON.stringify({
            title: parsed.title.trim(),
            body: parsed.body.trim(),
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const extractedTitle = parseJsonStringField(fullText, "title");
      const extractedBody = parseJsonStringField(fullText, "body");
      if (extractedTitle?.trim() && extractedBody?.trim()) {
        return new Response(
          JSON.stringify({
            title: extractedTitle.trim(),
            body: extractedBody.trim(),
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const fallbackBody = fallbackAssembleBody(raw_text, follow_up_answer);
      return new Response(
        JSON.stringify({
          title: fallbackTitleFromRaw(raw_text ?? ""),
          body: fallbackBody || stripCodeFences(fullText),
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
