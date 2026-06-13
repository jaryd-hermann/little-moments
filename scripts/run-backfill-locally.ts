/**
 * Local mirror of the `backfill-entry-metadata` edge function — useful when
 * we need to recover orphaned entries but don't have CRON_SECRET on hand.
 *
 * Identical two-pass strategy:
 *   Pass A — entries.embedding IS NULL: regenerate embedding AND metadata.
 *   Pass B — entry_metadata.primary_theme/emotion IS NULL: re-extract metadata only.
 *
 * Restricts to entry_type='moment' so we don't waste tokens classifying
 * server-side `chapter` rows (they aren't shown in the brain graph anyway
 * once useGraph filters by entry_type — see the matching change there).
 *
 * Run:
 *   npx tsx scripts/run-backfill-locally.ts                     # all users
 *   npx tsx scripts/run-backfill-locally.ts <user_id>           # single user
 *   npx tsx scripts/run-backfill-locally.ts --email a@b.com     # lookup by email
 *
 * Env required (auto-read from .env):
 *   EXPO_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OPENAI_API_KEY
 *   ANTHROPIC_API_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

try {
  const envText = readFileSync(resolve(process.cwd(), ".env"), "utf8");
  for (const line of envText.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  }
} catch {
  // .env optional
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE || !OPENAI_API_KEY || !ANTHROPIC_API_KEY) {
  console.error(
    "Missing one of: EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Kept inline so this script stays standalone — must match the edge
// function values exactly (graph-palette.ts constants).
const THEMES = [
  "belonging", "loss", "pride", "family", "work",
  "change", "place", "growth", "joy", "uncertain",
];
const EMOTIONS = [
  "joy", "sadness", "anger", "fear", "love",
  "longing", "pride", "peace",
];

function coerceTheme(v: unknown): string {
  if (typeof v !== "string") return "";
  const t = v.toLowerCase().trim();
  return THEMES.includes(t) ? t : "";
}
function coerceEmotion(v: unknown): string {
  if (typeof v !== "string") return "";
  const e = v.toLowerCase().trim();
  return EMOTIONS.includes(e) ? e : "";
}

const METADATA_SYSTEM_PROMPT = `You extract structured metadata from a personal journal entry.
Return ONLY a JSON object with these fields:
{
  "people": ["list of named or referenced people"],
  "places": ["list of named or referenced places"],
  "named_feelings": ["specific feelings mentioned"],
  "sensory_details": ["descriptive sensory details"],
  "primary_emotion": "EXACTLY ONE of: ${EMOTIONS.join(", ")}",
  "primary_theme": "EXACTLY ONE of: ${THEMES.join(", ")}"
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
      model: "text-embedding-3-large",
      input: text,
      dimensions: 1536,
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data[0].embedding;
}

async function extractMetadata(text: string) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: METADATA_SYSTEM_PROMPT,
      messages: [{ role: "user", content: text }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    content: { type: string; text?: string }[];
  };
  const first = json.content?.[0];
  const raw = first?.type === "text" ? first.text ?? "{}" : "{}";
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
  body: string | null;
  ai_enhanced_body: string | null;
}

async function passA(targetUserId: string | null): Promise<{
  ok: number;
  fail: number;
}> {
  console.log("\n── Pass A: entries.embedding IS NULL ────────────");
  let ok = 0;
  let fail = 0;
  let q = supabase
    .from("entries")
    .select("id, user_id, body, ai_enhanced_body")
    .is("embedding", null)
    .eq("entry_type", "moment")
    .order("created_at", { ascending: true });
  if (targetUserId) q = q.eq("user_id", targetUserId);
  const { data: rows, error } = await q;
  if (error) {
    console.error("Pass A query failed:", error.message);
    return { ok, fail };
  }
  console.log(`  ${rows?.length ?? 0} entries to process`);
  for (const e of (rows ?? []) as EntryRow[]) {
    const text = (e.ai_enhanced_body ?? e.body ?? "").trim();
    if (!text) {
      console.log(`  skip empty ${e.id}`);
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
        .eq("id", e.id);
      await supabase.from("entry_metadata").upsert(
        {
          entry_id: e.id,
          user_id: e.user_id,
          people: metadata.people,
          places: metadata.places,
          named_feelings: metadata.named_feelings,
          sensory_details: metadata.sensory_details,
          primary_emotion: metadata.primary_emotion,
          primary_theme: metadata.primary_theme,
        },
        { onConflict: "entry_id" }
      );
      ok++;
      console.log(
        `  ✓ ${e.id}  theme=${metadata.primary_theme || "(none)"}  emotion=${metadata.primary_emotion || "(none)"}`
      );
    } catch (err) {
      fail++;
      console.log(`  ✗ ${e.id}  ${err instanceof Error ? err.message : err}`);
    }
  }
  return { ok, fail };
}

async function passB(
  targetUserId: string | null,
  startBefore: string
): Promise<{ ok: number; fail: number }> {
  console.log("\n── Pass B: entry_metadata theme/emotion IS NULL ──");
  let ok = 0;
  let fail = 0;
  let q = supabase
    .from("entry_metadata")
    .select(
      "entry_id, user_id, entries!inner(id, body, ai_enhanced_body, entry_type)"
    )
    .or("primary_theme.is.null,primary_emotion.is.null")
    .lt("extracted_at", startBefore);
  if (targetUserId) q = q.eq("user_id", targetUserId);
  const { data: rows, error } = await q;
  if (error) {
    console.error("Pass B query failed:", error.message);
    return { ok, fail };
  }
  type Row = {
    entry_id: string;
    user_id: string;
    entries: {
      id: string;
      body: string;
      ai_enhanced_body: string | null;
      entry_type: string | null;
    } | null;
  };
  const filtered = ((rows ?? []) as Row[]).filter(
    (r) => r.entries?.entry_type === "moment"
  );
  console.log(`  ${filtered.length} metadata rows to refresh`);
  const now = () => new Date().toISOString();
  for (const row of filtered) {
    const e = row.entries!;
    const text = (e.ai_enhanced_body ?? e.body ?? "").trim();
    if (!text) {
      await supabase
        .from("entry_metadata")
        .update({ extracted_at: now() })
        .eq("entry_id", row.entry_id);
      continue;
    }
    try {
      const md = await extractMetadata(text);
      await supabase
        .from("entry_metadata")
        .update({
          people: md.people,
          places: md.places,
          named_feelings: md.named_feelings,
          sensory_details: md.sensory_details,
          primary_emotion: md.primary_emotion,
          primary_theme: md.primary_theme,
          extracted_at: now(),
        })
        .eq("entry_id", row.entry_id);
      ok++;
      console.log(
        `  ✓ ${row.entry_id}  theme=${md.primary_theme || "(none)"}  emotion=${md.primary_emotion || "(none)"}`
      );
    } catch (err) {
      fail++;
      console.log(
        `  ✗ ${row.entry_id}  ${err instanceof Error ? err.message : err}`
      );
    }
  }
  return { ok, fail };
}

async function findUserByEmail(email: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function main() {
  const argv = process.argv.slice(2);
  let targetUserId: string | null = null;
  const emailFlag = argv.indexOf("--email");
  if (emailFlag !== -1) {
    const email = argv[emailFlag + 1];
    if (!email) {
      console.error("--email requires a value");
      process.exit(1);
    }
    targetUserId = await findUserByEmail(email);
    if (!targetUserId) {
      console.error(`No profile for email ${email}`);
      process.exit(1);
    }
  } else if (argv.length && !argv[0].startsWith("--")) {
    targetUserId = argv[0];
  }
  console.log(
    `Target: ${targetUserId ?? "(all users)"}  url: ${SUPABASE_URL}`
  );

  const startBefore = new Date().toISOString();
  const a = await passA(targetUserId);
  const b = await passB(targetUserId, startBefore);
  console.log(
    `\nDone. Pass A: ok=${a.ok}  fail=${a.fail}    Pass B: ok=${b.ok}  fail=${b.fail}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
