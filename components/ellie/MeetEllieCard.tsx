import { View, Text, Image } from "react-native";

const APP_ICON = require("@/assets/images/white-icon.png");

export function MeetEllieCard() {
  return (
    <View
      style={{
        marginBottom: 16,
        borderRadius: 16,
        backgroundColor: "#024F46",
        padding: 20,
        alignItems: "center",
        gap: 10,
      }}
    >
      <Image
        source={APP_ICON}
        style={{ width: 48, height: 48, borderRadius: 12 }}
      />
      <Text
        style={{
          fontFamily: "LibreBaskerville-Bold",
          fontSize: 18,
          color: "#FFFFFF",
          textAlign: "center",
        }}
      >
        Meet Ellie
      </Text>
      <Text
        style={{
          fontFamily: "Roboto-Light",
          fontSize: 14,
          lineHeight: 20,
          color: "rgba(255,255,255,0.7)",
          textAlign: "center",
        }}
      >
        Your memory guide. She'll help you capture moments in just 2 minutes.{"\n\n"}Over time, she'll connect your moments together and share threads with you.
      </Text>
    </View>
  );
}
