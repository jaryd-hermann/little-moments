import { transcribeAudio } from "@/lib/whisper";
import { useMagicFillStore } from "@/store/magicFillStore";

const pending = new Set<Promise<void>>();

function appendSegmentToStore(ymd: string, segment: string) {
  const trimmed = segment.trim();
  if (!trimmed) return;
  useMagicFillStore.setState((s) => ({
    drafts: s.drafts.map((d) => {
      if (d.ymd !== ymd) return d;
      const merged = d.rawCaption.trim()
        ? `${d.rawCaption.trim()} ${trimmed}`
        : trimmed;
      return { ...d, rawCaption: merged, captionSource: "voice" as const };
    }),
  }));
}

/** Transcribe a handoff clip and merge into the draft — tracked for flush. */
export function enqueueMagicFillVoiceTranscription(
  ymd: string,
  uri: string
): Promise<void> {
  const job = (async () => {
    try {
      const segment = await transcribeAudio(uri);
      appendSegmentToStore(ymd, segment);
    } catch {
      /* skip failed segment */
    }
  })();

  pending.add(job);
  void job.finally(() => pending.delete(job));
  return job;
}

export async function flushMagicFillVoiceTranscriptions(): Promise<void> {
  await Promise.all([...pending]);
}

export function hasPendingMagicFillVoiceTranscriptions(): boolean {
  return pending.size > 0;
}
