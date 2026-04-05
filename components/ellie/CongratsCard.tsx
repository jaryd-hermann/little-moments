import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface CongratsCardProps {
  headline: string;
  totalMoments: number;
  streakCount: number;
  badge?: { label: string; icon: string };
}

const CARD_BG = "#024F46";

export function CongratsCard({
  headline,
  totalMoments,
  streakCount,
  badge,
}: CongratsCardProps) {
  return (
    <View
      style={{
        marginBottom: 16,
        borderRadius: 16,
        backgroundColor: CARD_BG,
        padding: 20,
        gap: 16,
      }}
    >
      <Text
        style={{
          fontFamily: "LibreBaskerville-Bold",
          fontSize: 18,
          color: "#FFFFFF",
          textAlign: "center",
        }}
      >
        {headline}
      </Text>

      <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
        <View style={{ alignItems: "center" }}>
          <Text
            style={{
              fontFamily: "LibreBaskerville-Bold",
              fontSize: 28,
              color: "#FFFFFF",
            }}
          >
            {totalMoments}
          </Text>
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 12,
              color: "rgba(255,255,255,0.7)",
              marginTop: 2,
            }}
          >
            moments
          </Text>
        </View>
        <View style={{ alignItems: "center" }}>
          <Text
            style={{
              fontFamily: "LibreBaskerville-Bold",
              fontSize: 28,
              color: "#FFFFFF",
            }}
          >
            {streakCount}
          </Text>
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 12,
              color: "rgba(255,255,255,0.7)",
              marginTop: 2,
            }}
          >
            day streak
          </Text>
        </View>
      </View>

      {badge && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingTop: 8,
            borderTopWidth: 1,
            borderTopColor: "rgba(255,255,255,0.15)",
          }}
        >
          <Ionicons
            name={badge.icon as keyof typeof Ionicons.glyphMap}
            size={20}
            color="#F0D7FF"
          />
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 14,
              color: "#F0D7FF",
            }}
          >
            {badge.label}
          </Text>
        </View>
      )}
    </View>
  );
}
