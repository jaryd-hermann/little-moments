/**
 * One-off renumber: per-user, re-assign `chapters.chapter_number` to match
 * chronological order by `ref_week_start_date` (falling back to legacy
 * monthly date for old rows). Also rewrites the mirrored Capsule entry's
 * `title` so "Chapter N: …" stays in sync.
 *
 * Why
 * ----
 * `generate-chapter` assigns `chapter_number = max + 1` at insert time.
 * After today's backfill that produced a Chapter 4 dated earlier than
 * Chapter 3, so the in-app order looked scrambled.
 *
 * Run:
 *   npx tsx scripts/renumber-chapters.ts            # dry-run
 *   npx tsx scripts/renumber-chapters.ts --apply    # commit
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
const APPLY = process.argv.includes("--apply");

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type ChapterRow = {
  id: string;
  user_id: string;
  chapter_number: number;
  ref_week_start_date: string | null;
  ref_year: number | null;
  ref_month: number | null;
  created_at: string;
};

function sortKey(c: ChapterRow): string {
  // Legacy monthly rows fall back to the 1st of (ref_year, ref_month).
  const dateKey =
    c.ref_week_start_date ??
    (c.ref_year && c.ref_month
      ? `${c.ref_year}-${String(c.ref_month).padStart(2, "0")}-01`
      : "9999-12-31");
  return `${dateKey}|${c.created_at}`;
}

async function main() {
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}\n`);

  const { data: rows, error } = await supabase
    .from("chapters")
    .select(
      "id, user_id, chapter_number, ref_week_start_date, ref_year, ref_month, created_at"
    );
  if (error) throw error;
  const chapters = (rows ?? []) as ChapterRow[];

  // Group by user_id, sort chronologically, compute renumber plan.
  type Plan = {
    chapter: ChapterRow;
    oldNum: number;
    newNum: number;
  };
  const plansByUser = new Map<string, Plan[]>();

  const userIds = [...new Set(chapters.map((c) => c.user_id))];
  for (const uid of userIds) {
    const userRows = chapters
      .filter((c) => c.user_id === uid)
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    const plans: Plan[] = userRows.map((c, i) => ({
      chapter: c,
      oldNum: c.chapter_number,
      newNum: i + 1,
    }));
    plansByUser.set(uid, plans);
  }

  // Report.
  let changed = 0;
  for (const [uid, plans] of plansByUser) {
    const diffs = plans.filter((p) => p.oldNum !== p.newNum);
    if (diffs.length === 0) continue;
    changed += diffs.length;
    console.log(`User ${uid}`);
    for (const p of plans) {
      const arrow =
        p.oldNum === p.newNum ? "·" : p.oldNum < p.newNum ? "↓" : "↑";
      const dateKey =
        p.chapter.ref_week_start_date ??
        (p.chapter.ref_year && p.chapter.ref_month
          ? `${p.chapter.ref_year}-${String(p.chapter.ref_month).padStart(2, "0")}`
          : "—");
      console.log(
        `  ${arrow} ${dateKey}  #${p.oldNum} → #${p.newNum}  (id=${p.chapter.id.slice(0, 8)})`
      );
    }
    console.log();
  }

  console.log(`Total chapter_number changes: ${changed}\n`);

  if (changed === 0) {
    console.log("Nothing to do.");
    return;
  }

  if (!APPLY) {
    console.log("Dry-run only. Re-run with `--apply` to commit.");
    return;
  }

  // Phase 1: shift every chapter that's changing to a unique negative number
  // (id-sequenced) to dodge the (user_id, chapter_number) unique constraint.
  console.log("Phase 1: shifting affected chapters to negative numbers …");
  let tmp = -1;
  const allDiffs: Plan[] = [];
  for (const plans of plansByUser.values()) {
    for (const p of plans) {
      if (p.oldNum !== p.newNum) allDiffs.push(p);
    }
  }
  for (const p of allDiffs) {
    const tmpNum = tmp--;
    const { error: e1 } = await supabase
      .from("chapters")
      .update({ chapter_number: tmpNum })
      .eq("id", p.chapter.id);
    if (e1) {
      console.error(`  ✗ shift ${p.chapter.id}: ${e1.message}`);
      throw e1;
    }
  }

  // Phase 2: assign final numbers.
  console.log("Phase 2: assigning final chapter_numbers …");
  for (const p of allDiffs) {
    const { error: e2 } = await supabase
      .from("chapters")
      .update({ chapter_number: p.newNum })
      .eq("id", p.chapter.id);
    if (e2) {
      console.error(`  ✗ final ${p.chapter.id}: ${e2.message}`);
      throw e2;
    }
  }

  // Phase 3: rewrite mirrored Capsule entries' titles ("Chapter N: …").
  console.log("Phase 3: rewriting mirrored entries.title …");
  const affectedIds = allDiffs.map((p) => p.chapter.id);
  const { data: entryRows, error: eErr } = await supabase
    .from("entries")
    .select("id, chapter_id, title")
    .in("chapter_id", affectedIds);
  if (eErr) throw eErr;

  const numByChapterId = new Map<string, number>(
    allDiffs.map((p) => [p.chapter.id, p.newNum])
  );
  for (const row of entryRows ?? []) {
    const newNum = numByChapterId.get(row.chapter_id as string);
    if (newNum === undefined) continue;
    const oldTitle = (row.title as string | null) ?? "";
    const newTitle = oldTitle.replace(/^Chapter \d+:/, `Chapter ${newNum}:`);
    if (newTitle === oldTitle) continue;
    const { error: e3 } = await supabase
      .from("entries")
      .update({ title: newTitle })
      .eq("id", row.id);
    if (e3) {
      console.error(`  ✗ entry ${row.id}: ${e3.message}`);
      throw e3;
    }
  }

  console.log(`\nDone. ${allDiffs.length} chapters renumbered.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
