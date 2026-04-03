import { useState, useCallback, useRef } from "react";
import * as MediaLibrary from "expo-media-library";

export interface MediaAsset {
  id: string;
  uri: string;
  creationTime: number;
  mediaType: "photo" | "video";
  width: number;
  height: number;
}

function mapExpoAsset(a: MediaLibrary.Asset): MediaAsset {
  return {
    id: a.id,
    uri: a.uri,
    creationTime: a.creationTime,
    mediaType: "photo",
    width: a.width,
    height: a.height,
  };
}

const REWIND_PHOTO_QUERY: Pick<
  MediaLibrary.AssetsOptions,
  "mediaType" | "sortBy"
> = {
  mediaType: [MediaLibrary.MediaType.photo],
  sortBy: [MediaLibrary.SortBy.creationTime],
};

/**
 * Picks a uniformly random photo from the entire library (not just the first page).
 * Uses creationTime DESC (expo default), same as Rewind’s scroll order.
 */
export async function pickRandomPhotoFromLibrary(): Promise<MediaAsset | null> {
  const pageSize = 400;
  const first = await MediaLibrary.getAssetsAsync({
    ...REWIND_PHOTO_QUERY,
    first: pageSize,
  });
  const total = first.totalCount;
  if (total === 0 || first.assets.length === 0) return null;

  const r = Math.min(
    Math.floor(Math.random() * total),
    Math.max(0, total - 1)
  );

  if (r < first.assets.length) {
    return mapExpoAsset(first.assets[r]);
  }

  let offset = first.assets.length;
  let cursor: string | undefined = first.endCursor;

  while (r >= offset && cursor) {
    const page = await MediaLibrary.getAssetsAsync({
      ...REWIND_PHOTO_QUERY,
      first: pageSize,
      after: cursor,
    });
    if (page.assets.length === 0) break;
    if (r < offset + page.assets.length) {
      return mapExpoAsset(page.assets[r - offset]);
    }
    offset += page.assets.length;
    cursor = page.hasNextPage ? page.endCursor : undefined;
  }

  return mapExpoAsset(first.assets[first.assets.length - 1]);
}

/** Insert or locate asset in a list sorted by creationTime descending (newest first). */
export function mergePhotoIntoSortedDesc(
  photos: MediaAsset[],
  asset: MediaAsset
): { photos: MediaAsset[]; index: number } {
  const existing = photos.findIndex((p) => p.id === asset.id);
  if (existing >= 0) {
    return { photos, index: existing };
  }
  let i = 0;
  while (i < photos.length && photos[i].creationTime >= asset.creationTime) {
    i++;
  }
  return {
    photos: [...photos.slice(0, i), asset, ...photos.slice(i)],
    index: i,
  };
}

export function useMediaLibrary() {
  const [permissionStatus, setPermissionStatus] =
    useState<MediaLibrary.PermissionStatus | null>(null);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const allPhotosCache = useRef<MediaAsset[]>([]);

  const requestPermission = useCallback(async () => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    setPermissionStatus(status);
    return status === "granted";
  }, []);

  const checkPermission = useCallback(async () => {
    const { status } = await MediaLibrary.getPermissionsAsync();
    setPermissionStatus(status);
    return status === "granted";
  }, []);

  const fetchAllPhotos = useCallback(async () => {
    if (allPhotosCache.current.length > 0) return allPhotosCache.current;

    setIsLoading(true);
    const result = await MediaLibrary.getAssetsAsync({
      mediaType: [MediaLibrary.MediaType.photo],
      first: 1000,
      sortBy: [MediaLibrary.SortBy.creationTime],
    });

    const mapped: MediaAsset[] = result.assets.map(mapExpoAsset);

    allPhotosCache.current = mapped;
    setAssets(mapped);
    setIsLoading(false);
    return mapped;
  }, []);

  const fetchAssetsByDate = useCallback(
    async (date: Date) => {
      setIsLoading(true);
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const result = await MediaLibrary.getAssetsAsync({
        mediaType: [MediaLibrary.MediaType.photo],
        createdAfter: startOfDay.getTime(),
        createdBefore: endOfDay.getTime(),
        first: 100,
        sortBy: [MediaLibrary.SortBy.creationTime],
      });

      const mapped: MediaAsset[] = result.assets.map((a) => ({
        id: a.id,
        uri: a.uri,
        creationTime: a.creationTime,
        mediaType: "photo",
        width: a.width,
        height: a.height,
      }));
      setAssets(mapped);
      setIsLoading(false);
      return mapped;
    },
    []
  );

  const fetchAssetsByYear = useCallback(
    async (year: number) => {
      setIsLoading(true);
      const startDate = new Date(year, 0, 1).getTime();
      const endDate = new Date(year + 1, 0, 1).getTime();

      const result = await MediaLibrary.getAssetsAsync({
        mediaType: [MediaLibrary.MediaType.photo],
        createdAfter: startDate,
        createdBefore: endDate,
        first: 100,
        sortBy: [MediaLibrary.SortBy.creationTime],
      });

      const mapped: MediaAsset[] = result.assets.map((a) => ({
        id: a.id,
        uri: a.uri,
        creationTime: a.creationTime,
        mediaType: "photo",
        width: a.width,
        height: a.height,
      }));
      setAssets(mapped);
      setIsLoading(false);
      return mapped;
    },
    []
  );

  const getRandomAsset = useCallback(async (): Promise<MediaAsset | null> => {
    return pickRandomPhotoFromLibrary();
  }, []);

  return {
    permissionStatus,
    assets,
    isLoading,
    requestPermission,
    checkPermission,
    fetchAllPhotos,
    fetchAssetsByDate,
    fetchAssetsByYear,
    getRandomAsset,
  };
}
