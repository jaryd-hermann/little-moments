import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { usePostHog } from "posthog-react-native";
import { useTheme } from "@/hooks/useTheme";
import { launchMagicFill } from "@/lib/magicFillLaunch";

/** Magic Fill's signature peach, shared with anything that offers the flow. */
export const MAGIC_FILL_PILL_FILL = "#FECFB4";
export const MAGIC_FILL_PILL_INK = "#1A1A1A";

type MagicFillPillProps = {
  style?: StyleProp<ViewStyle>;
};

export function MagicFillPill({ style }: MagicFillPillProps) {
  const { colors } = useTheme();
  const posthog = usePostHog();

  const handlePress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    posthog?.capture("magic_fill_entry_tapped", { source: "capsule_header" });
    launchMagicFill("capsule_header");
  };

  return (
    <View
      style={[
        {
          borderRadius: 9999,
          backgroundColor: MAGIC_FILL_PILL_FILL,
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 1,
          shadowRadius: 0,
          elevation: 4,
        },
        style,
      ]}
    >
      <Pressable
        accessibilityLabel="Magic fill"
        onPress={handlePress}
        hitSlop={8}
        style={{
          height: 36,
          paddingHorizontal: 14,
          borderRadius: 9999,
          backgroundColor: MAGIC_FILL_PILL_FILL,
          borderWidth: 2,
          borderColor: "#000000",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          flexDirection: "row",
          gap: 6,
        }}
      >
        <Text style={{ fontSize: 12, color: MAGIC_FILL_PILL_INK }}>✦</Text>
        <Text
          style={{
            fontFamily: "Roboto-Medium",
            fontSize: 12,
            color: MAGIC_FILL_PILL_INK,
            letterSpacing: 0.6,
            textTransform: "uppercase",
          }}
        >
          Magic fill
        </Text>
      </Pressable>
    </View>
  );
}
