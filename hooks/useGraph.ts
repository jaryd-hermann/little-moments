import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";

/** A node in the memory graph — one per entry. */
export interface GraphNode {
  id: string;
  title: string | null;
  date: string | null;
  created_at: string;
  primary_theme: string | null;
  primary_emotion: string | null;
  /** Raw people references as extracted from the entry. */
  people: string[];
  places: string[];
  /** Canonical-name resolution of `people` via user_thread_stats. */
  canonicalPeople: string[];
  canonicalPlaces: string[];
  /** Filled in by useGraph — number of (non-dismissed) edges incident. */
  degree: number;
}

export interface CanonicalEntity {
  aliases: string[];
  count: number;
}

export type CanonicalMap = Record<string, CanonicalEntity>;

/** An edge — one per non-dismissed thread. */
export interface GraphEdge {
  id: string;
  source: string; // entry_id_a
  target: string; // entry_id_b
  connection_type: string;
  confidence: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  people: CanonicalMap;
  places: CanonicalMap;
}

const FREE_NODE_LIMIT = 50;

export interface UseGraphResult {
  data: GraphData | null;
  /** Nodes capped by free-tier gate; same as data.nodes for premium. */
  visibleNodes: GraphNode[];
  /** Edges whose source and target are both in visibleNodes. */
  visibleEdges: GraphEdge[];
  people: CanonicalMap;
  places: CanonicalMap;
  /** True when free user has more entries than FREE_NODE_LIMIT. */
  isGated: boolean;
  /** For the upgrade overlay copy. */
  hiddenNodeCount: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Build alias → canonical lookup (case-insensitive, possessive-stripped).
 * Matches the normalization used in canonicalize-people edge function so
 * node.people references resolve cleanly.
 */
function normalizeAlias(raw: string): string {
  return raw
    .trim()
    .replace(/^(my|the|our|a|an)\s+/i, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function buildAliasLookup(
  map: CanonicalMap | null | undefined
): Map<string, string> {
  const out = new Map<string, string>();
  if (!map) return out;
  for (const [canonical, { aliases }] of Object.entries(map)) {
    for (const alias of aliases) {
      out.set(normalizeAlias(alias), canonical);
    }
  }
  return out;
}

function resolveCanonical(
  raw: string[],
  lookup: Map<string, string>
): string[] {
  const seen = new Set<string>();
  for (const v of raw) {
    const canonical = lookup.get(normalizeAlias(v));
    if (canonical) seen.add(canonical);
  }
  return Array.from(seen);
}

export function useGraph(): UseGraphResult {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const subscriptionStatus = useAuthStore(
    (s) => s.profile?.subscription_status ?? "free"
  );
  const isPremium = subscriptionStatus === "active";

  const [data, setData] = useState<GraphData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGraph = useCallback(async () => {
    if (!userId) {
      setData(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      // Three parallel queries — nodes, edges, canonical maps.
      // Restrict to entry_type='moment' so server-side `chapter` entries
      // (and any future `crash_and_burn` rows) don't leak into the graph
      // as theme-less gray dots — only Moments run through process-threads
      // and get embeddings + metadata.
      const [entriesRes, threadsRes, statsRes] = await Promise.all([
        supabase
          .from("entries")
          .select(
            `
            id, title, entry_date, created_at,
            entry_metadata (primary_theme, primary_emotion, people, places)
          `
          )
          .eq("user_id", userId)
          .eq("entry_type", "moment")
          .order("created_at", { ascending: true }),
        supabase
          .from("threads")
          .select("id, entry_id_a, entry_id_b, connection_type, confidence")
          .eq("user_id", userId)
          .eq("dismissed", false),
        supabase
          .from("user_thread_stats")
          .select("recurring_people, recurring_places")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);

      if (entriesRes.error) throw entriesRes.error;
      if (threadsRes.error) throw threadsRes.error;
      // stats query may 404 for brand-new users; treat as empty.

      const entries = entriesRes.data ?? [];
      const threads = threadsRes.data ?? [];
      const people = (statsRes.data?.recurring_people ?? {}) as CanonicalMap;
      const places = (statsRes.data?.recurring_places ?? {}) as CanonicalMap;

      const peopleLookup = buildAliasLookup(people);
      const placesLookup = buildAliasLookup(places);

      // Degree count — incident edges per entry.
      const degreeMap = new Map<string, number>();
      for (const t of threads) {
        degreeMap.set(
          t.entry_id_a,
          (degreeMap.get(t.entry_id_a) ?? 0) + 1
        );
        degreeMap.set(
          t.entry_id_b,
          (degreeMap.get(t.entry_id_b) ?? 0) + 1
        );
      }

      const nodes: GraphNode[] = entries.map((e) => {
        const meta = Array.isArray(e.entry_metadata)
          ? e.entry_metadata[0]
          : e.entry_metadata;
        const rawPeople = meta?.people ?? [];
        const rawPlaces = meta?.places ?? [];
        return {
          id: e.id,
          title: e.title ?? null,
          date: e.entry_date ?? null,
          created_at: e.created_at,
          primary_theme: meta?.primary_theme ?? null,
          primary_emotion: meta?.primary_emotion ?? null,
          people: rawPeople,
          places: rawPlaces,
          canonicalPeople: resolveCanonical(rawPeople, peopleLookup),
          canonicalPlaces: resolveCanonical(rawPlaces, placesLookup),
          degree: degreeMap.get(e.id) ?? 0,
        };
      });

      const edges: GraphEdge[] = threads.map((t) => ({
        id: t.id,
        source: t.entry_id_a,
        target: t.entry_id_b,
        connection_type: t.connection_type,
        confidence: t.confidence,
      }));

      setData({ nodes, edges, people, places });
    } catch (e) {
      setError(String(e));
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  // Free-tier gate: cap nodes at 50 oldest-first. Premium users see everything.
  // Edges are filtered to only those between visible nodes (otherwise D3
  // force sim breaks on dangling references).
  const { visibleNodes, visibleEdges, isGated, hiddenNodeCount } =
    useMemo(() => {
      if (!data) {
        return {
          visibleNodes: [],
          visibleEdges: [],
          isGated: false,
          hiddenNodeCount: 0,
        };
      }
      const gated = !isPremium && data.nodes.length > FREE_NODE_LIMIT;
      const vNodes = gated ? data.nodes.slice(0, FREE_NODE_LIMIT) : data.nodes;
      const idSet = new Set(vNodes.map((n) => n.id));
      const vEdges = data.edges.filter(
        (e) => idSet.has(e.source) && idSet.has(e.target)
      );
      return {
        visibleNodes: vNodes,
        visibleEdges: vEdges,
        isGated: gated,
        hiddenNodeCount: gated ? data.nodes.length - FREE_NODE_LIMIT : 0,
      };
    }, [data, isPremium]);

  return {
    data,
    visibleNodes,
    visibleEdges,
    people: data?.people ?? {},
    places: data?.places ?? {},
    isGated,
    hiddenNodeCount,
    isLoading,
    error,
    refetch: fetchGraph,
  };
}
