import { useCallback } from "react";
import { Stack, useFocusEffect } from "expo-router";
import { useTabBarStore } from "@/store/tabBarStore";

export default function MagicFillLayout() {
  const setTabBarHidden = useTabBarStore((s) => s.setTabBarHidden);

  useFocusEffect(
    useCallback(() => {
      setTabBarHidden(true);
      return () => setTabBarHidden(false);
    }, [setTabBarHidden])
  );

  return (
    <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="searching" options={{ animation: "fade" }} />
      <Stack.Screen name="review" />
      <Stack.Screen name="caption-mode" />
      <Stack.Screen name="caption-text" />
      <Stack.Screen name="caption-voice" />
      <Stack.Screen name="processing" options={{ animation: "fade" }} />
      <Stack.Screen name="preview" />
      <Stack.Screen name="success" options={{ animation: "fade" }} />
    </Stack>
  );
}
