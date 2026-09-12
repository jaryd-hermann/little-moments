import { CaptureSectionHeading } from "@/components/capture/CaptureSectionHeading";
import { MashupCard } from "@/components/chapters/MashupCard";
import { MovieProgressPlaceholder } from "@/components/chapters/MovieProgressPlaceholder";
import type { MashupBucket, MovieProgress } from "@/lib/mashupBuckets";
import { useWindowDimensions, View } from "react-native";

const GUTTER = 20;

const HEADING_DESCRIPTION =
  "We add the snippets together for you and turn them into live movies of your life across periods. Try share it!";

export function CaptureMonthWipSection({
  bucket,
  onOpen,
}: {
  bucket: MashupBucket;
  onOpen: (bucket: MashupBucket) => void;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = screenWidth - GUTTER * 2;
  const cardHeight = Math.round(cardWidth * 1.15);

  return (
    <View style={{ marginTop: 28, paddingHorizontal: GUTTER }}>
      <CaptureSectionHeading
        title="This month's WIP movie"
        description={HEADING_DESCRIPTION}
        gutter={0}
        style={{ marginBottom: 12 }}
      />
      <MashupCard
        bucket={bucket}
        width={cardWidth}
        height={cardHeight}
        onPress={onOpen}
      />
    </View>
  );
}

/**
 * Stand-in for the current month's movie while it's still short of moments.
 * Shown only for the current month — a past month can't be topped up, so the
 * nudge would be a dead end there.
 */
export function CaptureMonthWipPlaceholder({
  progress,
}: {
  progress: MovieProgress;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = screenWidth - GUTTER * 2;

  return (
    <View style={{ marginTop: 28, paddingHorizontal: GUTTER }}>
      <CaptureSectionHeading
        title="This month's WIP movie"
        description={HEADING_DESCRIPTION}
        gutter={0}
        style={{ marginBottom: 12 }}
      />
      <MovieProgressPlaceholder progress={progress} width={cardWidth} />
    </View>
  );
}
