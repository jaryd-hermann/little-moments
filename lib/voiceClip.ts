// `/legacy`: `cacheDirectory` and `copyAsync` don't exist on the current API, so
// importing the new one leaves `cacheDirectory` undefined at runtime.
import * as FileSystem from "expo-file-system/legacy";

const SNAPSHOT_PREFIX = "voice-clip-";

/**
 * Copy a just-finished recording to a path of its own.
 *
 * `useAudioRecorder` keeps one `AVAudioRecorder` — and therefore one output
 * file — for its whole lifetime, because `prepareToRecordAsync()` only builds a
 * fresh recorder when it's given options, and we always call it bare. Every
 * later segment therefore reopens the same URL, and `prepareToRecord()`
 * truncates it.
 *
 * That matters because `transcribeAudio` hands the URI to `FormData`, so React
 * Native memory-maps the file and streams it out over the life of the request.
 * Truncating a mapped file under a reader isn't a recoverable error — the next
 * page fault raises SIGBUS and takes the process down, with no JS frame to
 * catch. Uploading a copy the recorder can't reach removes the hazard.
 *
 * Throws if the copy fails, so callers treat it as "no clip" rather than
 * falling back to the live path.
 */
export async function snapshotVoiceClip(uri: string): Promise<string> {
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) throw new Error("No cache directory to snapshot the clip into");
  const name = `${SNAPSHOT_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 9)}.m4a`;
  const dest = `${cacheDir}${name}`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

export function isVoiceClipSnapshot(uri: string): boolean {
  return uri.includes(`/${SNAPSHOT_PREFIX}`);
}

/** Drop a snapshot once everything that needed to read it is done. */
export async function deleteVoiceClipSnapshot(uri: string): Promise<void> {
  if (!isVoiceClipSnapshot(uri)) return;
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}
