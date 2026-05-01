/**
 * Backfill entry_metadata + embeddings for entries that pre-date Threads,
 * or whose theme/emotion was nulled by migration 0030.
 *
 * Two-pass strategy:
 *   Pass A — entries.embedding IS NULL: regenerate embedding AND metadata.
 *   Pass B — entry_metadata.primary_theme/emotion IS NULL: re-extract metadata.
 *
 * Each invocation processes up to `limit` entries per pass (default 25,
 * capped at 50) to stay under the 150s edge function timeout. The caller
 * should loop until the response reports `done: true`.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>.
 * Body (optional): { user_id?: string, limit?: number }
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";
import {
  THEME_ENUM,
  EMOTION_ENUM,
  coerceTheme,
  coerceEmotion,
} from "../_shared/graph-palette.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const EMBEDDING_MODEL = "text-embedding-3-large";
const EMBEDDING_DIMENSIONS = 1536;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

const anthropic = new Anthropic({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
});

const METADATA_SYSTEM_PROMPT = `You extract structured metadata from a personal journal entry.
Return ONLY a JSON object with these fields:
{
  "people": ["list of named or referenced people"],
  "places": ["list of named or referenced places"],
  "named_feelings": ["specific feelings mentioned"],
  "sensory_details": ["descriptive sensory details"],
  "primary_emotion": "EXACTLY ONE of: ${EMOTION_ENUM.join(", ")}",
  "primary_theme": "EXACTLY ONE of: ${THEME_ENUM.join(", ")}"
}

primary_emotion and primary_theme MUST be chosen from the lists above — no other values are accepted. If none fit well, choose the closest match. If the entry is too short or neutral to classify, use an empty string "" for that field.

Theme guidance:
- belonging: feeling held, seen, part of something
- loss: grief, endings, what's gone
- pride: accomplishment, self-respect, showing up
- family: parents, kids, siblings, family-of-origin dynamics
- work: job, career, craft, professional identity
- change: transition, uncertainty, something shifting
- place: a specific location's hold on the person
- growth: learning, becoming, expanding
- joy: delight, play, lightness
- uncertain: confusion, ambivalence, not-knowing

If a list field has no matches, use an empty array. Return valid JSON only.`;

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*\n?/gm, "")
    .replace(/\n?```\s*$/gm, "")
    .trim();
}

function tryParseJSON(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(stripCodeFences(text));
  } catch {
    return null;
  }
}

async function generateEmbedding(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embedding error ${res.status}: ${err}`);
  }
  const json = await res.json();
  return json.data[0].embedding;
}

async function extractMetadata(text: string) {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: METADATA_SYSTEM_PROMPT,
    messages: [{ role: "user", content: text }],
  });
  const raw =
    response.content[0].type === "text" ? response.content[0].text : "{}";
  const parsed = tryParseJSON(raw);
  return {
    people: Array.isArray(parsed?.people) ? (parsed.people as string[]) : [],
    places: Array.isArray(parsed?.places) ? (parsed.places as string[]) : [],
    named_feelings: Array.isArray(parsed?.named_feelings)
      ? (parsed.named_feelings as string[])
      : [],
    sensory_details: Array.isArray(parsed?.sensory_details)
      ? (parsed.sensory_details as string[])
      : [],
    primary_emotion: coerceEmotion(parsed?.primary_emotion),
    primary_theme: coerceTheme(parsed?.primary_theme),
  };
}

interface EntryRow {
  id: string;
  user_id: string;
  title: string | null;
  body: string;
  ai_enhanced_body: string | null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let body: { user_id?: string; limit?: number; before?: string } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine
  }

  const targetUserId = body.user_id;
  const limit = Math.min(
    Math.max(body.limit ?? DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );

  // ── `before` is a stability guard against infinite loops. Rows where
  // the LLM genuinely can't classify (too short / neutral) keep returning
  // null, so a naive filter "theme is null OR emotion is null" re-selects
  // them forever. We solve this by bumping `extracted_at` on every pass B
  // write (success, empty-body skip, or null-result), and filtering to
  // rows older than `before`. Caller passes the start-of-session timestamp
  // once and reuses it across the loop — rows attempted in this session
  // drop out of the filter and the loop terminates.
  const beforeRaw = typeof body.before === "string" ? body.before : null;
  const before =
    beforeRaw && !isNaN(Date.parse(beforeRaw)) ? beforeRaw : null;

  let processedA = 0;
  let processedB = 0;
  const errors: Array<{ entry_id: string; error: string }> = [];

  // ── Pass A: entries with no embedding — regenerate embedding + metadata.
  {
    let q = supabase
      .from("entries")
      .select("id, user_id, title, body, ai_enhanced_body")
      .is("embedding", null)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (targetUserId) q = q.eq("user_id", targetUserId);

    const { data: rows, error } = await q;
    if (error) return jsonResponse({ error: error.message }, 500);

    for (const entry of (rows ?? []) as EntryRow[]) {
      const text = (entry.ai_enhanced_body ?? entry.body ?? "").trim();
      if (!text) {
        processedA++;
        continue;
      }
      try {
        const [embedding, metadata] = await Promise.all([
          generateEmbedding(text),
          extractMetadata(text),
        ]);
        const embeddingStr = `[${embedding.join(",")}]`;
        await supabase
          .from("entries")
          .update({ embedding: embeddingStr })
          .eq("id", entry.id);
        await supabase.from("entry_metadata").upsert(
          {
            entry_id: entry.id,
            user_id: entry.user_id,
            people: metadata.people,
            places: metadata.places,
            named_feelings: metadata.named_feelings,
            sensory_details: metadata.sensory_details,
            primary_emotion: metadata.primary_emotion,
            primary_theme: metadata.primary_theme,
          },
          { onConflict: "entry_id" }
        );
        processedA++;
      } catch (e) {
        errors.push({ entry_id: entry.id, error: String(e) });
      }
    }
  }

  // ── Pass B: entry_metadata rows where theme or emotion is null —
  //    re-extract metadata only (embedding already exists).
  const remainingBudget = Math.max(limit - processedA, 0);
  if (remainingBudget > 0) {
    let q = supabase
      .from("entry_metadata")
      .select(
        "entry_id, user_id, entries!inner(id, title, body, ai_enhanced_body)"
      )
      .or("primary_theme.is.null,primary_emotion.is.null")
      .limit(remainingBudget);
    if (targetUserId) q = q.eq("user_id", targetUserId);
    if (before) q = q.lt("extracted_at", before);

    const { data: rows, error } = await q;
    if (error) return jsonResponse({ error: error.message }, 500);

    type Row = {
      entry_id: string;
      user_id: string;
      entries: {
        id: string;
        title: string | null;
        body: string;
        ai_enhanced_body: string | null;
      } | null;
    };

    const now = () => new Date().toISOString();

    for (const row of (rows ?? []) as Row[]) {
      const entry = row.entries;
      if (!entry) {
        // Orphan metadata — mark as attempted so we don't reselect.
        await supabase
          .from("entry_metadata")
          .update({ extracted_at: now() })
          .eq("entry_id", row.entry_id);
        processedB++;
        continue;
      }
      const text = (entry.ai_enhanced_body ?? entry.body ?? "").trim();
      if (!text) {
        await supabase
          .from("entry_metadata")
          .update({ extracted_at: now() })
          .eq("entry_id", row.entry_id);
        processedB++;
        continue;
      }
      try {
        const metadata = await extractMetadata(text);
        await supabase
          .from("entry_metadata")
          .update({
            people: metadata.people,
            places: metadata.places,
            named_feelings: metadata.named_feelings,
            sensory_details: metadata.sensory_details,
            primary_emotion: metadata.primary_emotion,
            primary_theme: metadata.primary_theme,
            extracted_at: now(),
          })
          .eq("entry_id", row.entry_id);
        processedB++;
      } catch (e) {
        errors.push({ entry_id: row.entry_id, error: String(e) });
      }
    }
  }

  // ── Report remaining so caller knows when to stop looping.
  const countQueryA = supabase
    .from("entries")
    .select("id", { count: "exact", head: true })
    .is("embedding", null);
  if (targetUserId) countQueryA.eq("user_id", targetUserId);
  const { count: remainingA } = await countQueryA;

  const countQueryB = supabase
    .from("entry_metadata")
    .select("entry_id", { count: "exact", head: true })
    .or("primary_theme.is.null,primary_emotion.is.null");
  if (targetUserId) countQueryB.eq("user_id", targetUserId);
  if (before) countQueryB.lt("extracted_at", before);
  const { count: remainingB } = await countQueryB;

  const remaining = (remainingA ?? 0) + (remainingB ?? 0);

  return jsonResponse({
    ok: true,
    processed: processedA + processedB,
    processed_pass_a: processedA,
    processed_pass_b: processedB,
    remaining,
    done: remaining === 0,
    errors: errors.length ? errors : undefined,
  });
});
