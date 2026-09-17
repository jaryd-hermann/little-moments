import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { captureEvent } from "./errors";
import { supabase, supabaseAnonKey, supabaseUrl } from "./supabase";

const UPLOAD_TIMEOUT_MS = 45_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

/**
 * POST an ArrayBuffer to Supabase Storage, cancelling the request if it stalls
 * past {@link UPLOAD_TIMEOUT_MS}.
 *
 * storage-js's `upload()` cannot forward an abort signal, so a timed-out upload
 * there keeps running and can still land — orphaning the object and pushing the
 * retry into uploading a second copy. Driving the request with our own signal
 * makes the timeout truly cancel it. A failed response throws a plain Error
 * rather than surfacing the raw storage error object.
 */
async function uploadArrayBuffer(
  bucket: string,
  storagePath: string,
  body: ArrayBuffer,
  contentType: string,
  upsert: boolean,
  label: string
): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token ?? supabaseAnonKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${supabaseUrl}/storage/v1/object/${bucket}/${storagePath}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
          "content-type": contentType,
          "cache-control": "max-age=3600",
          "x-upsert": String(upsert),
        },
        body,
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `${label} failed (${response.status})${detail ? `: ${detail}` : ""}`
      );
    }
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`${label} timed out after ${UPLOAD_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const clean = b64.replace(/\s/g, "");
  if (typeof atob !== "function") {
    throw new Error("Cannot decode image data on this runtime");
  }
  const binary = atob(clean);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Read a local file into an ArrayBuffer for Supabase upload.
 * Important: Supabase's JS client wraps Blob in FormData; in React Native that often uploads 0 bytes.
 * ArrayBuffer uses a raw request body and works reliably.
 */
async function uriToUploadArrayBuffer(
  fileUri: string,
  contentType: string
): Promise<ArrayBuffer> {
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) {
    throw new Error("Cache unavailable for media upload");
  }

  const ext = contentType.startsWith("video") ? "mp4" : "jpg";
  const localUri = `${cacheDir}lm-upload-${Date.now()}.${ext}`;

  await FileSystem.copyAsync({ from: fileUri, to: localUri });

  const info = await FileSystem.getInfoAsync(localUri);
  if (!info.exists) {
    await FileSystem.deleteAsync(localUri, { idempotent: true });
    throw new Error("Could not access media file for upload");
  }
  if (typeof info.size === "number" && info.size === 0) {
    await FileSystem.deleteAsync(localUri, { idempotent: true });
    throw new Error("Media file is empty (0 bytes)");
  }

  try {
    const b64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const buffer = base64ToArrayBuffer(b64);
    if (buffer.byteLength === 0) {
      throw new Error("Decoded media is empty");
    }
    return buffer;
  } finally {
    await FileSystem.deleteAsync(localUri, { idempotent: true });
  }
}

export async function uploadEntryMedia(
  userId: string,
  entryId: string,
  fileUri: string,
  mediaType: "image" | "video"
): Promise<{ publicUrl: string; storagePath: string }> {
  const ext = mediaType === "image" ? "jpg" : "mp4";
  const filename = `${Date.now()}.${ext}`;
  const storagePath = `${userId}/${entryId}/${filename}`;
  const contentType =
    mediaType === "image" ? "image/jpeg" : "video/mp4";

  let sourceUri = fileUri;
  if (mediaType === "image") {
    try {
      const normalized = await withTimeout(
        manipulateAsync(fileUri, [], { compress: 0.88, format: SaveFormat.JPEG }),
        15_000,
        "Image compression"
      );
      const info = await FileSystem.getInfoAsync(normalized.uri);
      if (info.exists && typeof info.size === "number" && info.size > 0) {
        sourceUri = normalized.uri;
      }
    } catch {
      /* use original fileUri */
    }
  }

  const body = await withTimeout(
    uriToUploadArrayBuffer(sourceUri, contentType),
    15_000,
    "Reading media file"
  );
  if (body.byteLength === 0) {
    throw new Error("Photo upload is empty — try choosing the image again.");
  }

  const startedAt = Date.now();
  await uploadArrayBuffer(
    "entry-media",
    storagePath,
    body,
    contentType,
    false,
    "Storage upload"
  );

  captureEvent("entry_media_uploaded", {
    media_type: mediaType,
    bytes: body.byteLength,
    elapsed_ms: Date.now() - startedAt,
  });

  const { data } = supabase.storage
    .from("entry-media")
    .getPublicUrl(storagePath);
  return { publicUrl: data.publicUrl, storagePath };
}

/**
 * Upload the original audio from a voice-captured moment.
 *
 * Shares the `entry-media` bucket but is stored under a `voice-` filename and
 * recorded on `entries` (not `entry_media`), so it never reaches the share and
 * summary-card render paths.
 */
export async function uploadEntryVoiceNote(
  userId: string,
  entryId: string,
  fileUri: string
): Promise<{ publicUrl: string; storagePath: string }> {
  const storagePath = `${userId}/${entryId}/voice-${Date.now()}.m4a`;
  const contentType = "audio/m4a";

  const b64 = await withTimeout(
    FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    }),
    15_000,
    "Reading voice note"
  );
  const body = base64ToArrayBuffer(b64);
  if (body.byteLength === 0) {
    throw new Error("Voice note is empty (0 bytes)");
  }

  await uploadArrayBuffer(
    "entry-media",
    storagePath,
    body,
    contentType,
    false,
    "Voice note upload"
  );

  const { data } = supabase.storage
    .from("entry-media")
    .getPublicUrl(storagePath);
  return { publicUrl: data.publicUrl, storagePath };
}

export async function deleteEntryMedia(
  storagePath: string
): Promise<void> {
  const { error } = await supabase.storage
    .from("entry-media")
    .remove([storagePath]);
  if (error) throw error;
}

export async function uploadAvatar(
  userId: string,
  fileUri: string
): Promise<string> {
  const storagePath = `${userId}/avatar.jpg`;
  const contentType = "image/jpeg";

  let sourceUri = fileUri;
  try {
    const normalized = await withTimeout(
      manipulateAsync(fileUri, [{ resize: { width: 512 } }], {
        compress: 0.85,
        format: SaveFormat.JPEG,
      }),
      15_000,
      "Avatar compression"
    );
    const info = await FileSystem.getInfoAsync(normalized.uri);
    if (info.exists && typeof info.size === "number" && info.size > 0) {
      sourceUri = normalized.uri;
    }
  } catch {
    /* use original */
  }

  const body = await withTimeout(
    uriToUploadArrayBuffer(sourceUri, contentType),
    15_000,
    "Reading avatar file"
  );
  if (body.byteLength === 0) {
    throw new Error("Avatar upload is empty — try choosing the image again.");
  }

  await uploadArrayBuffer(
    "avatars",
    storagePath,
    body,
    contentType,
    true,
    "Avatar upload"
  );

  const { data } = supabase.storage.from("avatars").getPublicUrl(storagePath);
  return `${data.publicUrl}?t=${Date.now()}`;
}
