import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { usePostHog } from "posthog-react-native";

const WORDMARK_PREMIUM = require("@/assets/images/wordmark-premium.png");

type PremiumInlineCardProps = {
  analyticsSource: string;
  style?: StyleProp<ViewStyle>;
};

export function PremiumInlineCard({ analyticsSource, style }: PremiumInlineCardProps) {
  const posthog = usePostHog();
  return (
    <Pressable
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
        posthog.capture("premium_card_tapped", { source: analyticsSource });
        router.push("/paywall");
      }}
      style={style}
    >
      <View
        style={{
          backgroundColor: "#202020",
          borderRadius: 14,
          borderWidth: 2,
          borderColor: "#FECFB4",
          paddingHorizontal: 24,
          paddingVertical: 24,
        }}
      >
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
      </View>
    </Pressable>
  );
}
