import { Pressable, Text } from "react-native";
import { useTheme } from "@/hooks/useTheme";

type CaptureInfoButtonProps = {
  onPress: () => void;
  accessibilityLabel?: string;
};

/** Circular bordered “i” — matches Capture section headings. */
export function CaptureInfoButton({
  onPress,
  accessibilityLabel = "More information",
}: CaptureInfoButtonProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={10}
      style={{
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: colors.text,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          fontFamily: "Roboto-Medium",
          fontSize: 14,
          color: colors.text,
          marginTop: -1,
        }}
      >
        i
      </Text>
    </Pressable>
  );
}
