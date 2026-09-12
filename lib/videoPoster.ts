const posterCache = new Map<string, string>();

type VideoThumbnailsNative = {
  getThumbnail: (
    sourceFilename: string,
    options?: { time?: number; quality?: number }
  ) => Promise<{ uri: string }>;
};

let videoThumbnailsNative: VideoThumbnailsNative | null | undefined;

function getVideoThumbnailsNative(): VideoThumbnailsNative | null {
  if (videoThumbnailsNative !== undefined) return videoThumbnailsNative;
  try {
    const { requireOptionalNativeModule } =
      require("expo-modules-core") as typeof import("expo-modules-core");
    videoThumbnailsNative =
      requireOptionalNativeModule<VideoThumbnailsNative>("ExpoVideoThumbnails");
  } catch {
    videoThumbnailsNative = null;
  }
  return videoThumbnailsNative;
}

export function isVideoFileUri(uri: string | null | undefined): boolean {
  if (!uri) return false;
  return (
    /\.(mp4|mov|m4v)(\?|#|$)/i.test(uri) ||
    uri.includes("lm-lib-vid-") ||
    uri.includes("lm-upload-")
  );
}

function posterCacheKey(assetId: string, timeSec: number): string {
  return `${assetId}:${Math.round(timeSec * 10)}`;
}

/** Synchronous read — survives carousel cell remounts. */
export function peekVideoPosterUri(
  assetId: string,
  timeSec = 0
): string | null {
  return posterCache.get(posterCacheKey(assetId, timeSec)) ?? null;
}

/** JPEG poster frame for a local video file (camera-roll previews). */
export async function resolveVideoPosterUri(
  assetId: string,
  videoUri: string,
  timeSec = 0
): Promise<string | null> {
  if (!videoUri?.trim()) return null;
  // Strip the iOS spatial-video `#bplist` fragment — AVFoundation can't open
  // the file with it attached.
  const cleanUri = videoUri.indexOf("#") === -1
    ? videoUri
    : videoUri.slice(0, videoUri.indexOf("#"));
  // iOS Photos `localUri` paths often lack a file extension — still valid for
  // `getThumbnailAsync` when they are `file://` paths.
  if (!isVideoFileUri(cleanUri) && !cleanUri.startsWith("file://")) {
    return null;
  }

  const key = posterCacheKey(assetId, timeSec);
  const cached = posterCache.get(key);
  if (cached) return cached;

  const thumbnails = getVideoThumbnailsNative();
  if (!thumbnails) {
    return null;
  }

  try {
    const { uri } = await thumbnails.getThumbnail(cleanUri, {
      time: Math.max(0, Math.round(timeSec * 1000)),
      quality: 0.72,
    });
    if (uri) {
      posterCache.set(key, uri);
      return uri;
    }
  } catch {
    /* poster generation failed — caller falls back to neutral surface */
  }
  return null;
}

export function prefetchVideoPosterUri(
  assetId: string,
  videoUri: string,
  timeSec = 0
): void {
  void resolveVideoPosterUri(assetId, videoUri, timeSec);
}
