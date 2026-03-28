import { useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  Dimensions,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { OnboardingSlide } from "@/components/onboarding/OnboardingSlide";
import { ONBOARDING_SLIDES } from "@/constants/onboardingSlides";
import { useTheme } from "@/hooks/useTheme";

const { width } = Dimensions.get("window");

export default function OnboardingScreen() {
  const { colors, theme } = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const isLast = activeIndex === ONBOARDING_SLIDES.length - 1;

  const goNext = () => {
    if (isLast) {
      router.replace("/(auth)/trial");
    } else {
      flatListRef.current?.scrollToIndex({
        index: activeIndex + 1,
        animated: true,
      });
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        ref={flatListRef}
        data={ONBOARDING_SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <OnboardingSlide
            emoji={item.emoji}
            title={item.title}
            body={item.body}
          />
        )}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(
            e.nativeEvent.contentOffset.x / width
          );
          setActiveIndex(index);
        }}
      />

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
                i === activeIndex
                  ? colors.text
                  : colors.border,
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
          paddingBottom: 24,
          paddingTop: 16,
        }}
      >
        <Pressable
          onPress={() => router.replace("/(auth)/trial")}
        >
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 15,
              color: colors.textMuted,
            }}
          >
            Skip
          </Text>
        </Pressable>

        <Pressable
          onPress={goNext}
          style={{
            borderRadius: 9999,
            backgroundColor: theme === "dark" ? "#FFFFFF" : "#1A1A1A",
            paddingHorizontal: 32,
            paddingVertical: 12,
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 15,
              color: theme === "dark" ? "#000000" : "#FFFFFF",
              letterSpacing: 0.5,
              textTransform: "uppercase",
            }}
          >
            {isLast ? "LET'S GO" : "NEXT"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
