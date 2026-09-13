import {
  getEntryMediaDisplayUri,
  resolveEntryMediaUriAsync,
  resolvePairedVideoUriAsync,
} from "@/lib/entryMediaUrl";
import { resolvePairedVideoFromCameraRoll, clipMayHaveLiveMotion } from "@/lib/livePhotoBackfill";
import { chapterImageSlideToMedia, type ChapterRecord } from "@/lib/chapters";
import type { Entry, EntryMedia } from "@/store/entryStore";
// `/legacy`: `cacheDirectory` isn't on the current API. Imported from the new
// one it was `undefined`, so every cache path came out relative, every download
// threw, and nothing was ever actually on disk — the prefetcher reported success
// while doing nothing.
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "expo-image";
import { Platform } from "react-native";

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
/**
 * Media we've looked behind for motion and found none. `clipMayHaveLiveMotion`
 * is only ever a guess — on iOS it says yes to any photo with a `taken_at` —
 * and without recording the answer the bookkeeping below re-queues every such
 * photo on each enqueue. During a movie that meant three camera-roll lookups
 * running at all times while the next slides' stills waited behind them.
 */
const motionMissing = new Set<string>();

interface QueueItem {
  media: EntryMedia;
  priority: number;
  /** Mashup montage: download paired / video bytes before the still JPEG. */
  motionFirst?: boolean;
  /** Thumbnail warm only — skip paired video / camera-roll recovery. */
  stillOnly?: boolean;
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
function hasMotionFileCached(media: EntryMedia): boolean {
  const paired = getCachedUriSync(media, "paired");
  const video = getCachedUriSync(media, "video");
  return Boolean(
    paired?.startsWith("file:") || video?.startsWith("file:")
  );
}

async function prefetchMotionForMedia(
  media: EntryMedia,
  stillUri: string | null
): Promise<boolean> {
  if (media.media_type === "video") {
    if (!stillUri) return false;
    const cached = await downloadToCache(stillUri, cachePathFor(media, "video"));
    if (cached) {
      rememberCache(media.id, "video", cached);
      return true;
    }
    return false;
  }

  if (media.paired_video_storage_path || media.paired_video_storage_url) {
    const pairedRemote = await resolvePairedVideoUriAsync(media);
    if (pairedRemote) {
      const cached = await downloadToCache(
        pairedRemote,
        cachePathFor(media, "paired")
      );
      if (cached) {
        rememberCache(media.id, "paired", cached);
        return true;
      }
    }
    return false;
  }

  if (Platform.OS === "ios" && media.taken_at) {
    const rollUri = await resolvePairedVideoFromCameraRoll(media);
    if (rollUri?.startsWith("file:")) {
      const dest = cachePathFor(media, "paired");
      try {
        const info = await FileSystem.getInfoAsync(dest);
        if (!info.exists || (info.size ?? 0) === 0) {
          await FileSystem.copyAsync({ from: rollUri, to: dest });
        }
        const copied = await FileSystem.getInfoAsync(dest);
        if (copied.exists && (copied.size ?? 0) > 0) {
          rememberCache(media.id, "paired", dest);
          return true;
        }
        rememberCache(media.id, "paired", rollUri);
        return true;
      } catch {
        rememberCache(media.id, "paired", rollUri);
        return true;
      }
    }
    if (rollUri) {
      const cached = await downloadToCache(rollUri, cachePathFor(media, "paired"));
      if (cached) {
        rememberCache(media.id, "paired", cached);
        return true;
      }
    }
  }

  return false;
}

function prefetchStillInBackground(media: EntryMedia, stillUri: string): void {
  void (async () => {
    void Image.prefetch(stillUri).catch(() => {});
    const cachedStill = await downloadToCache(
      stillUri,
      cachePathFor(media, "still")
    );
    rememberCache(media.id, "still", cachedStill ?? stillUri);
  })();
}

async function prefetchOne(
  media: EntryMedia,
  motionFirst = false,
  stillOnly = false
): Promise<void> {
  if (inflight.has(media.id)) return;
  if (completed.has(media.id) && hasMotionFileCached(media)) return;
  if (completed.has(media.id) && motionMissing.has(media.id)) return;
  if (completed.has(media.id) && !clipMayHaveLiveMotion(media)) return;
  // Left to retry: a `stillOnly` pass finished this one without ever looking for
  // motion, and now something wants the motion too.
  if (completed.has(media.id)) {
    completed.delete(media.id);
  }
  inflight.add(media.id);
  try {
    const remoteStill = await resolveEntryMediaUriAsync(media);
    const stillUri = remoteStill || getEntryMediaDisplayUri(media);
    if (!stillUri && media.media_type !== "video") return;

    let gotMotion = false;

    if (stillOnly && media.media_type === "image") {
      if (!stillUri) return;
      void Image.prefetch(stillUri).catch(() => {});
      const cachedStill = await downloadToCache(
        stillUri,
        cachePathFor(media, "still")
      );
      rememberCache(media.id, "still", cachedStill ?? stillUri);
      completed.add(media.id);
      return;
    }

    if (motionFirst && clipMayHaveLiveMotion(media)) {
      // Started before the motion lookup rather than after it. The still is what
      // a slide falls back to and what readiness is measured on, so it shouldn't
      // queue behind a camera-roll search that will often find nothing.
      if (stillUri && media.media_type === "image") {
        prefetchStillInBackground(media, stillUri);
      }
      gotMotion = await prefetchMotionForMedia(media, stillUri);
    } else if (media.media_type === "image") {
      if (!stillUri) return;
      void Image.prefetch(stillUri).catch(() => {});
      const cachedStill = await downloadToCache(
        stillUri,
        cachePathFor(media, "still")
      );
      rememberCache(media.id, "still", cachedStill ?? stillUri);

      gotMotion = await prefetchMotionForMedia(media, stillUri);
    } else if (media.media_type === "video") {
      gotMotion = await prefetchMotionForMedia(media, stillUri);
    }

    if (!gotMotion && stillUri && clipMayHaveLiveMotion(media)) {
      // Looked and there was nothing there, so the guards above can stop
      // re-queueing this one.
      motionMissing.add(media.id);
    }
    // Not when the URL wouldn't resolve at all: that's worth another try later.
    if (gotMotion || stillUri) completed.add(media.id);
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
    void prefetchOne(item.media, item.motionFirst, item.stillOnly).finally(() => {
      running--;
      drain();
    });
  }
}

/**
 * Queue a single media item for background prefetch at the given priority.
 * Higher priority items jump the line. Already-completed items are a no-op.
 */
export function enqueuePrefetch(
  media: EntryMedia,
  priority = 0,
  opts?: { motionFirst?: boolean; stillOnly?: boolean }
): void {
  if (completed.has(media.id) && hasMotionFileCached(media)) return;
  if (completed.has(media.id) && motionMissing.has(media.id)) return;
  if (completed.has(media.id) && !clipMayHaveLiveMotion(media)) return;
  if (completed.has(media.id)) {
    completed.delete(media.id);
  }
  const existing = queue.find((q) => q.media.id === media.id);
  if (existing) {
    if (priority > existing.priority) existing.priority = priority;
    if (opts?.motionFirst) existing.motionFirst = true;
    if (opts?.stillOnly) existing.stillOnly = true;
    return;
  }
  queue.push({
    media,
    priority,
    motionFirst: opts?.motionFirst,
    stillOnly: opts?.stillOnly,
  });
  drain();
}

/**
 * Bulk-enqueue every media item across a list of moment entries. Priority
 * decreases with array position so the newest entries (which sit at the top
 * of the entries store and are the most likely to be viewed first) get
 * prefetched first.
 */
/** Background warm cap — still JPEGs only; motion waits for mashup surfaces. */
const BACKGROUND_PREFETCH_ENTRY_LIMIT = 16;

export function enqueueEntriesForPrefetch(entries: Entry[]): void {
  let priorityOffset = 0;
  let momentCount = 0;
  for (const e of entries) {
    if (e.entry_type !== "moment") continue;
    if (momentCount >= BACKGROUND_PREFETCH_ENTRY_LIMIT) break;
    momentCount++;
    const firstMedia = e.media?.[0];
    if (firstMedia) {
      enqueuePrefetch(firstMedia, -priorityOffset, { stillOnly: true });
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
    enqueuePrefetch(c.media, basePriority - i, { motionFirst: true });
  });
}

/** Whether prefetch has finished for this clip's motion playback needs. */
export function isClipMediaPrefetched(media: EntryMedia): boolean {
  return isClipDisplayReady(media);
}

/**
 * True when there are bytes on disk to put on screen for this clip — its motion
 * if we managed to get any, its still otherwise.
 *
 * Both halves of that used to be wrong. Motion was required whenever
 * `clipMayHaveLiveMotion` said it was possible, which on iOS is any photo with a
 * `taken_at`, so an ordinary photo with no Live Photo behind it was never ready
 * and every gate below ran out its full timeout. And the still branch accepted
 * `getEntryMediaDisplayUri`, a signed URL nothing had fetched yet, so it passed
 * before a single byte had arrived. Together they meant a movie waited the full
 * six seconds and then opened on empty frames anyway.
 */
export function isClipDisplayReady(media: EntryMedia): boolean {
  if (hasMotionFileCached(media)) return true;
  return Boolean(getCachedUriSync(media, "still")?.startsWith("file:"));
}

/** @deprecated — use {@link isClipDisplayReady} for mashup playback gates. */
export function isClipMediaReady(media: EntryMedia): boolean {
  return isClipDisplayReady(media);
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
    if (clips.every((c) => isClipDisplayReady(c.media))) return;
    await new Promise((r) => setTimeout(r, 80));
  }
}

/** Warm collage images used on chapter list / feed cover cards. */
const CHAPTER_COVER_PREFETCH_LIMIT = 4;

export function enqueueChapterCoversForPrefetch(chapters: ChapterRecord[]): void {
  let offset = 0;
  for (const ch of chapters.slice(0, CHAPTER_COVER_PREFETCH_LIMIT)) {
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
  motionMissing.clear();
  queue.length = 0;
  running = 0;
}
