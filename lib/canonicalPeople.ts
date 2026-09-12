/**
 * Alias → canonical-name resolution for the free-text people / places pulled
 * out of moments by `process-threads`.
 *
 * The canonical map itself is built server-side by the `canonicalize-people`
 * edge function and stored on `user_thread_stats.recurring_people`. Clients
 * only ever read it, so the normalization here MUST stay in lockstep with the
 * `normalize()` in that function — otherwise a moment's "Mum" stops resolving
 * to "Ruth" and she silently loses moments off her count.
 */

export interface CanonicalEntity {
  aliases: string[];
  count: number;
}

export type CanonicalMap = Record<string, CanonicalEntity>;

/** Lookup keyed by normalized alias, valued by canonical display name. */
export type AliasLookup = Map<string, string>;

export function normalizeAlias(raw: string): string {
  return raw
    .trim()
    .replace(/^(my|the|our|a|an)\s+/i, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function buildAliasLookup(
  map: CanonicalMap | null | undefined
): AliasLookup {
  const out: AliasLookup = new Map();
  if (!map) return out;
  for (const [canonical, entity] of Object.entries(map)) {
    for (const alias of entity?.aliases ?? []) {
      out.set(normalizeAlias(alias), canonical);
    }
  }
  return out;
}

/**
 * Canonical names referenced by one moment. Deduped, because a single moment
 * that says "Mum" and "Ruth" still only counts once toward Ruth.
 */
export function resolveCanonical(
  raw: string[] | null | undefined,
  lookup: AliasLookup
): string[] {
  const seen = new Set<string>();
  for (const v of raw ?? []) {
    const canonical = lookup.get(normalizeAlias(v));
    if (canonical) seen.add(canonical);
  }
  return Array.from(seen);
}
