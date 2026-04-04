import { View, Text } from "react-native";

const CARD_CREAM = "#FFFFEB";

interface WordCardProps {
  word: string;
}

export function WordCard({ word }: WordCardProps) {
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
    </View>
  );
}
