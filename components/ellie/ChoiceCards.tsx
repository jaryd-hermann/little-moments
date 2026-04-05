import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";

interface Choice {
  id: string;
  label: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
}

interface ChoiceCardsProps {
  choices: Choice[];
  onSelect: (id: string) => void;
}

export function ChoiceCards({ choices, onSelect }: ChoiceCardsProps) {
  const { colors } = useTheme();

  return (
    <View style={{ gap: 10, marginBottom: 16 }}>
      {choices.map((choice) => (
        <Pressable
          key={choice.id}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onSelect(choice.id);
          }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            borderRadius: 14,
            borderWidth: 1.5,
            borderColor: colors.primary,
            paddingVertical: 14,
            paddingHorizontal: 16,
            gap: 12,
          }}
        >
          <Ionicons name={choice.icon} size={20} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                color: colors.text,
              }}
            >
              {choice.label}
            </Text>
            {choice.subtitle && (
              <Text
                style={{
                  fontFamily: "Roboto-Regular",
                  fontSize: 12,
                  color: colors.textMuted,
                  marginTop: 2,
                }}
              >
                {choice.subtitle}
              </Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}
