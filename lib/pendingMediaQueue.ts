import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Durable record of a photo that was attached to a moment but never made it
 * into `entry_media`. Persisted so an upload killed by backgrounding, a dead
 * network, or an app crash can be retried on a later launch instead of
 * silently costing the user their photo.
 */
export interface PendingMediaItem {
  id: string;
  userId: string;
  entryId: string;
  /** Local file/asset URI. May no longer resolve by the time we retry. */
  uri: string;
  mediaType: "image" | "video";
  assetId: string | null;
  takenAtIso: string | null;
  displayOrder: number;
  /** Set when the upload already succeeded and only the insert failed, so a
   *  retry links the existing object instead of uploading a second copy. */
  storagePath: string | null;
  storageUrl: string | null;
  attempts: number;
  queuedAt: string;
}

const STORAGE_KEY = "lm.pendingMedia.v1";

/** Give up after this many drains; a photo failing this often will not start working. */
export const MAX_MEDIA_ATTEMPTS = 5;

/** Local URIs go stale (cache eviction, asset deletion), so stop retrying eventually. */
export const MAX_MEDIA_AGE_MS = 7 * 24 * 60 * 60 * 1000;

async function readQueue(): Promise<PendingMediaItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingMediaItem[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(items: PendingMediaItem[]): Promise<void> {
  try {
    if (items.length === 0) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      return;
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* a queue we cannot persist is no worse than the old silent drop */
  }
}

export async function getPendingMedia(): Promise<PendingMediaItem[]> {
  return readQueue();
}

/**
 * Queue a failed attach. Re-queueing the same entry + local URI replaces the
 * earlier record so a moment saved, failed, and retried in one session does
 * not accumulate duplicates.
 */
export async function enqueuePendingMedia(
  item: Omit<PendingMediaItem, "id" | "attempts" | "queuedAt"> &
    Partial<Pick<PendingMediaItem, "attempts">>
): Promise<void> {
  const queue = await readQueue();
  const existing = queue.find(
    (q) => q.entryId === item.entryId && q.uri === item.uri
  );
  const next: PendingMediaItem = {
    id: existing?.id ?? `${item.entryId}:${Date.now()}`,
    queuedAt: existing?.queuedAt ?? new Date().toISOString(),
    attempts: item.attempts ?? existing?.attempts ?? 0,
    userId: item.userId,
    entryId: item.entryId,
    uri: item.uri,
    mediaType: item.mediaType,
    assetId: item.assetId,
    takenAtIso: item.takenAtIso,
    displayOrder: item.displayOrder,
    // Never downgrade a known-good upload back to null on a later failure.
    storagePath: item.storagePath ?? existing?.storagePath ?? null,
    storageUrl: item.storageUrl ?? existing?.storageUrl ?? null,
  };
  await writeQueue([...queue.filter((q) => q.id !== next.id), next]);
}

export async function removePendingMedia(id: string): Promise<void> {
  const queue = await readQueue();
  await writeQueue(queue.filter((q) => q.id !== id));
}

export async function markPendingMediaAttempted(id: string): Promise<void> {
  const queue = await readQueue();
  await writeQueue(
    queue.map((q) => (q.id === id ? { ...q, attempts: q.attempts + 1 } : q))
  );
}

export async function clearPendingMedia(): Promise<void> {
  await writeQueue([]);
}
