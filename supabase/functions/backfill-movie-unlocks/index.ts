/**
 * Seed `movie_unlocks` for users who already qualify.
 *
 * Existing accounts satisfy the movie thresholds many times over — a user with
 * two years of moments has earned dozens. Without this, the first save after
 * deploy would discover all of them at once. Everything recorded here is
 * stamped as already-announced, so the only pushes users ever see are for
 * movies they unlock from now on.
 *
 * Run this once, before (or immediately after) the feature ships, looping
 * until the response reports `done: true`.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>.
 * Body (optional): { user_id?: string, limit?: number, cursor?: string }
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { syncMovieUnlocks } from "../_shared/movie-unlocks.ts";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("Authorization") !== `Bearer ${cronSecret}`) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let body: { user_id?: string; limit?: number; cursor?: string } = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is fine — backfill everyone from the start.
  }

  const limit = Math.min(body.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Page by id so a long backfill can resume where it left off without
  // holding a cursor open across invocations.
  let query = supabase
    .from("profiles")
    .select("id")
    .order("id", { ascending: true })
    .limit(limit);
  if (body.user_id) query = query.eq("id", body.user_id);
  else if (body.cursor) query = query.gt("id", body.cursor);

  const { data: profiles, error } = await query;
  if (error) return jsonResponse({ error: error.message }, 500);

  let seeded = 0;
  for (const p of profiles ?? []) {
    try {
      const result = await syncMovieUnlocks(supabase, p.id, {
        notify: false,
        seedOnly: true,
      });
      seeded += result.inserted;
    } catch (err) {
      console.error(
        `backfill-movie-unlocks failed for ${p.id}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  const processed = profiles?.length ?? 0;
  return jsonResponse({
    ok: true,
    processed,
    seeded,
    cursor: profiles?.[processed - 1]?.id ?? null,
    done: processed < limit,
  });
});
