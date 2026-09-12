import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildAliasLookup,
  type AliasLookup,
  type CanonicalMap,
} from "@/lib/canonicalPeople";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";

/**
 * The user's canonical people map, for surfaces that need to group moments by
 * person without pulling the whole graph (`useGraph` fetches the same map
 * alongside its nodes and edges).
 *
 * The map is rebuilt server-side by `canonicalize-people`, so a brand-new
 * person is missing until that runs — the lookup is empty rather than wrong,
 * and callers degrade to showing no person buckets.
 */
export function useCanonicalPeople(): {
  people: CanonicalMap;
  lookup: AliasLookup;
  refetch: () => Promise<void>;
} {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [people, setPeople] = useState<CanonicalMap>({});

  const fetchPeople = useCallback(async () => {
    if (!userId) {
      setPeople({});
      return;
    }
    const { data } = await supabase
      .from("user_thread_stats")
      .select("recurring_people")
      .eq("user_id", userId)
      .maybeSingle();
    setPeople((data?.recurring_people ?? {}) as CanonicalMap);
  }, [userId]);

  useEffect(() => {
    void fetchPeople();
  }, [fetchPeople]);

  const lookup = useMemo(() => buildAliasLookup(people), [people]);

  return { people, lookup, refetch: fetchPeople };
}
