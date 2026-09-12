import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import {
  queryRecentCameraMediaPage,
  type MediaAsset,
} from "@/hooks/useMediaLibrary";
import { queryRecentUncapturedFavorites } from "@/lib/magicFillYouPick";
import {
  RecentMomentsCarousel,
  type RecentFeedItem,
} from "@/components/capture/RecentMomentsCarousel";

/** Distinct days of favorites to gather — plenty to swipe without paging forever. */
const FAVORITE_DAYS = 60;
const FALLBACK_PAGE_SIZE = 40;

export type PickSource = "favorites" | "recent";

export interface FavoritePickAssets {
  /** `null` until the first load settles. */
  assets: MediaAsset[] | null;
  source: PickSource;
}

/**
 * Media for the onboarding picker: the Favorites album, or recent camera media
 * if there isn't one.
 *
 * Favorites are the photos someone is most likely to actually want to write
 * about, which is the whole point of picking here rather than dropping a new
 * user on a cold camera roll. The fallback means the flow never dead-ends on a
 * phone with no Favorites set up.
 *
 * `enabled` keeps this off the app-launch path: the chat host is mounted for
 * the whole session, so an unconditional query would hit the media library on
 * every cold start.
 */
export function useFavoritePickAssets(enabled: boolean): FavoritePickAssets {
  const [assets, setAssets] = useState<MediaAsset[] | null>(null);
  const [source, setSource] = useState<PickSource>("favorites");
  /**
   * A ref, not state: as a dependency it would re-run this effect the moment it
   * flipped, and the cleanup would cancel the query still in flight.
   */
  const startedRef = useRef(false);

  useEffect(() => {
    if (!enabled || startedRef.current) return;
    startedRef.current = true;
    let active = true;
    void (async () => {
      let picked: MediaAsset[] = [];
      let from: PickSource = "favorites";
      try {
        // Nothing is captured yet in the real flow, so nothing to exclude.
        picked = await queryRecentUncapturedFavorites({
          capturedTakenAtMs: new Set<number>(),
          dayLimit: FAVORITE_DAYS,
        });
      } catch {
        picked = [];
      }
      if (picked.length === 0) {
        from = "recent";
        try {
          const page = await queryRecentCameraMediaPage({
            pageSize: FALLBACK_PAGE_SIZE,
          });
          picked = page.assets;
        } catch {
          picked = [];
        }
      }
      if (!active) return;
      setSource(from);
      setAssets(picked);
    })();
    return () => {
      active = false;
    };
  }, [enabled]);

  return { assets, source };
}

/**
 * Capture's moment picker, fed the onboarding shortlist. Deliberately the same
 * component Capture uses so the swipe-and-choose gesture a new user learns here
 * is the one they'll use every day.
 */
export function FavoritesPickCarousel({
  assets,
  onChoose,
}: {
  assets: MediaAsset[] | null;
  onChoose: (asset: MediaAsset) => void;
}) {
  const items = useMemo<RecentFeedItem[]>(
    () =>
      (assets ?? []).map((asset) => ({
        type: "media" as const,
        key: `f-${asset.id}`,
        asset,
      })),
    [assets]
  );

  return (
    <View style={{ marginTop: 14, marginHorizontal: -20 }}>
      <RecentMomentsCarousel
        items={items}
        loading={assets === null}
        onChoose={onChoose}
      />
    </View>
  );
}
