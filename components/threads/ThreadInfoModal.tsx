import {
  InfoSheetMutedNote,
  InfoSheetParagraph,
  PageInfoSheet,
} from "@/components/common/PageInfoSheet";

interface ThreadInfoModalProps {
  visible: boolean;
  onClose: () => void;
}

export function ThreadInfoModal({ visible, onClose }: ThreadInfoModalProps) {
  return (
    <PageInfoSheet
      visible={visible}
      onClose={onClose}
      title="How Threads work"
    >
      <InfoSheetParagraph>
        As you log moments, we read across your entries to find patterns —
        recurring people, places, feelings, and themes you might not have
        noticed on your own.
      </InfoSheetParagraph>

      <InfoSheetParagraph>
        Each thread pairs two moments with a short observation and a question
        you can answer right in the feed. Answering helps us understand what
        matters to you and shapes better connections going forward — it is
        part of journaling here, not just a quiz.
      </InfoSheetParagraph>

      <InfoSheetParagraph>
        Give feedback with the thumbs up and thumbs down buttons. Highlight
        threads you want more of, or hide ones that do not fit. That signal
        tunes what we surface for you over time.
      </InfoSheetParagraph>

      <InfoSheetParagraph last>
        The more you capture and reflect, the richer threads get. They are
        stored permanently — they never disappear.
      </InfoSheetParagraph>

      <InfoSheetMutedNote>
        Your entries stay encrypted on your device and in transit. For
        analysis, we use secure processing: text is converted into numerical
        embeddings and technical metadata that are not human-readable in
        storage — so nobody can skim your journal to find threads.
      </InfoSheetMutedNote>
    </PageInfoSheet>
  );
}
