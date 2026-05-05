import "react-native-url-polyfill/auto";
import "../global.css";
import { useEffect, useCallback } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  PostHogErrorBoundary,
  PostHogProvider,
  PostHogSurveyProvider,
  usePostHog,
} from "posthog-react-native";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { InteractionManager, Text, View } from "react-native";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import * as Notifications from "expo-notifications";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useTheme } from "@/hooks/useTheme";
import { configureRevenueCat, identifyUser } from "@/lib/revenuecat";
import {
  addOneSignalClickListener,
  initOneSignal,
  syncOneSignalUser,
} from "@/lib/onesignal";
import { useChapterNotifStore } from "@/store/chapterNotifStore";
import { registerPostHogClient } from "@/lib/errors";

SplashScreen.preventAutoHideAsync();

function AppInner() {
  const setSession = useAuthStore((s) => s.setSession);
  const setUser = useAuthStore((s) => s.setUser);
  const user = useAuthStore((s) => s.user);
  const setIsLoading = useAuthStore((s) => s.setIsLoading);
  const { theme, colors } = useTheme();
  const posthog = usePostHog();

  // Keep the OS root background (visible briefly during navigation
  // transitions and modal presentations) in sync with the resolved theme.
  // Without this, switching to dark mode shows a flash of beige under the
  // app while routes hand off, and vice versa.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, [colors.background]);

  const [fontsLoaded] = useFonts({
    "LibreBaskerville-Regular": require("@/assets/fonts/Libre_Baskerville/LibreBaskerville-Regular.ttf"),
    "LibreBaskerville-Bold": require("@/assets/fonts/Libre_Baskerville/LibreBaskerville-Bold.ttf"),
    "LibreBaskerville-Italic": require("@/assets/fonts/Libre_Baskerville/LibreBaskerville-Italic.ttf"),
    "Roboto-Light": require("@/assets/fonts/Roboto/static/Roboto-Light.ttf"),
    "Roboto-Regular": require("@/assets/fonts/Roboto/static/Roboto-Regular.ttf"),
    "Roboto-Medium": require("@/assets/fonts/Roboto/static/Roboto-Medium.ttf"),
    "Roboto-Bold": require("@/assets/fonts/Roboto/static/Roboto-Bold.ttf"),
    // PMGothic Ludington — used by the top-left page titles on the four
    // tab screens + Settings (replaces the previous LibreBaskerville-Italic).
    "PMGothicLudington-Text110": require("@/assets/fonts/PMGothic/PMGothicLudington-Text110.ttf"),
  });

  useEffect(() => {
    initOneSignal();
  }, []);

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

  // Expose the PostHog instance to non-React modules (lib/*, store/*) so
  // they can call captureException without threading the instance through
  // every function. See lib/errors.ts for the read side.
  useEffect(() => {
    registerPostHogClient(posthog ?? null);
    return () => registerPostHogClient(null);
  }, [posthog]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as
          | { type?: string; chapterId?: string }
          | undefined;
        if (data?.type === "chapter" && data.chapterId) {
          useChapterNotifStore.getState().setPendingChapterId(data.chapterId);
          // Land the user on the Chapters tab; the screen consumes the
          // pending id and opens the matching chapter.
          InteractionManager.runAfterInteractions(() => {
            router.replace("/(tabs)/chapters");
          });
        }
        if (data?.type === "thread") {
          // Land on the Connect / Threads flipbook so the user sees the
          // shimmering unseen card and chooses to open it themselves —
          // matches the "always go through the inbox" pattern we use for
          // chapters above. The newest thread (the one this notification
          // points at) is the first card in the flipbook.
          InteractionManager.runAfterInteractions(() => {
            router.replace("/(tabs)/brain?tab=ellie");
          });
        }
      }
    );
    return () => sub.remove();
  }, []);

  // OneSignal-delivered pushes — daily nudge, weekly chapter intro,
  // chapter/thread surfaced, first-pin celebration, on-this-day, streak
  // milestones, premium pitches, share-ack, win-back. `expo-notifications`
  // doesn't see these; everything routes here via `additionalData.type`.
  useEffect(() => {
    const unsubscribe = addOneSignalClickListener((event) => {
      const data = event.notification.additionalData as
        | {
            type?: string;
            chapter_id?: string;
            thread_id?: string;
            entry_id?: string;
          }
        | undefined;
      if (!data?.type) return;

      const go = (path: string) => {
        InteractionManager.runAfterInteractions(() => {
          router.replace(path);
        });
      };

      switch (data.type) {
        // Habit / activation pushes — all land on the capture screen.
        case "daily_nudge":
        case "weekly_chapter_intro":
        case "streak_milestone":
          go("/(tabs)/today?capture=1");
          return;

        // Chapter ready — same hand-off as the legacy expo-push path:
        // stash the pending id, route to the Chapters tab, let the
        // screen open it on mount.
        case "chapter":
          if (data.chapter_id) {
            useChapterNotifStore
              .getState()
              .setPendingChapterId(data.chapter_id);
            go("/(tabs)/chapters");
          }
          return;

        // Thread surfaced — land on the Connect / Ellie flipbook so
        // the user opens the new card themselves (matches in-product
        // shimmer pattern).
        case "thread":
          go("/(tabs)/brain?tab=ellie");
          return;

        case "first_pin":
          // Pinned filter on Capsule — they should see the album
          // forming in real time.
          go("/(tabs)/memories?filter=pinned");
          return;

        case "on_this_day":
        case "share_created":
          if (data.entry_id) {
            go(`/entry/${data.entry_id}`);
          } else {
            go("/(tabs)/memories");
          }
          return;

        // Just-captured moment success push — same routing as the other
        // entry-tied lifecycle pushes: open the entry detail if we have
        // an id, otherwise land on Capsule (the user's flipbook).
        case "moment_saved":
          if (data.entry_id) {
            go(`/entry/${data.entry_id}`);
          } else {
            go("/(tabs)/memories");
          }
          return;

        case "premium_pitch":
          go("/paywall/upgrade");
          return;

        case "winback":
          go("/(tabs)/today?capture=1");
          return;

        default:
          // Unknown type — fall back to opening the app on Today.
          go("/(tabs)/today");
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
      if (session?.user?.id) {
        identifyUser(session.user.id);
        syncOneSignalUser(session.user.id, session.user.email ?? null);
      } else {
        syncOneSignalUser(null);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user?.id) {
        identifyUser(session.user.id);
        syncOneSignalUser(session.user.id, session.user.email ?? null);
      } else {
        syncOneSignalUser(null);
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
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: colors.background }}
      onLayout={onLayoutRootView}
    >
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
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
          name="capture/[mode]"
          options={{ presentation: "modal" }}
        />
        <Stack.Screen name="entry/[id]" />
        <Stack.Screen
          name="settings/index"
          options={{ presentation: "modal" }}
        />
        <Stack.Screen
          name="settings/story-coach"
          options={{ presentation: "modal" }}
        />
        <Stack.Screen
          name="settings/manage-donation"
          options={{ presentation: "modal" }}
        />
        <Stack.Screen
          name="ellie-premium/index"
          options={{ presentation: "modal" }}
        />
        <Stack.Screen
          name="paywall/upgrade"
          options={{ presentation: "modal" }}
        />
        <Stack.Screen
          name="paywall/cause"
          options={{ presentation: "modal" }}
        />
        <Stack.Screen
          name="paywall/index"
          options={{ presentation: "modal" }}
        />
        <Stack.Screen
          name="threads/[id]"
          options={{ presentation: "modal" }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}

/**
 * Last-resort fallback UI when something inside the app tree throws and
 * the React error boundary catches it. The boundary already reports the
 * exception to PostHog via captureException; this UI just gives the user
 * something other than a white screen until they background-and-reopen.
 *
 * Kept intentionally minimal — no stores, no fonts, no theme. The crash
 * may have been caused by any of those.
 */
function CrashFallback() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#0a0a0a",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <Text
        style={{
          color: "#fff",
          fontSize: 18,
          textAlign: "center",
          marginBottom: 8,
        }}
      >
        Something went wrong.
      </Text>
      <Text
        style={{
          color: "rgba(255,255,255,0.6)",
          fontSize: 14,
          textAlign: "center",
        }}
      >
        Close and reopen the app to try again.
      </Text>
    </View>
  );
}

export default function RootLayout() {
  return (
    <PostHogProvider
      apiKey={process.env.EXPO_PUBLIC_POSTHOG_API_KEY!}
      options={{
        host: "https://us.i.posthog.com",
        // Session replay — alpha-stage product, prioritize debuggability.
        // Inputs are intentionally LEFT UNMASKED so we can see what users
        // actually type into prompts, Dig Deeper, onboarding, etc. The
        // only sensitive fields are passwords on the sign-in form, which
        // are wrapped in <PostHogMaskView> at the call site (see
        // components/auth/EmailAuthForm.tsx).
        enableSessionReplay: true,
        sessionReplayConfig: {
          maskAllTextInputs: false,
          maskAllImages: false,
          // Console + network telemetry on the replay timeline help
          // root-cause "what happened right before this bug". Network
          // telemetry captures URL + status only — never request bodies.
          captureLog: true,
          captureNetworkTelemetry: true,
          iOSDebouncerDelayMs: 1000,
          androidDebouncerDelayMs: 1000,
        },
        // Error tracking: the SDK installs global handlers for uncaught
        // exceptions and unhandled promise rejections so anything that
        // would otherwise red-screen the app gets sent as an `$exception`
        // event. The console autocapture is OFF — session replay's
        // `captureLog` already gives us the same signal during a replay,
        // and we don't want the noise from non-error console.error calls
        // (eg. React component-stack warnings) showing up as exceptions.
        errorTracking: {
          autocapture: {
            uncaughtExceptions: true,
            unhandledRejections: true,
            console: false,
          },
        },
      }}
    >
      <PostHogSurveyProvider>
        {/* Catches React render-tree errors that the global handlers
            above can't see (those only fire for thrown JS errors outside
            React's reconciliation). Together they cover both rails. */}
        <PostHogErrorBoundary fallback={CrashFallback}>
          <AppInner />
        </PostHogErrorBoundary>
      </PostHogSurveyProvider>
    </PostHogProvider>
  );
}
