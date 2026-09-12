import type { Entry } from "@/store/entryStore";
import { enqueueClipsForPrefetch } from "@/lib/mediaPrefetch";

/** Bump visible/on-deck moment media ahead of background warm. */
export function enqueueMomentsMediaPrefetch(
  entries: Iterable<Entry>,
  basePriority = 8000
): void {
  const clips: { media: NonNullable<Entry["media"]>[number] }[] = [];
  for (const e of entries) {
    if (e.entry_type !== "moment") continue;
    const m = e.media?.[0];
    if (m) clips.push({ media: m });
  }
  if (clips.length > 0) {
    enqueueClipsForPrefetch(clips, basePriority);
  }
}
