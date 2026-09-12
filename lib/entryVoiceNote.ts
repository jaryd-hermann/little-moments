import { supabase } from "@/lib/supabase";
import { uploadEntryVoiceNote } from "@/lib/storage";
import { useEntryStore } from "@/store/entryStore";
import type { VoiceClip } from "@/components/composer/MicRecorder";

/**
 * Persist the original audio behind a voice-captured moment.
 *
 * Fire-and-forget by design: the moment is already saved by the time this
 * runs, and the recording is a bonus on top of the transcript, so a failure
 * here must never surface as a save error. The clip is written to `entries`
 * (not `entry_media`) so it stays off shares and summary cards.
 */
export async function attachVoiceNoteToEntry(
  userId: string,
  entryId: string,
  clip: VoiceClip
): Promise<void> {
  try {
    const { publicUrl, storagePath } = await uploadEntryVoiceNote(
      userId,
      entryId,
      clip.uri
    );
    const patch = {
      voice_note_storage_path: storagePath,
      voice_note_storage_url: publicUrl,
      voice_note_duration_seconds: clip.durationSeconds,
    };
    const { error } = await supabase
      .from("entries")
      .update(patch)
      .eq("id", entryId);
    if (error) {
      // A missing column here means migration `0064_entry_voice_note.sql`
      // hasn't been applied. Call that out by name: the symptom is just a
      // missing audio card on the detail screen, which is otherwise very hard
      // to trace back to the schema.
      if (error.code === "42703") {
        console.error(
          `[voiceNote] entries is missing the voice_note_* columns — apply supabase/migrations/0064_entry_voice_note.sql. (${error.message})`
        );
        return;
      }
      throw error;
    }
    useEntryStore.getState().updateEntry(entryId, patch);
  } catch (e) {
    console.error(
      "[voiceNote] could not save the recording:",
      e instanceof Error ? e.message : e
    );
  }
}
