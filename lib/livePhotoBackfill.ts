import { getLivePhotoVideoUri } from "@/hooks/useMediaLibrary";
import type { EntryMedia } from "@/store/entryStore";
import * as MediaLibrary from "expo-media-library";
import { Platform } from "react-native";

const backfillInflight = new Map<string, Promise<string | null>>();

/** Max delta between entry `taken_at` and Photos asset creationTime (ms). */
const TAKEN_AT_MATCH_MS = 10000;

/**
 * Recover a Live Photo loop from the camera roll when we never uploaded
 * `paired_video_*`. Tries every asset in the window (closest first) and
 * only returns when `getLivePhotoVideoUri` confirms a Live Photo.
 */
export async function resolvePairedVideoFromCameraRoll(
  media: EntryMedia
): Promise<string | null> {
  if (Platform.OS !== "ios") return null;
  if (media.media_type !== "image") return null;
  if (media.paired_video_storage_path || media.paired_video_storage_url) {
    return null;
  }
  if (!media.taken_at) return null;

  const existing = backfillInflight.get(media.id);
  if (existing) return existing;

  const pending = (async () => {
    try {
      const perm = await MediaLibrary.getPermissionsAsync();
      if (perm.status !== "granted" && (perm.status as string) !== "limited") {
        return null;
      }

      const takenMs = new Date(media.taken_at!).getTime();
      if (!Number.isFinite(takenMs)) return null;

      const page = await MediaLibrary.getAssetsAsync({
        mediaType: [MediaLibrary.MediaType.photo],
        createdAfter: takenMs - TAKEN_AT_MATCH_MS,
        createdBefore: takenMs + TAKEN_AT_MATCH_MS,
        first: 120,
      });

      const candidates = page.assets
        .map((a) => ({
          id: a.id,
          diff: Math.abs(a.creationTime - takenMs),
        }))
        .filter((c) => c.diff <= TAKEN_AT_MATCH_MS)
        .sort((a, b) => a.diff - b.diff);

      for (const candidate of candidates) {
        const paired = await getLivePhotoVideoUri(candidate.id);
        if (paired?.uri) return paired.uri;
      }
      return null;
    } catch {
      return null;
    } finally {
      backfillInflight.delete(media.id);
    }
  })();

  backfillInflight.set(media.id, pending);
  return pending;
}

export function clipMayHaveLiveMotion(media: EntryMedia): boolean {
  if (media.media_type === "video") return true;
  if (media.paired_video_storage_path || media.paired_video_storage_url) {
    return true;
  }
  return Platform.OS === "ios" && Boolean(media.taken_at);
}
