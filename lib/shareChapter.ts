import { Share } from "react-native";
import { supabase } from "./supabase";
import { captureException } from "./errors";
import { scheduleReviewAfterFirstShare } from "./ratingPrompt";

const SHARE_BASE = "https://getlittlemoments.com/share/chapter";

function generateToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 22; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

/**
 * Creates (or returns existing) share link for a chapter.
 * Idempotent per (user, chapter) pair via the unique index.
 */
export async function createChapterShareLink(chapterId: string): Promise<string> {
  const { data: existing } = await supabase
    .from("shared_chapters")
    .select("share_token")
    .eq("chapter_id", chapterId)
    .maybeSingle();

  if (existing?.share_token) {
    return `${SHARE_BASE}/${existing.share_token}`;
  }

  const token = generateToken();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase.from("shared_chapters").insert({
    chapter_id: chapterId,
    user_id: user.id,
    share_token: token,
  });

  if (error) {
    // Race condition: another insert won — fetch the existing row.
    if (error.code === "23505") {
      const { data: race } = await supabase
        .from("shared_chapters")
        .select("share_token")
        .eq("chapter_id", chapterId)
        .single();
      if (race?.share_token) {
        void scheduleReviewAfterFirstShare();
        return `${SHARE_BASE}/${race.share_token}`;
      }
    }
    captureException(error, {
      where: "createChapterShareLink",
      chapter_id: chapterId,
      error_code: error.code,
    });
    throw error;
  }

  void scheduleReviewAfterFirstShare();

  return `${SHARE_BASE}/${token}`;
}

export async function openChapterShareSheet(
  url: string,
  _title?: string
): Promise<void> {
  await Share.share({ message: url });
}
