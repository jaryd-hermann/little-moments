import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SPLASH_SLIDE_IMAGES } from "@/constants/splashSlides";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/store/authStore";
import type { Profile } from "@/store/authStore";
import { routeAfterAuth } from "@/lib/onboardingRoute";

const AUTO_ADVANCE_MS = 5000;

export default function SplashScreen() {
  const setProfile = useAuthStore((s) => s.setProfile);
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [slideIndex, setSlideIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const indexRef = useRef(0);
  const widthRef = useRef(width);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  useEffect(() => {
    indexRef.current = slideIndex;
  }, [slideIndex]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single()
          .then(({ data: profile }) => {
            const p = profile as Profile | null;
            if (p) setProfile(p);
            routeAfterAuth(p);
          });
      }
    });
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const next = (indexRef.current + 1) % SPLASH_SLIDE_IMAGES.length;
      indexRef.current = next;
      setSlideIndex(next);
      flatListRef.current?.scrollToOffset({
        offset: next * widthRef.current,
        animated: true,
      });
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(id);
  }, []);

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const w = widthRef.current;
      const i = Math.round(x / w);
      if (i >= 0 && i < SPLASH_SLIDE_IMAGES.length) {
        indexRef.current = i;
        setSlideIndex(i);
      }
    },
    []
  );

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: width,
      offset: width * index,
      index,
    }),
    [width]
  );

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <FlatList
        ref={flatListRef}
        style={{ flex: 1 }}
        data={SPLASH_SLIDE_IMAGES}
        keyExtractor={(_, i) => `splash-${i}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        decelerationRate="fast"
        getItemLayout={getItemLayout}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onScrollToIndexFailed={({ index }) => {
          setTimeout(() => {
            flatListRef.current?.scrollToIndex({
              index,
              animated: true,
            });
          }, 100);
        }}
        renderItem={({ item }) => (
          <View style={{ width, height }}>
            <Image
              source={item}
              style={{ width, height }}
              contentFit="cover"
              transition={200}
            />
          </View>
        )}
      />

      <View
        pointerEvents="box-none"
        style={[StyleSheet.absoluteFill, { zIndex: 1 }]}
      >
        <LinearGradient
          pointerEvents="none"
          colors={["transparent", "rgba(0,0,0,0.65)"]}
          locations={[0.35, 1]}
          style={styles.bottomGradient}
        />

        <View
          pointerEvents="box-none"
          style={[
            styles.bottomChrome,
            { paddingBottom: insets.bottom + 10, bottom: 32 },
          ]}
        >
          <View style={styles.dots}>
            {SPLASH_SLIDE_IMAGES.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === slideIndex ? styles.dotActive : styles.dotInactive,
                ]}
              />
            ))}
          </View>

          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.replace("/(auth)/sign-in");
            }}
            style={{
              marginHorizontal: 24,
              marginTop: 12,
              height: 52,
              borderRadius: 9999,
              backgroundColor: colors.primary,
              borderWidth: 2,
              borderColor: "#FFFFFF",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                color: "#1A1A1A",
                letterSpacing: 0.8,
                textTransform: "uppercase",
              }}
            >
              GET STARTED
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  bottomGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 220,
  },
  bottomChrome: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 22,
    backgroundColor: "#FFFFFF",
  },
  dotInactive: {
    width: 6,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
});
