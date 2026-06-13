import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Pressable, Text, View } from "react-native";
import type { Colors } from "@/constants/Colors";

const WORDMARK_PREMIUM = require("@/assets/images/wordmark-premium.png");

type ThemePalette = (typeof Colors)["light"];

export function MembershipCard({
  colors,
  subscriptionStatus,
  createdAt,
  onManage,
  onExplore,
}: {
  colors: ThemePalette;
  subscriptionStatus: string;
  createdAt: string | null;
  canManageSubscription?: boolean;
  onManage: () => void | Promise<void>;
  onExplore: () => void;
}) {
  const sinceDate = createdAt
    ? new Date(createdAt).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : null;

  const isPremium =
    subscriptionStatus === "active" || subscriptionStatus === "cancelled";
  const isFree =
    subscriptionStatus === "free" || subscriptionStatus === "trial";

  const handlePress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
    if (isFree) {
      onExplore();
    } else {
      void onManage();
    }
  };

  if (isPremium) {
    const premiumSublabel =
      subscriptionStatus === "active"
        ? "You have full access"
        : "Access until the end of your billing period";
    return (
      <View
        style={{
          marginTop: 16,
          backgroundColor: "#202020",
          borderRadius: 14,
          borderWidth: 2,
          borderColor: "#FECFB4",
          paddingHorizontal: 24,
          paddingVertical: 24,
        }}
      >
        <Pressable onPress={handlePress}>
          <Image
            source={WORDMARK_PREMIUM}
            style={{ height: 36, width: "100%", alignSelf: "center" }}
            contentFit="contain"
          />
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 14,
              color: "#FFFFFF",
              textAlign: "center",
              marginTop: 18,
            }}
          >
            {premiumSublabel}
          </Text>
          {sinceDate ? (
            <Text
              style={{
                fontFamily: "Roboto-Light",
                fontSize: 13,
                color: "rgba(255,255,255,0.45)",
                textAlign: "center",
                marginTop: 14,
              }}
            >
              Premium member since {sinceDate}
            </Text>
          ) : null}
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={{
        marginTop: 16,
        backgroundColor: "#202020",
        borderRadius: 14,
        borderWidth: 2,
        borderColor: "#FECFB4",
        paddingHorizontal: 24,
        paddingVertical: 24,
      }}
    >
      <Pressable onPress={handlePress}>
        <Image
          source={WORDMARK_PREMIUM}
          style={{ height: 36, width: "100%", alignSelf: "center" }}
          contentFit="contain"
        />
        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 14,
            color: "#FFFFFF",
            textAlign: "center",
            marginTop: 18,
          }}
        >
          See if becoming a Premium member is right for you
        </Text>
        {sinceDate ? (
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 13,
              color: "rgba(255,255,255,0.45)",
              textAlign: "center",
              marginTop: 14,
            }}
          >
            Free member since {sinceDate}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}
