/**
 * Canonicalize free-text people + places for one user.
 *
 * Reads all entry_metadata rows for the user, flattens and normalises the
 * raw people[] / places[] arrays, asks Claude Haiku to group aliases, and
 * writes the canonical map into user_thread_stats.
 *
 * Schema for user_thread_stats.recurring_people / recurring_places (JSONB):
 *   {
 *     "Ruth": { "aliases": ["Ruth", "Mom", "my mother"], "count": 14 },
 *     "Dan":  { "aliases": ["Dan", "Daniel"],            "count": 8  }
 *   }
 *
 * Auth: callable by CRON_SECRET for nightly sweeps, or by an authenticated
 * user for their own data.
 * Body (optional): { user_id?: string } — CRON mode may specify; user mode
 * must match the caller's own user id.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";
import { anthropicAssistantText } from "../_shared/anthropicAssistantText.ts";

const anthropic = new Anthropic({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
});

const SYSTEM_PROMPT = `You group raw mentions of people (or places) extracted from a personal journal.

Your job: merge aliases that refer to the same entity. A single person may be referred to by their first name, a nickname, or a relational term ("my mom", "Mum", "Ruth").

Rules:
- Only group references you're confident refer to the same entity — relational terms ("mom", "my father") almost always refer to a single person, so group them with any first-name references where the context overwhelmingly suggests they match.
- Prefer the most specific label as the canonical name (e.g. "Ruth" over "Mom"). If no proper name exists, use the relational term.
- If two common first names appear ("Sarah", "Emma"), keep them separate.
- Lowercase vs. capitalised duplicates ("ruth" / "Ruth") should always be merged.
- Possessive prefixes ("my", "the") should be stripped from display.

Return ONLY a JSON object:
{
  "groups": [
    { "canonical": "Ruth", "aliases": ["ruth", "Ruth", "Mom", "my mother"] },
    { "canonical": "Dan", "aliases": ["Dan", "Daniel"] }
  ]
}

Every input string MUST appear in exactly one group's aliases array — no omissions, no duplicates across groups.`;

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
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

/** Cheap pre-pass: strip possessives, trim, lowercase for dedupe key. */
function normalize(raw: string): string {
  return raw
    .trim()
    .replace(/^(my|the|our|a|an)\s+/i, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

interface Group {
  canonical: string;
  aliases: string[];
}

async function canonicalize(
  rawValues: string[],
  kind: "people" | "places"
): Promise<Group[]> {
  if (rawValues.length === 0) return [];

  // Dedupe identical strings (case-insensitive) before sending to LLM —
  // no point paying for "Ruth" and "ruth" separately.
  const byNorm = new Map<string, string>();
  for (const v of rawValues) {
    const n = normalize(v);
    if (!n) continue;
    if (!byNorm.has(n)) byNorm.set(n, v);
  }
  const uniqueValues = Array.from(byNorm.values());

  // Below a threshold, canonical = raw for each unique value — skip LLM.
  if (uniqueValues.length < 3) {
    return uniqueValues.map((v) => ({ canonical: v, aliases: [v] }));
  }

  const userMessage = `${kind === "people" ? "People" : "Places"} references to group:\n${uniqueValues
    .map((v, i) => `${i + 1}. ${v}`)
    .join("\n")}`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const raw = anthropicAssistantText(response.content).trim();
  const parsed = tryParseJSON(raw);
  const groups = Array.isArray(parsed?.groups) ? parsed.groups : null;

  if (!groups) {
    // Fall back to no-grouping — still better than dropping the data.
    return uniqueValues.map((v) => ({ canonical: v, aliases: [v] }));
  }

  return groups
    .filter(
      (g: unknown): g is Group =>
        typeof g === "object" &&
        g !== null &&
        typeof (g as Group).canonical === "string" &&
        Array.isArray((g as Group).aliases)
    )
    .map((g) => ({
      canonical: g.canonical.trim(),
      aliases: g.aliases.map((a: string) => a.trim()).filter(Boolean),
    }));
}

/**
 * Build the final map by joining LLM groups against raw occurrence counts.
 *   - alias lookup is case-insensitive
 *   - count = number of entries where any alias appears
 */
function buildCanonicalMap(
  groups: Group[],
  rawByEntry: string[][]
): Record<string, { aliases: string[]; count: number }> {
  const aliasToCanonical = new Map<string, string>();
  for (const g of groups) {
    for (const alias of g.aliases) {
      aliasToCanonical.set(normalize(alias), g.canonical);
    }
  }

  const countByCanonical = new Map<string, number>();
  for (const perEntry of rawByEntry) {
    const seen = new Set<string>();
    for (const v of perEntry) {
      const canonical = aliasToCanonical.get(normalize(v));
      if (canonical && !seen.has(canonical)) {
        seen.add(canonical);
        countByCanonical.set(canonical, (countByCanonical.get(canonical) ?? 0) + 1);
      }
    }
  }

  const result: Record<string, { aliases: string[]; count: number }> = {};
  for (const g of groups) {
    result[g.canonical] = {
      aliases: g.aliases,
      count: countByCanonical.get(g.canonical) ?? 0,
    };
  }
  return result;
}

async function resolveUserId(req: Request): Promise<
  | { ok: true; userId: string; service: ReturnType<typeof createClient> }
  | { ok: false; response: Response }
> {
  const authHeader = req.headers.get("Authorization");
  const cronSecret = Deno.env.get("CRON_SECRET");

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let body: { user_id?: string } = {};
  try {
    body = await req.clone().json();
  } catch {
    // ignore
  }

  // CRON path
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    if (!body.user_id) {
      return {
        ok: false,
        response: jsonResponse({ error: "user_id required for cron mode" }, 400),
      };
    }
    return { ok: true, userId: body.user_id, service };
  }

  // User path — validate JWT
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, response: jsonResponse({ error: "Unauthorized" }, 401) };
  }
  const userSupabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const {
    data: { user },
    error,
  } = await userSupabase.auth.getUser();
  if (error || !user) {
    return { ok: false, response: jsonResponse({ error: "Unauthorized" }, 401) };
  }
  if (body.user_id && body.user_id !== user.id) {
    return { ok: false, response: jsonResponse({ error: "Forbidden" }, 403) };
  }
  return { ok: true, userId: user.id, service };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authResult = await resolveUserId(req);
  if (!authResult.ok) return authResult.response;

  const { userId, service } = authResult;

  // Pull all metadata rows (people/places only — keep bandwidth low).
  const { data: rows, error } = await service
    .from("entry_metadata")
    .select("people, places")
    .eq("user_id", userId);

  if (error) return jsonResponse({ error: error.message }, 500);

  const peopleByEntry: string[][] = [];
  const placesByEntry: string[][] = [];
  for (const r of rows ?? []) {
    peopleByEntry.push(Array.isArray(r.people) ? r.people : []);
    placesByEntry.push(Array.isArray(r.places) ? r.places : []);
  }

  const peopleFlat = peopleByEntry.flat();
  const placesFlat = placesByEntry.flat();

  const [peopleGroups, placesGroups] = await Promise.all([
    canonicalize(peopleFlat, "people"),
    canonicalize(placesFlat, "places"),
  ]);

  const recurringPeople = buildCanonicalMap(peopleGroups, peopleByEntry);
  const recurringPlaces = buildCanonicalMap(placesGroups, placesByEntry);

  await service.from("user_thread_stats").upsert(
    {
      user_id: userId,
      recurring_people: recurringPeople,
      recurring_places: recurringPlaces,
      last_analyzed_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  return jsonResponse({
    ok: true,
    people_count: Object.keys(recurringPeople).length,
    places_count: Object.keys(recurringPlaces).length,
  });
});
