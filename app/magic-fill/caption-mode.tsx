import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { usePostHog } from "posthog-react-native";
import { useTheme } from "@/hooks/useTheme";
import { useSettingsStore } from "@/store/settingsStore";
import { useMagicFillStore } from "@/store/magicFillStore";
import { MagicFillScreenHeader } from "@/components/magic-fill/MagicFillScreenHeader";
import { MagicFillPrimaryButton } from "@/components/magic-fill/MagicFillPrimaryButton";
import { magicFillHeadlineStyle } from "@/lib/magicFillTypography";

type CaptionModeChoice = "text" | "voice";

function ModeCard({
  mode,
  title,
  description,
  icon,
  tag,
  selected,
  onSelect,
}: {
  mode: CaptionModeChoice;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  tag?: string;
  selected: boolean;
  onSelect: (mode: CaptionModeChoice) => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={() => {
        void Haptics.selectionAsync();
        onSelect(mode);
      }}
      style={{
        borderRadius: 20,
        borderWidth: 2,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.surface : colors.surface,
        padding: 20,
        marginBottom: 14,
        opacity: selected ? 1 : 0.88,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          backgroundColor: colors.surfaceSecondary,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 12,
        }}
      >
        <Ionicons name={icon} size={20} color={colors.text} />
      </View>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Text
          style={magicFillHeadlineStyle({ fontSize: 26, lineHeight: 30, color: colors.text })}
        >
          {title}
        </Text>
        {tag ? (
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 9999,
              backgroundColor: colors.primary,
              borderWidth: 1.5,
              borderColor: "#000000",
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 11,
                letterSpacing: 0.8,
                textTransform: "uppercase",
                color: "#1A1A1A",
              }}
            >
              {tag}
            </Text>
          </View>
        ) : null}
      </View>
      <Text
        style={{
          fontFamily: "Roboto-Regular",
          fontSize: 14,
          lineHeight: 20,
          color: colors.textSecondary,
          marginTop: 8,
        }}
      >
        {description}
      </Text>
    </Pressable>
  );
}

export default function MagicFillCaptionModeScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  const drafts = useMagicFillStore((s) => s.drafts);
  const activeDrafts = useMemo(
    () => drafts.filter((d) => !d.skipped),
    [drafts]
  );
  const setCaptionMode = useMagicFillStore((s) => s.setCaptionMode);
  const setTextCaptionIndex = useMagicFillStore((s) => s.setTextCaptionIndex);
  const setVoiceCaptionIndex = useMagicFillStore((s) => s.setVoiceCaptionIndex);
  const preferredMode = useSettingsStore((s) => s.magicFillPreferredCaptionMode);
  const setPreferredMode = useSettingsStore(
    (s) => s.setMagicFillPreferredCaptionMode
  );

  const [selected, setSelected] = useState<CaptionModeChoice>(
    preferredMode ?? "voice"
  );

  const count = activeDrafts.length;

  const handleContinue = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    posthog.capture("magic_fill_caption_mode_selected", { mode: selected, count });
    setCaptionMode(selected);
    setPreferredMode(selected);
    setTextCaptionIndex(0);
    setVoiceCaptionIndex(0);
    router.push(
      selected === "text"
        ? "/magic-fill/caption-text"
        : "/magic-fill/caption-voice"
    );
  };

  const continueLabel =
    selected === "voice" ? "Continue with voice" : "Continue with typing";

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <MagicFillScreenHeader />
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 20,
          paddingTop: 4,
          paddingBottom: Math.max(insets.bottom, 24) + 72,
        }}
      >
        <Text
          style={magicFillHeadlineStyle({
            fontSize: 28,
            lineHeight: 34,
            color: colors.text,
            marginBottom: 8,
          })}
        >
          How do you want to caption {count} moments?
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 15,
            lineHeight: 22,
            color: colors.textSecondary,
            marginBottom: 24,
          }}
        >
          Either way, we'll polish them into little stories after.
        </Text>

        <ModeCard
          mode="voice"
          title="Speak them all"
          tag="Fastest"
          description="Record once and keep talking as you flip through. We split it per day automatically."
          icon="mic"
          selected={selected === "voice"}
          onSelect={setSelected}
        />
        <ModeCard
          mode="text"
          title="Type each one"
          description="A quick line per day, swiping through. Tidy and fast."
          icon="keypad-outline"
          selected={selected === "text"}
          onSelect={setSelected}
        />
      </ScrollView>

      <View
        style={{
          position: "absolute",
          left: 20,
          right: 20,
          bottom: Math.max(insets.bottom, 16),
        }}
      >
        <MagicFillPrimaryButton
          label={continueLabel}
          variant="pink"
          onPress={handleContinue}
        />
      </View>
    </View>
  );
}
