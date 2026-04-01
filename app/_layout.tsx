import "react-native-url-polyfill/auto";
import "../global.css";
import { useEffect, useCallback } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { PostHogProvider, PostHogSurveyProvider, usePostHog } from "posthog-react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme, InteractionManager } from "react-native";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import { useSettingsStore } from "@/store/settingsStore";
import { configureRevenueCat, identifyUser } from "@/lib/revenuecat";
import { useChapterNotifStore } from "@/store/chapterNotifStore";

SplashScreen.preventAutoHideAsync();

function AppInner() {
  const setSession = useAuthStore((s) => s.setSession);
  const setUser = useAuthStore((s) => s.setUser);
  const user = useAuthStore((s) => s.user);
  const setIsLoading = useAuthStore((s) => s.setIsLoading);
  const theme = useSettingsStore((s) => s.theme);
  const systemColorScheme = useColorScheme();
  const effectiveTheme = theme ?? systemColorScheme ?? "dark";
  const posthog = usePostHog();

  const [fontsLoaded] = useFonts({
    "LibreBaskerville-Regular": require("@/assets/fonts/Libre_Baskerville/LibreBaskerville-Regular.ttf"),
    "LibreBaskerville-Bold": require("@/assets/fonts/Libre_Baskerville/LibreBaskerville-Bold.ttf"),
    "LibreBaskerville-Italic": require("@/assets/fonts/Libre_Baskerville/LibreBaskerville-Italic.ttf"),
    "Roboto-Light": require("@/assets/fonts/Roboto/static/Roboto-Light.ttf"),
    "Roboto-Regular": require("@/assets/fonts/Roboto/static/Roboto-Regular.ttf"),
    "Roboto-Medium": require("@/assets/fonts/Roboto/static/Roboto-Medium.ttf"),
    "Roboto-Bold": require("@/assets/fonts/Roboto/static/Roboto-Bold.ttf"),
  });

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      configureRevenueCat();
    });
    return () => task.cancel();
  }, []);

  useEffect(() => {
    if (!posthog) return;
    if (user?.id) {
      posthog.identify(user.id, { email: user.email });
    } else {
      posthog.reset();
    }
  }, [user?.id, posthog]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as
          | { type?: string; chapterId?: string }
          | undefined;
        if (data?.type === "chapter" && data.chapterId) {
          useChapterNotifStore.getState().setPendingChapterId(data.chapterId);
        }
      }
    );
    return () => sub.remove();
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
      if (session?.user?.id) {
        identifyUser(session.user.id);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user?.id) {
        identifyUser(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="splash" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="composer/index"
          options={{ presentation: "modal" }}
        />
        <Stack.Screen
          name="dig-deeper/index"
          options={{ presentation: "modal" }}
        />
        <Stack.Screen name="entry/[id]" />
        <Stack.Screen
          name="settings/index"
          options={{ presentation: "modal" }}
        />
        <Stack.Screen
          name="paywall/index"
          options={{ presentation: "modal" }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <PostHogProvider
      apiKey={process.env.EXPO_PUBLIC_POSTHOG_API_KEY!}
      options={{
        host: "https://us.i.posthog.com",
      }}
    >
      <PostHogSurveyProvider>
        <AppInner />
      </PostHogSurveyProvider>
    </PostHogProvider>
  );
}
