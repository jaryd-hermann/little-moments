import { useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { OnboardingSlide } from "@/components/onboarding/OnboardingSlide";
import { ONBOARDING_SLIDES } from "@/constants/onboardingSlides";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";

/** Footer controls sit on light artwork — use dark ink for dots + skip. */
const ONBOARD_DOT_ACTIVE = "#1A1A1A";
const ONBOARD_DOT_INACTIVE = "rgba(26, 26, 26, 0.28)";
const ONBOARD_SKIP = "rgba(26, 26, 26, 0.55)";

export default function OnboardingScreen() {
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const setProfile = useAuthStore((s) => s.setProfile);
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList<(typeof ONBOARDING_SLIDES)[number]>>(null);
  const isLast = activeIndex === ONBOARDING_SLIDES.length - 1;

  const slideWidth = winWidth;
  const slideHeight = winHeight;

  const goToDonation = async () => {
    if (!user) {
      router.replace("/(auth)/donation");
      return;
    }
    await supabase
      .from("profiles")
      .update({ onboarding_phase: "donation" })
      .eq("id", user.id);
    const { data: fresh } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    if (fresh) setProfile(fresh);
    router.replace("/(auth)/donation");
  };

  const onSkip = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
    void goToDonation();
  };

  const goNext = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
    if (isLast) {
      void goToDonation();
    } else {
      flatListRef.current?.scrollToIndex({
        index: activeIndex + 1,
        animated: true,
      });
    }
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const index = Math.round(x / slideWidth);
    setActiveIndex(Math.min(Math.max(0, index), ONBOARDING_SLIDES.length - 1));
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#FFFBF5" }}>
      <StatusBar style="dark" />

      <FlatList
        ref={flatListRef}
        style={{ flex: 1 }}
        data={ONBOARDING_SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id.toString()}
        onMomentumScrollEnd={onScrollEnd}
        onScrollToIndexFailed={({ index }) => {
          requestAnimationFrame(() => {
            flatListRef.current?.scrollToIndex({ index, animated: true });
          });
        }}
        getItemLayout={(_, index) => ({
          length: slideWidth,
          offset: slideWidth * index,
          index,
        })}
        renderItem={({ item }) => (
          <OnboardingSlide
            source={item.image}
            width={slideWidth}
            height={slideHeight}
          />
        )}
      />

      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingBottom: Math.max(insets.bottom, 12),
          paddingTop: 12,
          backgroundColor: "rgba(255, 250, 240, 0.92)",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingBottom: 8,
          }}
        >
          {ONBOARDING_SLIDES.map((_, i) => (
            <View
              key={i}
              style={{
                height: 8,
                borderRadius: 4,
                width: i === activeIndex ? 24 : 8,
                backgroundColor:
                  i === activeIndex ? ONBOARD_DOT_ACTIVE : ONBOARD_DOT_INACTIVE,
              }}
            />
          ))}
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 24,
            paddingTop: 8,
          }}
        >
          <Pressable onPress={onSkip} hitSlop={12}>
            <Text
              style={{
                fontFamily: "Roboto-Light",
                fontSize: 15,
                color: ONBOARD_SKIP,
              }}
            >
              Skip
            </Text>
          </Pressable>

          <Pressable
            onPress={goNext}
            style={{
              borderRadius: 9999,
              backgroundColor: colors.primary,
              borderWidth: 2,
              borderColor: "#000000",
              paddingHorizontal: 32,
              paddingVertical: 12,
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                color: "#000000",
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              {isLast ? "LET'S GO" : "NEXT"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
