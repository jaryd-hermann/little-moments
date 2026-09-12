import { createClient } from "npm:@supabase/supabase-js@2";
import {
  entryTextForEmbedding,
  loadThreadAnswersByEntryId,
} from "../_shared/thread-context.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const EMBEDDING_MODEL = "text-embedding-3-large";
const EMBEDDING_DIMENSIONS = 1536;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
    throw new Error(`OpenAI embedding error ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  return json.data[0].embedding;
}

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

    const { thread_id } = await req.json();
    if (!thread_id) {
      return json({ error: "thread_id required" }, 400);
    }

    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: thread, error: threadErr } = await serviceSupabase
      .from("threads")
      .select("entry_id_a, entry_id_b, user_id")
      .eq("id", thread_id)
      .eq("user_id", user.id)
      .single();

    if (threadErr || !thread) {
      return json({ error: "Thread not found" }, 404);
    }

    const entryIds = [thread.entry_id_a, thread.entry_id_b] as string[];
    const answersByEntry = await loadThreadAnswersByEntryId(
      serviceSupabase,
      user.id,
      entryIds
    );

    const { data: entries } = await serviceSupabase
      .from("entries")
      .select("id, body, ai_enhanced_body")
      .in("id", entryIds);

    let updated = 0;
    for (const entry of entries ?? []) {
      const bodyText = (entry.ai_enhanced_body ?? entry.body ?? "").trim();
      if (!bodyText) continue;
      const answer = answersByEntry.get(entry.id) ?? null;
      const embedText = entryTextForEmbedding(bodyText, answer);
      const embedding = await generateEmbedding(embedText);
      const embeddingStr = `[${embedding.join(",")}]`;
      await serviceSupabase
        .from("entries")
        .update({ embedding: embeddingStr })
        .eq("id", entry.id);
      updated += 1;
    }

    return json({ ok: true, entries_updated: updated });
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
