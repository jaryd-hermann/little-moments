import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { formatMagicFillDate, formatMagicFillDateShort } from "@/lib/magicFill";
import { MAGIC_FILL_DATE_PILL } from "@/lib/magicFillTypography";

type MagicFillDatePillProps = {
  date: Date;
  short?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function MagicFillDatePill({
  date,
  short = false,
  style,
}: MagicFillDatePillProps) {
  const label = short ? formatMagicFillDateShort(date) : formatMagicFillDate(date);

  return (
    <View
      pointerEvents="none"
      style={[
        {
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 9999,
          ...MAGIC_FILL_DATE_PILL,
        },
        style,
      ]}
    >
      <Text
        style={{
          fontFamily: "Roboto-Medium",
          fontSize: 12,
          color: "#1A1A1A",
        }}
      >
        {label}
      </Text>
    </View>
  );
}
