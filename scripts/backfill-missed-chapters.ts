/**
 * One-off backfill: find every (user, past ISO week) bucket with ≥4 qualifying
 * moments but no chapter row, and replay it through `generate-chapter`.
 *
 * Diagnoses & repairs the silent insert failure caused by the legacy
 * `chapters_user_month_uidx` unique constraint (fixed in migration 0052).
 *
 * Run:
 *   CRON_SECRET=<raw secret> npx tsx scripts/backfill-missed-chapters.ts
 *
 * Env required (auto-read from .env):
 *   EXPO_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Dry-run is the default. Pass `--apply` to actually invoke generate-chapter.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Minimal .env loader — avoids adding a `dotenv` dep for a one-off script.
try {
  const envText = readFileSync(resolve(process.cwd(), ".env"), "utf8");
  for (const line of envText.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const [, k, vRaw] = m;
    if (process.env[k] !== undefined) continue;
    const v = vRaw.replace(/^['"]|['"]$/g, "");
    process.env[k] = v;
  }
} catch {
  // .env optional — fall back to actual env vars
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const APPLY = process.argv.includes("--apply");

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error(
    "Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env."
  );
  process.exit(1);
}
if (APPLY && !CRON_SECRET) {
  console.error("`--apply` requires CRON_SECRET in env.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── ISO week math (Mon-anchored, ISO-8601) ───────────────────────────
// Returns { isoWeek, isoWeekYear, mondayISO } for a YYYY-MM-DD string,
// anchored at noon local to avoid DST edge cases.
function isoWeekParts(dateStr: string): {
  isoWeek: number;
  isoWeekYear: number;
  mondayISO: string;
} {
  const d = new Date(`${dateStr}T12:00:00`);
  // Shift to Thursday of current week (ISO definition).
  const tmp = new Date(d.getTime());
  tmp.setHours(0, 0, 0, 0);
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const isoWeekYear = tmp.getFullYear();
  const yearStart = new Date(isoWeekYear, 0, 1);
  const isoWeek = Math.ceil(
    ((tmp.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7
  );

  // Monday of `d`'s ISO week.
  const mon = new Date(d.getTime());
  mon.setHours(0, 0, 0, 0);
  const dow = (mon.getDay() + 6) % 7; // 0=Mon..6=Sun
  mon.setDate(mon.getDate() - dow);
  const yyyy = mon.getFullYear();
  const mm = String(mon.getMonth() + 1).padStart(2, "0");
  const dd = String(mon.getDate()).padStart(2, "0");
  return { isoWeek, isoWeekYear, mondayISO: `${yyyy}-${mm}-${dd}` };
}

// ── Hard floor: don't try to backfill weeks before the weekly-chapter
// feature went live (earliest existing weekly chapter as a proxy). ──
const WEEKLY_FEATURE_FLOOR_MONDAY = "2026-04-27";

// ── Don't replay the current (still-in-progress) week ────────────────
function todayMondayISO(): string {
  const today = new Date();
  return isoWeekParts(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate()
    ).padStart(2, "0")}`
  ).mondayISO;
}

async function main() {
  console.log(`Mode: ${APPLY ? "APPLY (will call generate-chapter)" : "DRY-RUN"}`);
  console.log(`Floor Monday: ${WEEKLY_FEATURE_FLOOR_MONDAY}`);
  console.log(`Today's Monday: ${todayMondayISO()}\n`);

  const { data: entries, error: entriesErr } = await supabase
    .from("entries")
    .select("user_id, entry_date")
    .eq("entry_type", "moment")
    .eq("date_precision", "exact");
  if (entriesErr) throw entriesErr;

  // Bucket entries by (user_id, mondayISO).
  type Bucket = {
    userId: string;
    mondayISO: string;
    isoWeek: number;
    isoWeekYear: number;
    count: number;
  };
  const buckets = new Map<string, Bucket>();
  for (const e of entries ?? []) {
    const { isoWeek, isoWeekYear, mondayISO } = isoWeekParts(
      e.entry_date as string
    );
    const key = `${e.user_id}|${mondayISO}`;
    const b = buckets.get(key);
    if (b) b.count++;
    else
      buckets.set(key, {
        userId: e.user_id as string,
        mondayISO,
        isoWeek,
        isoWeekYear,
        count: 1,
      });
  }

  // Filter: ≥4 moments, week fully in the past, on/after the weekly-feature floor.
  const eligible: Bucket[] = [];
  const todayMon = todayMondayISO();
  for (const b of buckets.values()) {
    if (b.count < 4) continue;
    if (b.mondayISO < WEEKLY_FEATURE_FLOOR_MONDAY) continue;
    if (b.mondayISO >= todayMon) continue;
    eligible.push(b);
  }

  const { data: chapters, error: chErr } = await supabase
    .from("chapters")
    .select("user_id, ref_iso_week_year, ref_iso_week")
    .not("ref_iso_week", "is", null);
  if (chErr) throw chErr;

  const have = new Set<string>(
    (chapters ?? []).map(
      (c) => `${c.user_id}|${c.ref_iso_week_year}|${c.ref_iso_week}`
    )
  );

  const missing = eligible
    .filter((b) => !have.has(`${b.userId}|${b.isoWeekYear}|${b.isoWeek}`))
    .sort(
      (a, b) =>
        a.mondayISO.localeCompare(b.mondayISO) || a.userId.localeCompare(b.userId)
    );

  console.log(`Eligible (user, week) buckets: ${eligible.length}`);
  console.log(`Existing chapters (weekly):    ${have.size}`);
  console.log(`Missing chapters to backfill:  ${missing.length}\n`);

  if (missing.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  // Profile lookups to enrich the dry-run report.
  const userIds = [...new Set(missing.map((m) => m.userId))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, email, subscription_status, notification_timezone")
    .in("id", userIds);
  const profById = new Map(
    (profiles ?? []).map((p) => [p.id as string, p])
  );

  for (const m of missing) {
    const p = profById.get(m.userId);
    console.log(
      `  ${m.mondayISO}  ${m.userId}  moments=${m.count}  ${
        p ? `${p.display_name ?? "(no name)"} <${p.email ?? "—"}> tier=${p.subscription_status} tz=${p.notification_timezone ?? "—"}` : "(no profile)"
      }`
    );
  }

  if (!APPLY) {
    console.log("\nDry-run only. Re-run with `--apply` to invoke generate-chapter.");
    return;
  }

  console.log("\nApplying…");
  let ok = 0;
  let fail = 0;
  for (const m of missing) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-chapter`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CRON_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId: m.userId, weekStartDate: m.mondayISO }),
    });
    const json = (await res.json()) as Record<string, unknown>;
    const label = `${m.mondayISO} ${m.userId}`;
    if (res.ok && json.ok) {
      ok++;
      console.log(
        `  ✓ ${label}  chapter=${json.chapterNumber}  push=${json.pushSent} email=${json.emailSent}`
      );
    } else {
      fail++;
      console.log(`  ✗ ${label}  status=${res.status}  ${JSON.stringify(json)}`);
    }
  }
  console.log(`\nDone. ok=${ok}  fail=${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
