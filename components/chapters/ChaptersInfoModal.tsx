import {
  InfoSheetParagraph,
  InfoSheetSectionHeading,
  PageInfoSheet,
} from "@/components/common/PageInfoSheet";

interface ChaptersInfoModalProps {
  visible: boolean;
  onClose: () => void;
}

export function ChaptersInfoModal({ visible, onClose }: ChaptersInfoModalProps) {
  return (
    <PageInfoSheet
      visible={visible}
      onClose={onClose}
      title="How Chapters work"
    >
      <InfoSheetParagraph>
        Chapters has two sides: weekly stories and video montages.
      </InfoSheetParagraph>

      <InfoSheetSectionHeading>Weekly chapters</InfoSheetSectionHeading>
      <InfoSheetParagraph>
        When you capture enough moments in a week, we write a chapter — a short
        narrative stitched from what you saved. Open any chapter in list or feed
        view to read the full story, browse the photos, and share it.
      </InfoSheetParagraph>

      <InfoSheetSectionHeading>Video montages</InfoSheetSectionHeading>
      <InfoSheetParagraph last>
        The grid shows auto-playing previews of your weeks, months, and years —
        short looping clips from your photos, Live Photos, and videos. Tap a
        card to watch the full montage and share it.
      </InfoSheetParagraph>
    </PageInfoSheet>
  );
}
