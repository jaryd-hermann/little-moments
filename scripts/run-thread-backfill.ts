/**
 * Loop `cron-threads-nightly` per-user with a high `entries_per_user` cap so
 * recently restored embeddings get connection-analyzed today, rather than
 * waiting for the nightly cron tomorrow.
 *
 * Per-user invocation avoids the edge-function wall-time limit — running
 * "all users at once" with a 1000-anchor cap would time out partway
 * through. Per-user keeps each call bounded and resumable.
 *
 * Run:
 *   CRON_SECRET=... npx tsx scripts/run-thread-backfill.ts
 *   CRON_SECRET=... npx tsx scripts/run-thread-backfill.ts <user_id>     # one user
 *   CRON_SECRET=... npx tsx scripts/run-thread-backfill.ts --min 5       # only users with >=5 entries (default 4)
 *   CRON_SECRET=... npx tsx scripts/run-thread-backfill.ts --per 200     # cap entries_per_user (default 1000)
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
} catch {}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET!;
if (!SUPABASE_URL || !SERVICE_ROLE || !CRON_SECRET) {
  console.error(
    "Missing EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or CRON_SECRET"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function argFlag(name: string, fallback: number): number {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function positionalArgs(): string[] {
  // Strip --flag <value> pairs so the remaining args are true positionals
  // (e.g. a user_id). Without this, `--per 1000` leaks "1000" through.
  const flagsWithValue = new Set(["--per", "--min"]);
  const out: string[] = [];
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (flagsWithValue.has(a)) {
      i++;
      continue;
    }
    if (a.startsWith("--")) continue;
    out.push(a);
  }
  return out;
}

async function listUsers(): Promise<
  Array<{ id: string; email: string | null; name: string | null; count: number }>
> {
  const positional = positionalArgs();
  if (positional[0]) {
    const { data } = await supabase
      .from("profiles")
      .select("id, email, display_name")
      .eq("id", positional[0])
      .maybeSingle();
    if (!data) {
      console.error("No profile for", positional[0]);
      process.exit(1);
    }
    return [
      {
        id: data.id as string,
        email: (data.email as string | null) ?? null,
        name: (data.display_name as string | null) ?? null,
        count: -1,
      },
    ];
  }

  const min = argFlag("--min", 4);
  // Per-user count of moments with embeddings. PostgREST can't aggregate
  // server-side without an RPC, so fetch lean rows and bucket.
  const { data: rows } = await supabase
    .from("entries")
    .select("user_id")
    .eq("entry_type", "moment")
    .not("embedding", "is", null)
    .limit(100_000);
  const counts = new Map<string, number>();
  for (const r of rows ?? []) {
    counts.set(r.user_id as string, (counts.get(r.user_id as string) ?? 0) + 1);
  }
  const eligible = [...counts.entries()].filter(([, n]) => n >= min);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, display_name")
    .in(
      "id",
      eligible.map(([id]) => id)
    );
  const profById = new Map(
    (profiles ?? []).map((p) => [
      p.id as string,
      {
        email: (p.email as string | null) ?? null,
        name: (p.display_name as string | null) ?? null,
      },
    ])
  );
  return eligible
    .map(([id, count]) => ({
      id,
      count,
      email: profById.get(id)?.email ?? null,
      name: profById.get(id)?.name ?? null,
    }))
    .sort((a, b) => b.count - a.count);
}

async function invokeForUser(
  userId: string,
  entriesPerUser: number
): Promise<{ ok: boolean; body: string }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/cron-threads-nightly`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CRON_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: userId, entries_per_user: entriesPerUser }),
  });
  return { ok: res.ok, body: await res.text() };
}

async function main() {
  const entriesPerUser = argFlag("--per", 1000);
  const users = await listUsers();
  console.log(
    `Found ${users.length} users to process  (entries_per_user=${entriesPerUser})\n`
  );

  let totalThreads = 0;
  let processed = 0;
  let failures = 0;
  for (const u of users) {
    processed++;
    const label = `[${processed}/${users.length}] ${u.id}  ${
      u.email ?? "(no email)"
    }  count=${u.count}`;
    process.stdout.write(`${label}  ... `);
    const t0 = Date.now();
    const { ok, body } = await invokeForUser(u.id, entriesPerUser);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    if (!ok) {
      failures++;
      console.log(`FAIL (${elapsed}s)  ${body.slice(0, 200)}`);
      continue;
    }
    try {
      const json = JSON.parse(body) as {
        threads_created?: number;
        users_processed?: number;
      };
      totalThreads += json.threads_created ?? 0;
      console.log(
        `ok (${elapsed}s)  threads_created=${json.threads_created ?? 0}`
      );
    } catch {
      console.log(`ok (${elapsed}s)  ${body.slice(0, 200)}`);
    }
  }
  console.log(
    `\nDone. users=${users.length}  threads_created=${totalThreads}  failures=${failures}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
