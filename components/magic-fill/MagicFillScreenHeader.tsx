import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";

type MagicFillScreenHeaderProps = {
  onBack?: () => void;
  rightSlot?: React.ReactNode;
};

/** Back-only header — no step title labels. */
export function MagicFillScreenHeader({
  onBack,
  rightSlot,
}: MagicFillScreenHeaderProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const handleBack = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onBack) {
      onBack();
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/today");
    }
  };

  return (
    <View
      style={{
        paddingTop: insets.top,
        paddingHorizontal: 12,
        paddingBottom: 0,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Pressable
        accessibilityLabel="Go back"
        onPress={handleBack}
        hitSlop={12}
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="arrow-back" size={22} color={colors.text} />
      </Pressable>
      <View style={{ flex: 1 }} />
      <View style={{ minWidth: 40, alignItems: "flex-end" }}>{rightSlot}</View>
    </View>
  );
}
