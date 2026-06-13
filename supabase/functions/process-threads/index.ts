import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";
import { dispatch } from "../_shared/dispatch.ts";
import { threadEmail } from "../_shared/email-templates/thread.ts";
import { observationPlainPreview } from "../_shared/thread-text.ts";
import {
  THEME_ENUM,
  EMOTION_ENUM,
  coerceTheme,
  coerceEmotion,
} from "../_shared/graph-palette.ts";
import { anthropicAssistantText } from "../_shared/anthropicAssistantText.ts";
import {
  MAX_CANDIDATES,
  MIN_CONFIDENCE,
  MIN_DAY_GAP,
  MIN_SIMILARITY,
  REALTIME_WEEKLY_THREAD_LIMIT,
} from "../_shared/thread-thresholds.ts";
import { CONNECTION_SYSTEM_PROMPT } from "../_shared/thread-prompts.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const EMBEDDING_MODEL = "text-embedding-3-large";
/** Must match DB column + HNSW limit (≤2000 dims on Supabase/pgvector). */
const EMBEDDING_DIMENSIONS = 1536;

const anthropic = new Anthropic({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
});

// Tiered free model. Users on `active` or `trial` subscriptions get unlimited
// threads. Everyone else (free / cancelled / expired):
//   - Threads 1..FREE_VISIBLE_LIMIT       → stored, visible, push + email sent
//   - Threads (limit+1)..FREE_PROCESS_LIMIT → stored, locked teasers, no push/email
//   - Past FREE_PROCESS_LIMIT             → not processed at all (cost cap)
// Locked threads still live in the DB so they unlock instantly on upgrade.
// Keep both constants in sync with cron-threads-nightly/index.ts and
// hooks/useThreads.ts.
const FREE_VISIBLE_LIMIT = 5;
const FREE_PROCESS_LIMIT = 10;

const METADATA_SYSTEM_PROMPT = `You extract structured metadata from a personal journal entry.
Return ONLY a JSON object with these fields:
{
  "people": ["list of named or referenced people"],
  "places": ["list of named or referenced places"],
  "named_feelings": ["specific feelings mentioned — grief, pride, longing, etc."],
  "sensory_details": ["descriptive sensory details — warm, light, early morning, the smell of coffee, etc."],
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

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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

// ── OpenAI Embedding ──────────────────────────────────────────────

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

// ── Metadata Extraction (Claude Haiku) ────────────────────────────

async function extractMetadata(text: string) {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: METADATA_SYSTEM_PROMPT,
    messages: [{ role: "user", content: text }],
  });
  const raw = anthropicAssistantText(response.content).trim() || "{}";
  const parsed = tryParseJSON(raw);
  return {
    people: Array.isArray(parsed?.people) ? parsed.people as string[] : [],
    places: Array.isArray(parsed?.places) ? parsed.places as string[] : [],
    named_feelings: Array.isArray(parsed?.named_feelings) ? parsed.named_feelings as string[] : [],
    sensory_details: Array.isArray(parsed?.sensory_details) ? parsed.sensory_details as string[] : [],
    primary_emotion: coerceEmotion(parsed?.primary_emotion),
    primary_theme: coerceTheme(parsed?.primary_theme),
  };
}

// ── Connection Analysis (Claude Sonnet) ───────────────────────────

interface Candidate {
  id: string;
  title: string | null;
  body: string;
  ai_enhanced_body: string | null;
  created_at: string;
  entry_date: string;
  similarity: number;
  /** Photo's original capture time (EXIF/MediaLibrary), null if no photo. */
  photo_taken_at?: string | null;
}

/**
 * The "effective" date for a moment is the day the photo was actually taken
 * (when one is attached), not the day the user opened the app to record it.
 * Threads compare these across entries so connections like "3 weeks apart"
 * reflect the real lived gap, not journaling cadence.
 */
function effectiveDateString(
  entryDate: string | null | undefined,
  photoTakenAt: string | null | undefined
): string {
  if (photoTakenAt) {
    // Trim to YYYY-MM-DD so the LLM gets a clean calendar day, matching
    // entry_date's format and avoiding spurious timezone wobble.
    return photoTakenAt.slice(0, 10);
  }
  return entryDate ?? "";
}

async function analyzeConnections(
  newEntry: {
    id: string;
    title: string | null;
    body: string;
    effective_date: string;
  },
  candidates: Candidate[]
) {
  const candidateBlock = candidates
    .map((c, i) => {
      const effective = effectiveDateString(c.entry_date, c.photo_taken_at);
      return `--- Past Entry ${i + 1} (id: ${c.id}, date: ${effective}) ---\nTitle: ${c.title ?? "(untitled)"}\n${c.ai_enhanced_body ?? c.body}`;
    })
    .join("\n\n");

  const userMessage = `NEW ENTRY (id: ${newEntry.id}, date: ${newEntry.effective_date}):\nTitle: ${newEntry.title ?? "(untitled)"}\n${newEntry.body}\n\nPAST ENTRIES:\n${candidateBlock}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1400,
    system: CONNECTION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const raw = anthropicAssistantText(response.content).trim();
  return tryParseJSON(raw);
}

// ── Main Handler ──────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
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
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { entry_id } = await req.json();
    if (!entry_id) {
      return jsonResponse({ error: "entry_id required" }, 400);
    }

    // Service-role client for writes that bypass RLS
    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Fetch the entry (+ first attached photo's taken_at, used as the
    //    "effective date" so thread reasoning is anchored to when the photo
    //    was actually taken — not when the user happened to log the entry).
    const { data: entry, error: entryErr } = await userSupabase
      .from("entries")
      .select(
        "id, title, body, ai_enhanced_body, entry_date, created_at, user_id, entry_media(taken_at, display_order)"
      )
      .eq("id", entry_id)
      .single();

    if (entryErr || !entry) {
      return jsonResponse({ error: "Entry not found" }, 404);
    }

    const entryText = (entry.ai_enhanced_body ?? entry.body ?? "").trim();
    if (!entryText) {
      return jsonResponse({ ok: true, skipped: "empty_entry" });
    }

    const entryMedia =
      ((entry as { entry_media?: { taken_at: string | null; display_order: number | null }[] })
        .entry_media ?? [])
        .slice()
        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    const newEntryPhotoTakenAt = entryMedia[0]?.taken_at ?? null;
    const newEntryEffectiveDate = effectiveDateString(
      entry.entry_date,
      newEntryPhotoTakenAt
    );

    // 2. Parallel: generate embedding + extract metadata
    const [embedding, metadata] = await Promise.all([
      generateEmbedding(entryText),
      extractMetadata(entryText),
    ]);

    // 3. Store embedding + metadata
    const embeddingStr = `[${embedding.join(",")}]`;

    await serviceSupabase
      .from("entries")
      .update({ embedding: embeddingStr })
      .eq("id", entry_id);

    await serviceSupabase.from("entry_metadata").upsert(
      {
        entry_id,
        user_id: user.id,
        people: metadata.people,
        places: metadata.places,
        named_feelings: metadata.named_feelings,
        sensory_details: metadata.sensory_details,
        primary_emotion: metadata.primary_emotion,
        primary_theme: metadata.primary_theme,
      },
      { onConflict: "entry_id" }
    );

    // 4. Cosine similarity search
    const { data: candidates, error: simErr } = await serviceSupabase.rpc(
      "match_entries",
      {
        query_embedding: embeddingStr,
        match_user_id: user.id,
        exclude_entry_id: entry_id,
        min_day_gap: MIN_DAY_GAP,
        similarity_threshold: MIN_SIMILARITY,
        match_count: MAX_CANDIDATES,
      }
    );

    if (simErr || !candidates?.length) {
      return jsonResponse({ ok: true, threads_found: 0 });
    }

    // Filter out entries already connected to this entry
    const { data: existingThreads } = await serviceSupabase
      .from("threads")
      .select("entry_id_a, entry_id_b")
      .or(`entry_id_a.eq.${entry_id},entry_id_b.eq.${entry_id}`)
      .eq("user_id", user.id);

    const connectedIds = new Set<string>();
    for (const t of existingThreads ?? []) {
      connectedIds.add(t.entry_id_a);
      connectedIds.add(t.entry_id_b);
    }

    const filteredCandidates = (candidates as Candidate[]).filter(
      (c) => !connectedIds.has(c.id)
    );

    if (filteredCandidates.length === 0) {
      return jsonResponse({ ok: true, threads_found: 0 });
    }

    // Enrich candidates with their photo taken_at so the LLM sees the real
    // photo dates (not the day the user happened to journal). Single round
    // trip; first row per entry by display_order.
    const candidateIds = filteredCandidates.map((c) => c.id);
    const { data: candidateMedia } = await serviceSupabase
      .from("entry_media")
      .select("entry_id, taken_at, display_order")
      .in("entry_id", candidateIds)
      .order("display_order", { ascending: true });

    const photoTakenAtByEntry = new Map<string, string | null>();
    for (const row of (candidateMedia ?? []) as {
      entry_id: string;
      taken_at: string | null;
      display_order: number | null;
    }[]) {
      if (!photoTakenAtByEntry.has(row.entry_id)) {
        photoTakenAtByEntry.set(row.entry_id, row.taken_at ?? null);
      }
    }
    for (const c of filteredCandidates) {
      c.photo_taken_at = photoTakenAtByEntry.get(c.id) ?? null;
    }

    // Read profile + thread count BEFORE the expensive Claude call so we can
    // skip processing entirely for free users who have already hit the cap.
    const { data: profile } = await serviceSupabase
      .from("profiles")
      .select("subscription_status, email, display_name, notification_enabled")
      .eq("id", user.id)
      .single();

    const hasUnlimitedThreads =
      profile?.subscription_status === "active" ||
      profile?.subscription_status === "trial";

    const { data: stats } = await serviceSupabase
      .from("user_thread_stats")
      .select("total_connections")
      .eq("user_id", user.id)
      .maybeSingle();

    const currentConnections = stats?.total_connections ?? 0;

    // Cost cap: free users at FREE_PROCESS_LIMIT do not get further analysis
    // until they upgrade. Embedding + metadata are already saved above so
    // future backfill (e.g. after upgrade) can pick up where we stopped.
    if (!hasUnlimitedThreads && currentConnections >= FREE_PROCESS_LIMIT) {
      return jsonResponse({
        ok: true,
        threads_found: 0,
        skipped: "free_process_limit_reached",
      });
    }

    // Weekly pacing — threads should feel rare (max 2 per rolling 7 days).
    const sevenDaysAgoIso = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { count: threadsLast7d, error: weeklyCountErr } = await serviceSupabase
      .from("threads")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", sevenDaysAgoIso);
    if (weeklyCountErr) {
      console.error("Weekly thread cap query failed:", weeklyCountErr);
    } else if ((threadsLast7d ?? 0) >= REALTIME_WEEKLY_THREAD_LIMIT) {
      return jsonResponse({
        ok: true,
        threads_found: 0,
        skipped: "weekly_limit",
      });
    }

    // 5. LLM connection analysis
    const result = await analyzeConnections(
      {
        id: entry_id,
        title: entry.title,
        body: entryText,
        effective_date: newEntryEffectiveDate,
      },
      filteredCandidates
    );

    if (!result || result.has_connection !== true) {
      return jsonResponse({ ok: true, threads_found: 0 });
    }

    const confidence = Number(result.confidence ?? 0);
    if (confidence < MIN_CONFIDENCE) {
      return jsonResponse({ ok: true, threads_found: 0, below_threshold: true });
    }

    const validTypes = ["thematic", "emotional", "person", "place", "pattern", "evolution"];
    const connectionType = validTypes.includes(result.connection_type as string)
      ? (result.connection_type as string)
      : "thematic";

    // 6. Store the thread. Profile + thread count were loaded above (step 4.5)
    //    so we can reuse `profile`, `hasUnlimitedThreads`, and `currentConnections`
    //    for the tier-gating + notification step below.
    const entryIdA = entry_id;
    const entryIdB = result.entry_id_b as string;

    const { data: thread, error: threadErr } = await serviceSupabase
      .from("threads")
      .insert({
        user_id: user.id,
        entry_id_a: entryIdA,
        entry_id_b: entryIdB,
        connection_type: connectionType,
        ellie_observation: result.ellie_observation as string,
        questions: Array.isArray(result.questions) ? result.questions : [],
        confidence,
        source: "realtime",
      })
      .select("id")
      .single();

    if (threadErr) {
      // Unique constraint violation (duplicate pair) — not an error
      if (threadErr.code === "23505") {
        return jsonResponse({ ok: true, threads_found: 0, duplicate: true });
      }
      throw threadErr;
    }

    // 8. Upsert user_thread_stats
    await serviceSupabase.rpc("increment_thread_count", {
      p_user_id: user.id,
    });
    const newCount = currentConnections + 1;

    // Free users past the visible limit: thread is stored (above) but stays
    // locked in the UI (see hooks/useThreads.ts) and we send no push/email.
    const pastVisibleLimit =
      !hasUnlimitedThreads && newCount > FREE_VISIBLE_LIMIT;

    // 9. Push notification (skip when locked teaser).
    //    Routed through OneSignal via dispatch() so this lines up with
    //    the rest of the lifecycle messaging system (one-shot keyed on
    //    thread id, logged in lifecycle_dispatches).
    if (!pastVisibleLimit && profile?.notification_enabled) {
      const observation = (result.ellie_observation as string) ?? "";
      const preview = observationPlainPreview(observation);
      const truncated =
        preview.length > 120 ? preview.slice(0, 117) + "..." : preview;

      const r = await dispatch(serviceSupabase, {
        userId: user.id,
        eventKey: `thread_surfaced:${thread.id}`,
        channel: "push",
        oneShot: true,
        payload: { thread_id: thread.id },
        push: {
          title: "Ellie found a thread",
          body: truncated,
          data: { type: "thread", thread_id: thread.id },
        },
      });
      if (r.sent) {
        await serviceSupabase
          .from("threads")
          .update({ push_sent: true })
          .eq("id", thread.id);
      }
    }

    // 10. Email (skip when locked teaser)
    if (!pastVisibleLimit && profile?.email) {
      const { data: entryB } = await serviceSupabase
        .from("entries")
        .select("title")
        .eq("id", entryIdB)
        .single();

      const email = threadEmail({
        displayName: profile.display_name,
        ellieObservation: result.ellie_observation as string,
        entryTitleA: entry.title,
        entryTitleB: entryB?.title,
      });

      const r = await dispatch(serviceSupabase, {
        userId: user.id,
        eventKey: `thread_surfaced_email:${thread.id}`,
        channel: "email",
        oneShot: true,
        payload: { thread_id: thread.id },
        email: {
          to: profile.email,
          subject: email.subject,
          html: email.html,
        },
      });
      if (r.sent) {
        await serviceSupabase
          .from("threads")
          .update({ email_sent: true })
          .eq("id", thread.id);
      }
    }

    return jsonResponse({ ok: true, threads_found: 1, thread_id: thread.id });
  } catch (e) {
    console.error("process-threads error:", e);
    return jsonResponse(
      { error: "Internal server error", details: String(e) },
      500
    );
  }
});
