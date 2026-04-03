import { View, Text, Pressable, Image } from "react-native";
import { useTheme } from "@/hooks/useTheme";

const APP_ICON = require("@/assets/images/white-icon.png");

interface StoryCoachCardProps {
  hasExistingSession: boolean;
  onPress: () => void;
}

export function StoryCoachCard({
  hasExistingSession,
  onPress,
}: StoryCoachCardProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: "#FFA946",
        backgroundColor: colors.surface,
        padding: 20,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: "LibreBaskerville-Regular",
            fontSize: 15,
            color: colors.text,
          }}
        >
          {hasExistingSession
            ? "Continue your session with Ellie"
            : "Get feedback from Ellie"}
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 13,
            color: colors.textSecondary,
            marginTop: 6,
            lineHeight: 19,
          }}
        >
          {hasExistingSession
            ? "Pick up where you left off"
            : "Story coaching on structure, pacing & detail"}
        </Text>
      </View>
      <View style={{ marginLeft: 12 }}>
        <Image
          source={APP_ICON}
          style={{ width: 32, height: 32, borderRadius: 8 }}
          resizeMode="contain"
        />
      </View>
    </Pressable>
  );
}
