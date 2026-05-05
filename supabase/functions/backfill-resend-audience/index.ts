/**
 * One-shot backfill: add every profile.email to the Resend audience.
 *
 * Idempotent — Resend treats already-existing contacts as a no-op (we map
 * those errors to `alreadyExisted` in the response). Safe to re-run.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * Required env (Supabase secrets):
 *   - CRON_SECRET
 *   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   - RESEND_API_KEY
 *   - RESEND_AUDIENCE_ID
 *
 * Optional query / body params:
 *   - since=YYYY-MM-DD          only profiles created on/after this date
 *   - limit=500                 cap rows processed (default: all)
 *   - dryRun=true               read profiles + return counts without calling Resend
 *
 * Throttles to ~5 req/sec to stay under Resend's contacts API rate limit.
 *
 * Invoke from local shell:
 *   curl -X POST \
 *     -H "Authorization: Bearer $CRON_SECRET" \
 *     "https://<project>.supabase.co/functions/v1/backfill-resend-audience"
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { addContactToAudience } from "../_shared/resend.ts";

type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
};

function splitDisplayName(
  name: string | null | undefined,
): { firstName: string | null; lastName: string | null } {
  const trimmed = name?.trim();
  if (!trimmed) return { firstName: null, lastName: null };
  const idx = trimmed.indexOf(" ");
  if (idx === -1) return { firstName: trimmed, lastName: null };
  return {
    firstName: trimmed.slice(0, idx),
    lastName: trimmed.slice(idx + 1).trim() || null,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  try {
    const secret = Deno.env.get("CRON_SECRET");
    const auth = req.headers.get("Authorization");
    if (!secret || auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    const audienceId = Deno.env.get("RESEND_AUDIENCE_ID");
    if (!audienceId) {
      return new Response(
        JSON.stringify({ error: "RESEND_AUDIENCE_ID not set" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const url = new URL(req.url);
    const params: Record<string, string> = {};
    for (const [k, v] of url.searchParams) params[k] = v;
    if (req.headers.get("content-type")?.includes("application/json")) {
      try {
        const body = await req.json();
        if (body && typeof body === "object") {
          for (const [k, v] of Object.entries(body)) {
            if (v != null) params[k] = String(v);
          }
        }
      } catch {
        /* ignore body parse errors */
      }
    }

    const since = params.since ?? null;
    const limit = params.limit ? Math.max(1, parseInt(params.limit, 10)) : null;
    const dryRun = params.dryRun === "true" || params.dry_run === "true";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let query = supabase
      .from("profiles")
      .select("id, email, display_name, created_at")
      .not("email", "is", null)
      .order("created_at", { ascending: true });

    if (since) query = query.gte("created_at", since);
    if (limit) query = query.limit(limit);

    const { data, error } = await query;
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const rows = (data ?? []) as ProfileRow[];

    if (dryRun) {
      return new Response(
        JSON.stringify({
          ok: true,
          dryRun: true,
          total: rows.length,
          firstEmail: rows[0]?.email ?? null,
          lastEmail: rows[rows.length - 1]?.email ?? null,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    let added = 0;
    let alreadyExisted = 0;
    let errored = 0;
    const errors: { email: string; message: string }[] = [];

    // Resend's contacts API allows ~10 req/sec on most plans. We stay at 5/sec
    // (200ms cadence) to be conservative across rate-limit windows.
    const DELAY_MS = 200;

    for (const row of rows) {
      if (!row.email) continue;
      const { firstName, lastName } = splitDisplayName(row.display_name);
      try {
        const res = await addContactToAudience({
          audienceId,
          email: row.email,
          firstName,
          lastName,
        });
        if (res.alreadyExists) alreadyExisted++;
        else added++;
      } catch (err) {
        errored++;
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ email: row.email, message });
        console.error(`backfill: ${row.email} failed:`, message);
      }
      await sleep(DELAY_MS);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        total: rows.length,
        added,
        alreadyExisted,
        errored,
        errorsSample: errors.slice(0, 10),
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "error";
    console.error("backfill-resend-audience error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
