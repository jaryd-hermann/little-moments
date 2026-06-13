import { Share } from "react-native";
import type { MashupBucket } from "@/lib/mashupBuckets";
import { captureException } from "./errors";
import { scheduleReviewAfterFirstShare } from "./ratingPrompt";
import { supabase } from "./supabase";

const SHARE_BASE = "https://getlittlemoments.com/share/mashup";

function generateToken(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 22; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

export type MashupClipSnapshot = {
  storage_path: string | null;
  media_type: string;
  paired_video_storage_path?: string | null;
  title?: string | null;
  entry_date?: string | null;
  entry_id: string;
};

function clipSnapshotsForBucket(bucket: MashupBucket): MashupClipSnapshot[] {
  return bucket.clips.slice(0, 40).map((c) => ({
    storage_path: c.media.storage_path ?? null,
    media_type: c.media.media_type,
    paired_video_storage_path: c.media.paired_video_storage_path ?? null,
    title: c.entry.title ?? null,
    entry_date: c.entry.entry_date ?? null,
    entry_id: c.entry.id,
  }));
}

/**
 * Creates (or returns existing) share link for a mashup bucket.
 * Idempotent per (user, bucket_type, bucket_key).
 */
export async function createMashupShareLink(
  bucket: MashupBucket
): Promise<string> {
  const { data: existing } = await supabase
    .from("shared_mashups")
    .select("share_token")
    .eq("bucket_type", bucket.type)
    .eq("bucket_key", bucket.key)
    .maybeSingle();

  if (existing?.share_token) {
    return `${SHARE_BASE}/${existing.share_token}`;
  }

  const token = generateToken();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const previewPath = bucket.clips[0]?.media.storage_path ?? null;
  const clipSnapshots = clipSnapshotsForBucket(bucket);

  const { error } = await supabase.from("shared_mashups").insert({
    user_id: user.id,
    bucket_type: bucket.type,
    bucket_key: bucket.key,
    label: bucket.label,
    clip_count: bucket.count,
    preview_storage_path: previewPath,
    clip_snapshots: clipSnapshots,
    share_token: token,
  });

  if (error) {
    if (error.code === "23505") {
      const { data: race } = await supabase
        .from("shared_mashups")
        .select("share_token")
        .eq("bucket_type", bucket.type)
        .eq("bucket_key", bucket.key)
        .single();
      if (race?.share_token) {
        void scheduleReviewAfterFirstShare();
        return `${SHARE_BASE}/${race.share_token}`;
      }
    }
    captureException(error, {
      where: "createMashupShareLink",
      bucket_type: bucket.type,
      bucket_key: bucket.key,
      error_code: error.code,
    });
    throw error;
  }

  void scheduleReviewAfterFirstShare();
  return `${SHARE_BASE}/${token}`;
}

export async function openMashupShareSheet(url: string): Promise<void> {
  await Share.share({ message: url });
}
