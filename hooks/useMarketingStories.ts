import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import {
  MARKETING_STORIES_FALLBACK,
  type MarketingStoryRecord,
  rowToMarketingStory,
} from "@/lib/marketingStories";

export function useMarketingStories() {
  const [rows, setRows] = useState<MarketingStoryRecord[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("marketing_stories")
        .select("slug, category, card_title, card_description, slides, sort_order")
        .order("sort_order", { ascending: true });

      if (cancelled) return;
      if (error || !data?.length) {
        setRows(MARKETING_STORIES_FALLBACK);
        return;
      }
      const parsed = data
        .map((r) => rowToMarketingStory(r))
        .filter((r): r is MarketingStoryRecord => r != null);
      setRows(parsed.length > 0 ? parsed : MARKETING_STORIES_FALLBACK);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stories = rows ?? MARKETING_STORIES_FALLBACK;

  const philosophyStories = useMemo(() => {
    const fromApi = stories
      .filter((s) => s.category === "philosophy")
      .sort((a, b) => a.sort_order - b.sort_order);
    const bySlug = new Map(fromApi.map((s) => [s.slug, s]));
    const fallbackPhil = MARKETING_STORIES_FALLBACK.filter(
      (s) => s.category === "philosophy"
    );
    if (fromApi.length >= fallbackPhil.length) return fromApi;
    return fallbackPhil.map((fb) => bySlug.get(fb.slug) ?? fb);
  }, [stories]);

  const memoryJogStory = useMemo(
    () => stories.find((s) => s.slug === "memory-jog") ?? null,
    [stories]
  );

  const bySlug = useMemo(() => {
    const m = new Map<string, MarketingStoryRecord>();
    for (const s of stories) m.set(s.slug, s);
    return m;
  }, [stories]);

  return { stories, philosophyStories, memoryJogStory, bySlug };
}
