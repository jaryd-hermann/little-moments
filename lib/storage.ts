import { supabase } from "./supabase";

export async function uploadEntryMedia(
  userId: string,
  entryId: string,
  fileUri: string,
  mediaType: "image" | "video"
): Promise<string> {
  const ext = mediaType === "image" ? "jpg" : "mp4";
  const filename = `${Date.now()}.${ext}`;
  const path = `${userId}/${entryId}/${filename}`;

  const response = await fetch(fileUri);
  const blob = await response.blob();

  const { error } = await supabase.storage
    .from("entry-media")
    .upload(path, blob, {
      contentType:
        mediaType === "image" ? "image/jpeg" : "video/mp4",
      upsert: false,
    });

  if (error) throw error;

  const { data } = supabase.storage
    .from("entry-media")
    .getPublicUrl(path);
  return data.publicUrl;
}

export async function deleteEntryMedia(
  storagePath: string
): Promise<void> {
  const { error } = await supabase.storage
    .from("entry-media")
    .remove([storagePath]);
  if (error) throw error;
}
