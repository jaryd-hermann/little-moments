import { View } from "react-native";
import * as Haptics from "expo-haptics";
import { usePostHog } from "posthog-react-native";
import { launchMagicFill, type MagicFillEntrySource } from "@/lib/magicFillLaunch";
import { MagicFillPeachPillButton } from "./MagicFillPeachPillButton";

type MagicFillFeedButtonProps = {
  source: MagicFillEntrySource;
  /** Omit outer horizontal padding when nested inside a padded parent. */
  embedded?: boolean;
  /** Tighter spacing for inline feed placement. */
  compact?: boolean;
};

/** Compact Magic Fill CTA for Capsule list/grid feeds — pill only, no banner. */
export function MagicFillFeedButton({
  source,
  embedded = false,
  compact = false,
}: MagicFillFeedButtonProps) {
  const posthog = usePostHog();

  const handlePress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    posthog.capture("magic_fill_entry_tapped", { source });
    launchMagicFill(source);
  };

  return (
    <View
      style={{
        paddingHorizontal: embedded ? 0 : 20,
        paddingTop: compact ? 0 : 12,
        paddingBottom: compact ? 12 : 12,
      }}
    >
      <MagicFillPeachPillButton
        label="✦ Magic fill"
        onPress={handlePress}
        fullWidth
        size="large"
      />
    </View>
  );
}
