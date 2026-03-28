import { View, Text, Dimensions } from "react-native";

const { width } = Dimensions.get("window");

interface OnboardingSlideProps {
  emoji: string;
  title: string;
  body: string;
}

export function OnboardingSlide({
  emoji,
  title,
  body,
}: OnboardingSlideProps) {
  return (
    <View
      className="flex-1 items-center justify-center px-8"
      style={{ width }}
    >
      <Text style={{ fontSize: 72 }}>{emoji}</Text>
      <Text
        style={{
          fontFamily: "LibreBaskerville-Bold",
          fontSize: 24,
          color: "#FFFFFF",
          textAlign: "center",
          marginTop: 32,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontFamily: "Roboto-Light",
          fontSize: 15,
          color: "rgba(255, 255, 255, 0.6)",
          textAlign: "center",
          marginTop: 16,
          lineHeight: 24,
        }}
      >
        {body}
      </Text>
    </View>
  );
}
