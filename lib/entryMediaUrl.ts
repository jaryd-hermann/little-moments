import { supabase, supabaseAnonKey } from "@/lib/supabase";
import type { EntryMedia } from "@/store/entryStore";

function storageImageHeaders(accessToken: string | undefined): Record<string, string> {
  const bearer = accessToken ?? supabaseAnonKey;
  return {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${bearer}`,
  };
}

/** Anon JWT + apikey for the first paint (RN Image does not send these by default). */
export function getStorageImageHeadersSync(): Record<string, string> {
  return storageImageHeaders(undefined);
}

/** Prefer session access token when signed in (stricter buckets). */
export async function getStorageImageHeaders(): Promise<
  Record<string, string>
> {
  const { data } = await supabase.auth.getSession();
  return storageImageHeaders(data.session?.access_token);
}

/** Public object URLs often fail when RN sends Authorization/apikey; signed URLs still need headers. */
export function isSupabasePublicObjectUrl(uri: string): boolean {
  return uri.includes("/storage/v1/object/public/");
}

/**
 * Supabase Storage object URLs (public or signed) should be fetched as plain GETs — no apikey/Authorization.
 */
export function isSupabaseStorageObjectUrl(uri: string): boolean {
  return uri.includes("/storage/v1/object/");
}

/**
 * Resolves a displayable HTTPS URL for entry media.
 * Falls back to getPublicUrl(storage_path) when storage_url is missing or invalid.
 */
export function getEntryMediaDisplayUri(media: EntryMedia): string {
  const raw = media.storage_url?.trim();
  if (raw && /^https?:\/\//i.test(raw)) {
    return raw;
  }
  if (media.storage_path) {
    const { data } = supabase.storage
      .from("entry-media")
      .getPublicUrl(media.storage_path);
    return data.publicUrl;
  }
  return "";
}

/**
 * Prefer a time-limited signed URL (works with private buckets and stricter RLS).
 * Falls back to the public URL from {@link getEntryMediaDisplayUri}.
 */
export async function resolveEntryMediaUriAsync(
  media: EntryMedia
): Promise<string> {
  if (media.storage_path) {
    const { data, error } = await supabase.storage
      .from("entry-media")
      .createSignedUrl(media.storage_path, 60 * 60 * 24);
    if (!error && data?.signedUrl) {
      return data.signedUrl;
    }
  }
  return getEntryMediaDisplayUri(media);
}
