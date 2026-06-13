/**
 * Diagnose brain-graph data health for a single user (or top users by entry
 * count if no user_id passed). Reports:
 *   - entries.count           — total entries
 *   - entries.no_embedding    — entries missing an embedding (process-threads never ran or failed before step 3)
 *   - metadata.missing_row    — entries with no entry_metadata row at all
 *   - metadata.null_theme     — entries whose metadata has primary_theme IS NULL ("uncertain/gray" nodes)
 *   - metadata.null_emotion   — same for primary_emotion
 *   - threads.count           — non-dismissed thread edges
 *   - nodes.lonely            — nodes with degree 0 (no edges)
 *   - theme distribution      — count by primary_theme
 *
 * Run:
 *   npx tsx scripts/diagnose-brain-graph.ts                      # top 5 users by entry count
 *   npx tsx scripts/diagnose-brain-graph.ts <user_id>            # single user
 *   npx tsx scripts/diagnose-brain-graph.ts --email me@x.com     # lookup by email
 *
 * Env required (auto-read from .env):
 *   EXPO_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

try {
  const envText = readFileSync(resolve(process.cwd(), ".env"), "utf8");
  for (const line of envText.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const [, k, vRaw] = m;
    if (process.env[k] !== undefined) continue;
    process.env[k] = vRaw.replace(/^['"]|['"]$/g, "");
  }
} catch {
  // .env optional
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface EntryRow {
  id: string;
  user_id: string;
  entry_date: string | null;
  entry_type: string | null;
  created_at: string;
  title: string | null;
  embedding: unknown | null;
  body: string | null;
  ai_enhanced_body: string | null;
}
interface MetaRow {
  entry_id: string;
  primary_theme: string | null;
  primary_emotion: string | null;
  people: string[] | null;
  places: string[] | null;
  extracted_at: string | null;
}
interface ThreadRow {
  id: string;
  user_id: string;
  entry_id_a: string;
  entry_id_b: string;
  dismissed: boolean;
}

async function diagnoseUser(
  userId: string,
  email?: string | null,
  displayName?: string | null
) {
  console.log("\n────────────────────────────────────────────────────────");
  console.log(
    `User: ${userId}${email ? `  <${email}>` : ""}${displayName ? `  "${displayName}"` : ""}`
  );
  console.log("────────────────────────────────────────────────────────");

  // Pull entries (lean — embedding is huge so just probe presence with a small
  // representative slice via two count queries instead of loading the column).
  const { data: entries, error: entriesErr } = await supabase
    .from("entries")
    .select(
      "id, user_id, entry_date, entry_type, created_at, title, body, ai_enhanced_body"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (entriesErr) {
    console.error("entries query failed:", entriesErr.message);
    return;
  }
  const entryIds = (entries ?? []).map((e) => e.id);
  console.log(`entries.count            = ${entries?.length ?? 0}`);
  const typeCounts = new Map<string, number>();
  for (const e of (entries ?? []) as EntryRow[]) {
    const k = e.entry_type ?? "(null)";
    typeCounts.set(k, (typeCounts.get(k) ?? 0) + 1);
  }
  console.log(
    `entries.by_type          = ${[...typeCounts.entries()]
      .map(([k, v]) => `${k}:${v}`)
      .join("  ")}`
  );

  if (!entryIds.length) {
    console.log("(no entries — nothing else to check)");
    return;
  }

  // Embeddings — count rows where embedding IS NULL
  const { count: noEmbed } = await supabase
    .from("entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("embedding", null);
  console.log(`entries.no_embedding     = ${noEmbed ?? 0}`);

  // Metadata rows (no embedding column, lean payload)
  const metaRows: MetaRow[] = [];
  const CHUNK = 500;
  for (let i = 0; i < entryIds.length; i += CHUNK) {
    const slice = entryIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("entry_metadata")
      .select(
        "entry_id, primary_theme, primary_emotion, people, places, extracted_at"
      )
      .in("entry_id", slice);
    if (error) {
      console.error("entry_metadata query failed:", error.message);
      return;
    }
    if (data) metaRows.push(...(data as MetaRow[]));
  }
  const metaByEntry = new Map(metaRows.map((m) => [m.entry_id, m]));
  const missingRow = entryIds.filter((id) => !metaByEntry.has(id));
  const entryById = new Map(
    ((entries ?? []) as EntryRow[]).map((e) => [e.id, e])
  );
  const missingByType = new Map<string, number>();
  for (const id of missingRow) {
    const t = entryById.get(id)?.entry_type ?? "(null)";
    missingByType.set(t, (missingByType.get(t) ?? 0) + 1);
  }
  const nullTheme = metaRows.filter((m) => !m.primary_theme);
  const nullEmotion = metaRows.filter((m) => !m.primary_emotion);
  console.log(`metadata.row_count       = ${metaRows.length}`);
  console.log(
    `metadata.missing_row     = ${missingRow.length}  by_type: ${[...missingByType.entries()].map(([k, v]) => `${k}:${v}`).join("  ")}`
  );
  console.log(
    `metadata.null_theme      = ${nullTheme.length}  (gray "uncertain" nodes)`
  );
  console.log(`metadata.null_emotion    = ${nullEmotion.length}`);

  const themeCounts = new Map<string, number>();
  for (const m of metaRows) {
    const key = m.primary_theme ?? "(null)";
    themeCounts.set(key, (themeCounts.get(key) ?? 0) + 1);
  }
  console.log("theme distribution:");
  [...themeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${k.padEnd(14)} ${v}`));

  // Threads
  const { data: threads, error: threadsErr } = await supabase
    .from("threads")
    .select("id, entry_id_a, entry_id_b, dismissed")
    .eq("user_id", userId);
  if (threadsErr) {
    console.error("threads query failed:", threadsErr.message);
    return;
  }
  const liveThreads = (threads ?? []).filter((t) => !t.dismissed);
  console.log(`\nthreads.total            = ${threads?.length ?? 0}`);
  console.log(`threads.live (not dismissed) = ${liveThreads.length}`);

  // Lonely nodes
  const degree = new Map<string, number>();
  for (const t of liveThreads as ThreadRow[]) {
    degree.set(t.entry_id_a, (degree.get(t.entry_id_a) ?? 0) + 1);
    degree.set(t.entry_id_b, (degree.get(t.entry_id_b) ?? 0) + 1);
  }
  const lonely = entryIds.filter((id) => (degree.get(id) ?? 0) === 0);
  console.log(`nodes.lonely (degree 0)  = ${lonely.length} / ${entryIds.length}`);

  // Last 10 missing-row entries — likely fresh failures
  if (missingRow.length) {
    console.log("\nMost recent entries WITHOUT entry_metadata row (top 10):");
    const idSet = new Set(missingRow);
    const recent = (entries ?? [])
      .filter((e) => idSet.has(e.id))
      .slice(-10)
      .reverse();
    for (const e of recent) {
      const bodyLen = (e.ai_enhanced_body ?? e.body ?? "").length;
      console.log(
        `  ${e.created_at}  type=${e.entry_type}  ${e.id}  bodyLen=${bodyLen}  "${(e.title ?? "").slice(0, 50)}"`
      );
    }
  }

  // Per-entry timeline: which entries have metadata vs not, by created_at.
  console.log(
    "\nTimeline (oldest→newest, '✓' = metadata row, '·' = missing):"
  );
  const buckets = new Map<string, { ok: number; missing: number }>();
  for (const e of (entries ?? []) as EntryRow[]) {
    if (e.entry_type !== "moment") continue;
    const day = (e.created_at ?? "").slice(0, 10);
    const b = buckets.get(day) ?? { ok: 0, missing: 0 };
    if (metaByEntry.has(e.id)) b.ok++;
    else b.missing++;
    buckets.set(day, b);
  }
  [...buckets.entries()]
    .sort()
    .forEach(([day, b]) =>
      console.log(
        `  ${day}  ${"✓".repeat(b.ok)}${"·".repeat(b.missing)}  ok=${b.ok}  missing=${b.missing}`
      )
    );

  if (nullTheme.length) {
    console.log("\nSample entries WITH metadata row but NULL primary_theme (top 10):");
    const sample = nullTheme.slice(0, 10);
    for (const m of sample) {
      const e = entryById.get(m.entry_id);
      const bodyLen = e ? (e.ai_enhanced_body ?? e.body ?? "").length : 0;
      console.log(
        `  ${e?.created_at ?? "?"}  ${m.entry_id}  bodyLen=${bodyLen}  extracted_at=${m.extracted_at ?? "(null)"}  "${(e?.title ?? "").slice(0, 50)}"`
      );
    }
  }
}

async function findUserByEmail(email: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function topUsersByEntries(n = 5): Promise<string[]> {
  // No SQL aggregate via PostgREST without an RPC — pull lean rows and bucket
  // client-side. Fine for our scale.
  const { data } = await supabase
    .from("entries")
    .select("user_id")
    .limit(50_000);
  const counts = new Map<string, number>();
  for (const r of data ?? []) {
    counts.set(r.user_id as string, (counts.get(r.user_id as string) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id]) => id);
}

async function main() {
  const argv = process.argv.slice(2);
  let userIds: string[] = [];

  const emailFlagIdx = argv.indexOf("--email");
  if (emailFlagIdx !== -1) {
    const email = argv[emailFlagIdx + 1];
    if (!email) {
      console.error("--email requires a value");
      process.exit(1);
    }
    const id = await findUserByEmail(email);
    if (!id) {
      console.error(`No profile found for email ${email}`);
      process.exit(1);
    }
    userIds = [id];
  } else if (argv.length && !argv[0].startsWith("--")) {
    userIds = [argv[0]];
  } else {
    console.log("(no user specified — diagnosing top 5 users by entry count)");
    userIds = await topUsersByEntries(5);
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, display_name")
    .in("id", userIds);
  const profById = new Map(
    (profiles ?? []).map((p) => [
      p.id as string,
      { email: p.email as string | null, name: p.display_name as string | null },
    ])
  );

  for (const id of userIds) {
    const p = profById.get(id);
    await diagnoseUser(id, p?.email, p?.name);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
