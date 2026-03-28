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

    const mapped: MediaAsset[] = result.assets.map((a) => ({
      id: a.id,
      uri: a.uri,
      creationTime: a.creationTime,
      mediaType: "photo",
      width: a.width,
      height: a.height,
    }));

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

  const getRandomAsset =
    useCallback(async (): Promise<MediaAsset | null> => {
      let pool = allPhotosCache.current;
      if (pool.length === 0) {
        pool = await fetchAllPhotos();
      }
      if (pool.length === 0) return null;
      return pool[Math.floor(Math.random() * pool.length)];
    }, [fetchAllPhotos]);

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
