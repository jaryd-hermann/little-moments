import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { MAGIC_FILL_DATE_PILL } from "@/lib/magicFillTypography";

type CaptureDatePillProps = {
  label: string;
  style?: StyleProp<ViewStyle>;
  /** Slightly smaller text for secondary tags (e.g. time). */
  compact?: boolean;
};

/** Gold fill + black stroke — matches Magic Fill date pills. */
export function CaptureDatePill({
  label,
  style,
  compact = false,
}: CaptureDatePillProps) {
  return (
    <View
      pointerEvents="none"
      style={[
        {
          paddingHorizontal: compact ? 10 : 12,
          paddingVertical: compact ? 4 : 6,
          borderRadius: 9999,
          alignSelf: "flex-start",
          ...MAGIC_FILL_DATE_PILL,
        },
        style,
      ]}
    >
      <Text
        style={{
          fontFamily: "Roboto-Medium",
          fontSize: compact ? 11 : 12,
          color: "#1A1A1A",
        }}
      >
        {label}
      </Text>
    </View>
  );
}
