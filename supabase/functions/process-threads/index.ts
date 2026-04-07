import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";
import { sendExpoPushTickets } from "../_shared/expo-push.ts";
import { sendEmail } from "../_shared/resend.ts";
import { threadEmail } from "../_shared/email-templates/thread.ts";
import { observationPlainPreview } from "../_shared/thread-text.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const EMBEDDING_MODEL = "text-embedding-3-large";
/** Must match DB column + HNSW limit (≤2000 dims on Supabase/pgvector). */
const EMBEDDING_DIMENSIONS = 1536;

const anthropic = new Anthropic({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
});

const ANDROID_CHANNEL = "default";
const MIN_SIMILARITY = 0.78;
const MIN_CONFIDENCE = 0.75;
const MIN_DAY_GAP = 7;
const MAX_CANDIDATES = 15;
const FREE_THREAD_LIMIT = 3;

const METADATA_SYSTEM_PROMPT = `You extract structured metadata from a personal journal entry.
Return ONLY a JSON object with these fields:
{
  "people": ["list of named or referenced people"],
  "places": ["list of named or referenced places"],
  "named_feelings": ["specific feelings mentioned — grief, pride, longing, etc."],
  "sensory_details": ["descriptive sensory details — warm, light, early morning, the smell of coffee, etc."],
  "primary_emotion": "one word",
  "primary_theme": "one short phrase"
}
If a field has no matches, use an empty array or empty string. Return valid JSON only.`;

const CONNECTION_SYSTEM_PROMPT = `You are Ellie, a thoughtful memory companion for the Little Moments app.
You have been given a user's latest entry alongside several past entries that may be related.

Your job: identify only genuinely meaningful connections — the kind a thoughtful friend
who had read all their entries would notice and find worth saying aloud.

Be selective. Most entries will not have a real connection. Do not force one.
A real connection surprises the user, reveals a pattern they hadn't articulated,
or shows them something true about themselves.

Do NOT surface connections based on:
- Surface-level word overlap (both mention coffee, both mention the same name)
- Same general life domain (both are about work — that's not a connection)
- Time proximity

DO surface connections based on:
- The same underlying emotion expressed in genuinely different contexts
- A recurring theme the user clearly returns to without realizing it
- A belief or feeling that has visibly shifted over time
- A person, place, or sensory detail that keeps appearing at significant moments
- The same emotional texture — warmth, dread, quiet pride — in completely different situations

For each real connection found, return:
{
  "has_connection": true,
  "entry_id_a": "[new entry id]",
  "entry_id_b": "[past entry id]",
  "connection_type": "thematic | emotional | person | place | pattern | evolution",
  "confidence": 0.0-1.0,
  "ellie_observation": "2–4 short sentences, first person as Ellie, warm and vivid. Put your single sharpest takeaway in **double asterisks** so it shows as bold (e.g. **Both entries keep circling the same quiet fear of being left out.**). After that bold line, add 1–2 sentences with specific color from the entries—echo a phrase, image, or feeling from each moment, or spell out how the pattern shows up across time. Do not be generic. Bad: 'These share similar themes.'",
  "questions": [
    "One thoughtful, specific question for the user to sit with — not answerable immediately.",
    "Optional second question — only if genuinely distinct from the first. Omit if not."
  ]
}

The questions should:
- Name the insight specifically, then ask something actionable from it
- Sound like a curious friend, not a therapist or coach
- Never give advice
- Never be generic ("How does this make you feel?")
- Give the user something to think about, not something to do

If no real connection exists:
{ "has_connection": false }

Return JSON only. Return has_connection: false if no real connection exists.`;

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
    model: "claude-haiku-4-20250414",
    max_tokens: 512,
    system: METADATA_SYSTEM_PROMPT,
    messages: [{ role: "user", content: text }],
  });
  const raw =
    response.content[0].type === "text" ? response.content[0].text : "{}";
  const parsed = tryParseJSON(raw);
  return {
    people: Array.isArray(parsed?.people) ? parsed.people as string[] : [],
    places: Array.isArray(parsed?.places) ? parsed.places as string[] : [],
    named_feelings: Array.isArray(parsed?.named_feelings) ? parsed.named_feelings as string[] : [],
    sensory_details: Array.isArray(parsed?.sensory_details) ? parsed.sensory_details as string[] : [],
    primary_emotion: typeof parsed?.primary_emotion === "string" ? parsed.primary_emotion : "",
    primary_theme: typeof parsed?.primary_theme === "string" ? parsed.primary_theme : "",
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
}

async function analyzeConnections(
  newEntry: { id: string; title: string | null; body: string },
  candidates: Candidate[]
) {
  const candidateBlock = candidates
    .map(
      (c, i) =>
        `--- Past Entry ${i + 1} (id: ${c.id}, date: ${c.entry_date}) ---\nTitle: ${c.title ?? "(untitled)"}\n${c.ai_enhanced_body ?? c.body}`
    )
    .join("\n\n");

  const userMessage = `NEW ENTRY (id: ${newEntry.id}):\nTitle: ${newEntry.title ?? "(untitled)"}\n${newEntry.body}\n\nPAST ENTRIES:\n${candidateBlock}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1400,
    system: CONNECTION_SYSTEM_PROMPT,
    messages: [
      { role: "user", content: userMessage },
      { role: "assistant", content: "{" },
    ],
  });

  const raw =
    response.content[0].type === "text" ? response.content[0].text : "";
  return tryParseJSON(`{${raw}`);
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

    // 1. Fetch the entry
    const { data: entry, error: entryErr } = await userSupabase
      .from("entries")
      .select("id, title, body, ai_enhanced_body, entry_date, created_at, user_id")
      .eq("id", entry_id)
      .single();

    if (entryErr || !entry) {
      return jsonResponse({ error: "Entry not found" }, 404);
    }

    const entryText = (entry.ai_enhanced_body ?? entry.body ?? "").trim();
    if (!entryText) {
      return jsonResponse({ ok: true, skipped: "empty_entry" });
    }

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

    // 5. LLM connection analysis
    const result = await analyzeConnections(
      { id: entry_id, title: entry.title, body: entryText },
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

    // 6. Check free tier limit
    const { data: profile } = await serviceSupabase
      .from("profiles")
      .select("subscription_status, email, display_name, notification_enabled")
      .eq("id", user.id)
      .single();

    const isPremium = profile?.subscription_status === "active";

    const { data: stats } = await serviceSupabase
      .from("user_thread_stats")
      .select("total_connections")
      .eq("user_id", user.id)
      .single();

    const currentConnections = stats?.total_connections ?? 0;

    // Free users: still store threads (for instant unlock on upgrade) but don't send notifications past limit
    const pastFreeLimit = !isPremium && currentConnections >= FREE_THREAD_LIMIT;

    // 7. Store the thread
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

    // 9. Push notification (skip for free users past limit)
    if (!pastFreeLimit && profile?.notification_enabled) {
      const { data: tokens } = await serviceSupabase
        .from("push_tokens")
        .select("expo_push_token")
        .eq("user_id", user.id);

      if (tokens?.length) {
        const observation = (result.ellie_observation as string) ?? "";
        const preview = observationPlainPreview(observation);
        const truncated =
          preview.length > 120 ? preview.slice(0, 117) + "..." : preview;

        const tickets = tokens.map((t) => ({
          to: t.expo_push_token,
          title: "✦ Ellie found a Thread",
          body: truncated,
          sound: "default" as const,
          priority: "high" as const,
          channelId: ANDROID_CHANNEL,
          data: { type: "thread", threadId: thread.id },
        }));
        await sendExpoPushTickets(tickets).catch((e) =>
          console.error("Push send error:", e)
        );

        await serviceSupabase
          .from("threads")
          .update({ push_sent: true })
          .eq("id", thread.id);
      }
    }

    // 10. Email (skip for free users past limit)
    if (!pastFreeLimit && profile?.email) {
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

      await sendEmail({
        to: profile.email,
        subject: email.subject,
        html: email.html,
      }).catch((e) => console.error("Email send error:", e));

      await serviceSupabase
        .from("threads")
        .update({ email_sent: true })
        .eq("id", thread.id);
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
