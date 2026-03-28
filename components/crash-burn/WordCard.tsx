import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";

interface WordCardProps {
  word: string;
  onShuffle: () => void;
}

export function WordCard({ word, onShuffle }: WordCardProps) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.primary,
        borderRadius: 16,
        borderWidth: 2,
        borderColor: "#1A1A1A",
        minHeight: 120,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 24,
        position: "relative",
      }}
    >
      <Text
        style={{
          fontFamily: "LibreBaskerville-Bold",
          fontSize: 40,
          color: "#1A1A1A",
        }}
      >
        {word}
      </Text>
      <Pressable
        onPress={onShuffle}
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: colors.surfaceSecondary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons
          name="shuffle"
          size={20}
          color={colors.textSecondary}
        />
      </Pressable>
    </View>
  );
}
