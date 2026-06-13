import { MashupCard } from "@/components/chapters/MashupCard";
import { useTheme } from "@/hooks/useTheme";
import type { MashupBucket } from "@/lib/mashupBuckets";
import { Text, useWindowDimensions, View } from "react-native";

const GUTTER = 20;

export function CaptureMonthWipSection({
  bucket,
  onOpen,
}: {
  bucket: MashupBucket;
  onOpen: (bucket: MashupBucket) => void;
}) {
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = screenWidth - GUTTER * 2;
  const cardHeight = Math.round(cardWidth * 1.15);

  return (
    <View style={{ marginTop: 28, paddingHorizontal: GUTTER }}>
      <Text
        style={{
          fontFamily: "PMGothicLudington-Text110",
          fontSize: 28,
          lineHeight: 32,
          color: colors.text,
          marginBottom: 12,
        }}
      >
        This month&apos;s WIP movie
      </Text>
      <MashupCard
        bucket={bucket}
        width={cardWidth}
        height={cardHeight}
        isActive
        onPress={onOpen}
      />
    </View>
  );
}
