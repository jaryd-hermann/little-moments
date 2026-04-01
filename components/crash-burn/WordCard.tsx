import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const CARD_CREAM = "#FFFFEB";

interface WordCardProps {
  word: string;
  onShuffle: () => void;
}

export function WordCard({ word, onShuffle }: WordCardProps) {
  return (
    <View
      style={{
        backgroundColor: CARD_CREAM,
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
          backgroundColor: "rgba(0, 0, 0, 0.08)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons
          name="shuffle"
          size={20}
          color="#1A1A1A"
        />
      </Pressable>
    </View>
  );
}
