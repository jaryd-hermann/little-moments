import { Share } from "react-native";
import { supabase } from "./supabase";
import { notifyLifecycleEvent } from "./lifecycleEvent";
import { captureException } from "./errors";
import { scheduleReviewAfterFirstShare } from "./ratingPrompt";

const SHARE_BASE = "https://getlittlemoments.com/share";

function generateToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 22; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

/**
 * Creates (or returns existing) share link for an entry.
 * Idempotent per (user, entry) pair via the unique index.
 */
export async function createShareLink(entryId: string): Promise<string> {
  const { data: existing } = await supabase
    .from("shared_entries")
    .select("share_token")
    .eq("entry_id", entryId)
    .maybeSingle();

  if (existing?.share_token) {
    return `${SHARE_BASE}/${existing.share_token}`;
  }

  const token = generateToken();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase.from("shared_entries").insert({
    entry_id: entryId,
    user_id: user.id,
    share_token: token,
  });

  if (error) {
    // Race condition: another insert won — fetch the existing row
    if (error.code === "23505") {
      const { data: race } = await supabase
        .from("shared_entries")
        .select("share_token")
        .eq("entry_id", entryId)
        .single();
      if (race?.share_token) {
        void scheduleReviewAfterFirstShare();
        return `${SHARE_BASE}/${race.share_token}`;
      }
    }
    captureException(error, {
      where: "createShareLink",
      entry_id: entryId,
      error_code: error.code,
    });
    throw error;
  }

  // Fire the sender ack push. Server validates entry ownership +
  // one-shot per (user, entry) so re-creating a link doesn't double-fire.
  void notifyLifecycleEvent("share_created", { entry_id: entryId });
  void scheduleReviewAfterFirstShare();

  return `${SHARE_BASE}/${token}`;
}

export async function openShareSheet(
  url: string,
  _title?: string
): Promise<void> {
  await Share.share({ message: url });
}
