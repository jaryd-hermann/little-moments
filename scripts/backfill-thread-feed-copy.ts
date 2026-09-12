/**
 * Backfill `statement` + `question` on existing threads using Claude Haiku.
 *
 * Run:
 *   npx tsx scripts/backfill-thread-feed-copy.ts
 *   npx tsx scripts/backfill-thread-feed-copy.ts <user_id>
 *   npx tsx scripts/backfill-thread-feed-copy.ts --limit 50
 *   npx tsx scripts/backfill-thread-feed-copy.ts --force
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isValidFeedQuestion,
  isValidFeedStatement,
  parseAssistantJson,
  sanitizeFeedQuestion,
  sanitizeFeedStatement,
} from "../lib/threadFeedCopy";

try {
  const envText = readFileSync(resolve(process.cwd(), ".env"), "utf8");
  for (const line of envText.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  }
} catch {}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE || !ANTHROPIC_API_KEY) {
  console.error(
    "Missing EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or ANTHROPIC_API_KEY"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SYSTEM = `You rewrite thread insights for a mobile feed.
Return JSON only:
{
  "statement": "≤8 words. Second-person hook — sharpest pattern only. No em-dashes.",
  "question": "≤10 words. One short punchy question — easy to answer in a sentence. No compound questions, no em-dashes, no setup clauses."
}
Bad statement: "Seth keeps showing up at the moments that mark time passing — and so does this same core group of guys."
Good statement: "Seth marks the moments time passes."
Bad question: "The New Orleans night felt like its own thing — does the Brooklyn afternoon feel the same way?"
Good question: "Could that Brooklyn afternoon happen again?"
Use the observation and entry context. Be specific to this user.`;

function argFlag(name: string, fallback: number): number {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function positionalUserId(): string | null {
  const raw = process.argv.slice(2).filter(
    (a) => !a.startsWith("--") && !/^\d+$/.test(a)
  );
  return raw[0] ?? null;
}

function extractBold(text: string): string | null {
  const m = text.match(/\*\*([^*]+)\*\*/);
  return m?.[1]?.trim() ?? null;
}

async function backfillRow(row: {
  id: string;
  ellie_observation: string;
  questions: string[] | null;
  entry_a?: { title: string | null; body: string } | null;
  entry_b?: { title: string | null; body: string } | null;
}): Promise<{ statement: string; question: string }> {
  const userMessage = `Observation:\n${row.ellie_observation}\n\nEntry A: ${row.entry_a?.title ?? ""}\n${(row.entry_a?.body ?? "").slice(0, 400)}\n\nEntry B: ${row.entry_b?.title ?? ""}\n${(row.entry_b?.body ?? "").slice(0, 400)}`;

  let lastInvalid: { statement: string; question: string } | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const reminder =
      attempt === 0
        ? userMessage
        : `${userMessage}\n\nYour previous output was too long. STRICTLY ≤8 words for statement and ≤10 words for question. No em-dashes. One simple question only.\nPrevious invalid output: ${JSON.stringify(lastInvalid)}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: SYSTEM,
        messages: [{ role: "user", content: reminder }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    }

    const json = (await res.json()) as {
      content: { type: string; text?: string }[];
    };
    const first = json.content?.[0];
    const raw = first?.type === "text" ? (first.text ?? "").trim() : "";
    const parsed = parseAssistantJson<{ statement?: string; question?: string }>(raw);
    if (parsed) {
      const statement = String(parsed.statement ?? "").trim();
      const question = String(parsed.question ?? "").trim();
      lastInvalid = { statement, question };
      if (isValidFeedStatement(statement) && isValidFeedQuestion(question)) {
        return { statement, question };
      }
    }
  }

  const fallbackStatement =
    extractBold(row.ellie_observation) ??
    row.ellie_observation.split(/[.!?]/)[0]?.trim() ??
    "";
  const fallbackQuestion = row.questions?.[0]?.trim() ?? "";

  return {
    statement: sanitizeFeedStatement(
      lastInvalid?.statement || fallbackStatement
    ),
    question: sanitizeFeedQuestion(
      lastInvalid?.question ||
        fallbackQuestion ||
        "What stands out to you?"
    ),
  };
}

function needsRewrite(row: {
  statement?: string | null;
  question?: string | null;
}): boolean {
  return (
    !isValidFeedStatement(row.statement) || !isValidFeedQuestion(row.question)
  );
}

function hasForceFlag(): boolean {
  return process.argv.includes("--force");
}

async function main() {
  const limit = argFlag("--limit", 500);
  const userId = positionalUserId();

  let query = supabase
    .from("threads")
    .select(
      `
      id,
      ellie_observation,
      questions,
      statement,
      question,
      entry_a:entries!threads_entry_id_a_fkey(title, body),
      entry_b:entries!threads_entry_id_b_fkey(title, body)
    `
    )
    .eq("dismissed", false)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query;
  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const rows = hasForceFlag()
    ? (data ?? [])
    : (data ?? []).filter(needsRewrite);
  console.log(`Backfilling ${rows.length} thread(s)...`);

  let updated = 0;
  for (const row of rows) {
    const copy = await backfillRow({
      id: row.id,
      ellie_observation: row.ellie_observation,
      questions: (row.questions as string[]) ?? [],
      entry_a: row.entry_a,
      entry_b: row.entry_b,
    });

    const rawStatement =
      copy.statement ||
      extractBold(row.ellie_observation) ||
      row.ellie_observation.split(/[.!?]/)[0]?.trim() ||
      "";
    const rawQuestion =
      copy.question || (row.questions as string[])?.[0]?.trim() || "";

    const statement = sanitizeFeedStatement(rawStatement);
    const question = sanitizeFeedQuestion(
      rawQuestion || "What stands out to you?"
    );

    if (!statement || !question) {
      console.warn(`Skipped ${row.id}: could not build feed copy`);
      continue;
    }

    const { error: upErr } = await supabase
      .from("threads")
      .update({ statement, question, questions: question ? [question] : [] })
      .eq("id", row.id);

    if (upErr) {
      console.warn(`Failed ${row.id}:`, upErr.message);
      continue;
    }
    updated += 1;
    console.log(`✓ ${row.id}`);
  }

  console.log(`Done. Updated ${updated} thread(s).`);
}

void main();
