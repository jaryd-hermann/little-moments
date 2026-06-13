import {
  getEntryMediaDisplayUri,
  resolveEntryMediaUriAsync,
  resolvePairedVideoUriAsync,
} from "@/lib/entryMediaUrl";
import { chapterImageSlideToMedia, type ChapterRecord } from "@/lib/chapters";
import type { Entry, EntryMedia } from "@/store/entryStore";
import * as FileSystem from "expo-file-system";
import { Image } from "expo-image";

/**
 * App-wide media prefetcher.
 *
 * Why this exists: the mashup feature renders many small video / live-photo
 * clips back-to-back. Loading each one from Supabase storage on first paint
 * makes the grid feel sluggish ("the screen isn't rendering all these
 * videos"). This module:
 *
 *  1. Downloads each media item's bytes (still / paired-video / video) to
 *     `FileSystem.cacheDirectory` once. Subsequent loads are instant.
 *  2. Exposes a *synchronous* lookup (`getCachedUriSync`) so render code can
 *     consult the cache without an async hop.
 *  3. Runs as a single concurrency-limited, priority-ordered worker so we
 *     don't blast the network — recent entries get prefetched first, older
 *     entries trail in the background, and screens that are currently
 *     visible can bump their visible clips to the front of the queue.
 *
 * Cache directory items are governed by the OS (cleaned out under disk
 * pressure), so we don't need our own eviction policy.
 */

type CachedKind = "still" | "paired" | "video";

interface CacheRecord {
  still?: string;
  paired?: string;
  video?: string;
}

/** Memory-mirrored cache so render code can do a sync lookup. */
const cacheByMediaId = new Map<string, CacheRecord>();
const completed = new Set<string>();
const inflight = new Set<string>();

interface QueueItem {
  media: EntryMedia;
  priority: number;
}

const queue: QueueItem[] = [];
let running = 0;

/**
 * Max concurrent downloads. Three balances throughput against the bandwidth
 * a moment-heavy user is willing to give up in the background — a single
 * paired-video file can be 1–2 MB.
 */
const CONCURRENCY = 3;

function extFor(kind: CachedKind): string {
  return kind === "still" ? "jpg" : "mp4";
}

function prefixFor(kind: CachedKind): string {
  return kind === "still" ? "lm-pf-st" : kind === "paired" ? "lm-pf-pv" : "lm-pf-v";
}

function cachePathFor(media: EntryMedia, kind: CachedKind): string {
  const dir = FileSystem.cacheDirectory ?? "";
  return `${dir}${prefixFor(kind)}-${media.id}.${extFor(kind)}`;
}

/**
 * Synchronous lookup for cached URIs. Returns the `file://` path if we've
 * already downloaded the bytes, `null` otherwise. Safe to call from render
 * paths — it never touches disk.
 */
export function getCachedUriSync(
  media: EntryMedia,
  kind: CachedKind
): string | null {
  return cacheByMediaId.get(media.id)?.[kind] ?? null;
}

function rememberCache(
  mediaId: string,
  kind: CachedKind,
  fileUri: string
): void {
  const prev = cacheByMediaId.get(mediaId) ?? {};
  cacheByMediaId.set(mediaId, { ...prev, [kind]: fileUri });
}

async function downloadToCache(
  remoteUri: string,
  destPath: string
): Promise<string | null> {
  try {
    const info = await FileSystem.getInfoAsync(destPath);
    if (info.exists && (info.size ?? 0) > 0) return info.uri;
    const dl = await FileSystem.downloadAsync(remoteUri, destPath);
    return dl.status === 200 ? dl.uri : null;
  } catch {
    return null;
  }
}

/**
 * Idempotently warm the cache for one EntryMedia. Resolves a signed URL
 * once, prefetches the still bitmap into expo-image's disk cache, and
 * downloads the paired Live Photo video or full-video file to FileSystem
 * cache so they can be played from disk later.
 */
async function prefetchOne(media: EntryMedia): Promise<void> {
  if (completed.has(media.id) || inflight.has(media.id)) return;
  inflight.add(media.id);
  try {
    const remoteStill = await resolveEntryMediaUriAsync(media);
    const stillUri = remoteStill || getEntryMediaDisplayUri(media);
    if (!stillUri) return;

    if (media.media_type === "image") {
      void Image.prefetch(stillUri).catch(() => {});
      const cachedStill = await downloadToCache(
        stillUri,
        cachePathFor(media, "still")
      );
      rememberCache(media.id, "still", cachedStill ?? stillUri);

      if (media.paired_video_storage_path || media.paired_video_storage_url) {
        const pairedRemote = await resolvePairedVideoUriAsync(media);
        if (pairedRemote) {
          const cached = await downloadToCache(
            pairedRemote,
            cachePathFor(media, "paired")
          );
          if (cached) rememberCache(media.id, "paired", cached);
        }
      }
    } else if (media.media_type === "video") {
      const cached = await downloadToCache(
        stillUri,
        cachePathFor(media, "video")
      );
      if (cached) rememberCache(media.id, "video", cached);
    }

    completed.add(media.id);
  } finally {
    inflight.delete(media.id);
  }
}

function drain(): void {
  while (running < CONCURRENCY && queue.length > 0) {
    queue.sort((a, b) => b.priority - a.priority);
    const item = queue.shift();
    if (!item) break;
    running++;
    void prefetchOne(item.media).finally(() => {
      running--;
      drain();
    });
  }
}

/**
 * Queue a single media item for background prefetch at the given priority.
 * Higher priority items jump the line. Already-completed items are a no-op.
 */
export function enqueuePrefetch(media: EntryMedia, priority = 0): void {
  if (completed.has(media.id)) return;
  const existing = queue.find((q) => q.media.id === media.id);
  if (existing) {
    if (priority > existing.priority) existing.priority = priority;
    return;
  }
  queue.push({ media, priority });
  drain();
}

/**
 * Bulk-enqueue every media item across a list of moment entries. Priority
 * decreases with array position so the newest entries (which sit at the top
 * of the entries store and are the most likely to be viewed first) get
 * prefetched first.
 */
export function enqueueEntriesForPrefetch(entries: Entry[]): void {
  let priorityOffset = 0;
  for (const e of entries) {
    if (e.entry_type !== "moment") continue;
    for (const m of e.media ?? []) {
      enqueuePrefetch(m, -priorityOffset);
      priorityOffset++;
    }
  }
}

/**
 * Bump-priority enqueue for an ordered list of clips currently visible (or
 * about to be visible) on screen. `basePriority` should be larger than
 * anything used by the background warm so visible clips jump the line.
 */
export function enqueueClipsForPrefetch(
  clips: { media: EntryMedia }[],
  basePriority = 1000
): void {
  clips.forEach((c, i) => {
    enqueuePrefetch(c.media, basePriority - i);
  });
}

/** Whether prefetch has finished and a renderable URI is in the sync cache. */
export function isClipMediaPrefetched(media: EntryMedia): boolean {
  if (completed.has(media.id)) return true;
  if (media.media_type === "video") {
    return !!getCachedUriSync(media, "video");
  }
  return !!getCachedUriSync(media, "still");
}

/** Whether we have enough URI data to render a clip without a blank frame. */
export function isClipMediaReady(media: EntryMedia): boolean {
  if (media.media_type === "video") {
    return (
      !!getCachedUriSync(media, "video") ||
      !!getEntryMediaDisplayUri(media)
    );
  }
  const still =
    getCachedUriSync(media, "still") || getEntryMediaDisplayUri(media);
  if (!still) return false;
  if (media.paired_video_storage_path || media.paired_video_storage_url) {
    return (
      !!getCachedUriSync(media, "paired") ||
      !!media.paired_video_storage_path ||
      !!media.paired_video_storage_url
    );
  }
  return true;
}

/**
 * Block until every clip in the list is ready to render, or until
 * `timeoutMs` elapses. Always enqueues high-priority prefetch first.
 */
export async function waitForClipsReady(
  clips: { media: EntryMedia }[],
  timeoutMs = 12000
): Promise<void> {
  if (clips.length === 0) return;
  enqueueClipsForPrefetch(clips, 12000);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (clips.every((c) => isClipMediaPrefetched(c.media))) return;
    await new Promise((r) => setTimeout(r, 80));
  }
}

/** Warm collage images used on chapter list / feed cover cards. */
export function enqueueChapterCoversForPrefetch(chapters: ChapterRecord[]): void {
  let offset = 0;
  for (const ch of chapters) {
    if (!ch.image_slide) continue;
    for (const m of chapterImageSlideToMedia(ch.image_slide)) {
      enqueuePrefetch(m, 800 - offset);
      offset++;
    }
  }
}

/**
 * Test / debug helper — wipes all in-memory caches so a hot reload can
 * re-prefetch from scratch. Not used in production.
 */
export function __resetMediaPrefetchForTests(): void {
  cacheByMediaId.clear();
  completed.clear();
  inflight.clear();
  queue.length = 0;
  running = 0;
}
