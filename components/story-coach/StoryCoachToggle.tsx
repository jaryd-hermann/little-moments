import { useState } from "react";
import { View, Text, Pressable, Image } from "react-native";
import * as Haptics from "expo-haptics";

const BG = "#FFFFFF";
const INK = "#000000";
const SUBTEXT = "rgba(0, 0, 0, 0.58)";
const CREAM = "#FFFFEB";
const MEET_GREY = "#8a8a80";
const CTA_VIOLET = "#f0d7ff";

const APP_ICON = require("@/assets/images/icon.png");

interface StoryCoachToggleProps {
  defaultEnabled: boolean;
  personalizedNote?: string | null;
  onSelect: (enabled: boolean) => void;
  ctaLabel?: string;
  ctaLoading?: boolean;
}

export function StoryCoachToggle({
  defaultEnabled,
  personalizedNote,
  onSelect,
  ctaLabel = "Next",
  ctaLoading = false,
}: StoryCoachToggleProps) {
  const [enabled, setEnabled] = useState(defaultEnabled);

  const handleSelect = (val: boolean) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEnabled(val);
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 32 }}>
        <View style={{ alignItems: "center", marginBottom: 16 }}>
          <Image
            source={APP_ICON}
            style={{ width: 64, height: 64, borderRadius: 16 }}
            resizeMode="contain"
          />
        </View>
        <Text
          style={{
            fontFamily: "LibreBaskerville-Bold",
            fontSize: 28,
            color: INK,
            textAlign: "center",
          }}
        >
          <Text style={{ color: MEET_GREY }}>Meet </Text>
          Ellie
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 15,
            color: SUBTEXT,
            textAlign: "center",
            marginTop: 10,
            lineHeight: 22,
          }}
        >
          Your personal story coach
          {personalizedNote ? `. ${personalizedNote}` : ""}
        </Text>

        <View style={{ marginTop: 28, gap: 16 }}>
          <OptionCard
            selected={enabled}
            title="Enable Story Coach"
            description="After each moment, Ellie will review your story structure, pacing, and details — and give you friendly, actionable coaching to help you grow."
            onPress={() => handleSelect(true)}
          />
          <OptionCard
            selected={!enabled}
            title="Not right now"
            description="You can always enable Story Coach later in Settings."
            onPress={() => handleSelect(false)}
          />
        </View>
      </View>

      <View style={{ paddingHorizontal: 24, paddingBottom: 32 }}>
        <Pressable
          onPress={() => onSelect(enabled)}
          disabled={ctaLoading}
          style={{
            height: 52,
            borderRadius: 9999,
            backgroundColor: CTA_VIOLET,
            borderWidth: 2,
            borderColor: INK,
            alignItems: "center",
            justifyContent: "center",
            opacity: ctaLoading ? 0.6 : 1,
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 15,
              color: INK,
            }}
          >
            {ctaLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function RadioDot({ selected }: { selected: boolean }) {
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: selected ? INK : "rgba(0, 0, 0, 0.2)",
        backgroundColor: BG,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {selected && (
        <View
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: INK,
          }}
        />
      )}
    </View>
  );
}

function OptionCard({
  selected,
  title,
  description,
  onPress,
}: {
  selected: boolean;
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: 14,
        borderWidth: 2,
        borderColor: selected ? INK : "rgba(0, 0, 0, 0.12)",
        backgroundColor: selected ? CREAM : BG,
        paddingHorizontal: 20,
        paddingVertical: 18,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text
          style={{
            fontFamily: "Roboto-Medium",
            fontSize: 16,
            color: INK,
          }}
        >
          {title}
        </Text>
        <RadioDot selected={selected} />
      </View>
      <Text
        style={{
          fontFamily: "Roboto-Light",
          fontSize: 14,
          color: SUBTEXT,
          lineHeight: 20,
          marginTop: 8,
        }}
      >
        {description}
      </Text>
    </Pressable>
  );
}
