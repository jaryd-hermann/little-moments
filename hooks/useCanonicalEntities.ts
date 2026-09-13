import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildAliasLookup,
  type AliasLookup,
  type CanonicalMap,
} from "@/lib/canonicalPeople";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";

/**
 * The user's canonical people and places maps, for surfaces that need to group
 * moments by who or where without pulling the whole graph (`useGraph` fetches
 * the same two maps alongside its nodes and edges).
 *
 * Both maps are rebuilt server-side by `canonicalize-people`, so a brand-new
 * name is missing until that runs — the lookup is empty rather than wrong, and
 * callers degrade to showing no buckets for that kind.
 */
export function useCanonicalEntities(): {
  people: CanonicalMap;
  peopleLookup: AliasLookup;
  places: CanonicalMap;
  placesLookup: AliasLookup;
  refetch: () => Promise<void>;
} {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [people, setPeople] = useState<CanonicalMap>({});
  const [places, setPlaces] = useState<CanonicalMap>({});

  const fetchEntities = useCallback(async () => {
    if (!userId) {
      setPeople({});
      setPlaces({});
      return;
    }
    const { data } = await supabase
      .from("user_thread_stats")
      .select("recurring_people, recurring_places")
      .eq("user_id", userId)
      .maybeSingle();
    setPeople((data?.recurring_people ?? {}) as CanonicalMap);
    setPlaces((data?.recurring_places ?? {}) as CanonicalMap);
  }, [userId]);

  useEffect(() => {
    void fetchEntities();
  }, [fetchEntities]);

  const peopleLookup = useMemo(() => buildAliasLookup(people), [people]);
  const placesLookup = useMemo(() => buildAliasLookup(places), [places]);

  return { people, peopleLookup, places, placesLookup, refetch: fetchEntities };
}
