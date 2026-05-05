import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { usePostHog } from "posthog-react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import type { Thread } from "@/hooks/useThreads";
import { ThreadFlipCard } from "@/components/threads/ThreadFlipCard";
import { launchPremiumFlow } from "@/lib/premiumFlow";

const ONBOARDING_STORAGE_KEY = "thread_flipbook_swipe_hint_seen";

interface ThreadFlipbookViewProps {
  /** Threads to flip through. Order is preserved (no shuffle). */
  threads: Thread[];
  /**
   * Map of thread id → 1-indexed chronological position (oldest = 1).
   * Owned by the parent so the lock gate and the rendered ordinal label
   * stay in sync.
   */
  ordinals: Map<string, number>;
  /**
   * Pure predicate — receives the thread and its index in `threads` and
   * returns whether tapping should route to the paywall instead of the
   * detail screen.
   */
  isLocked: (thread: Thread, index: number) => boolean;
}

/**
 * Flipbook-style gallery of insight threads. Mirrors the gesture model and
 * animation feel of `CapsuleFlipbookView` but for `Thread` cards: swipe up
 * walks back through history (older), swipe down returns to newer, tap opens
 * the detail screen (or the premium flow when the card is locked).
 *
 * Order is preserved from the parent; we do NOT reshuffle. With the parent
 * passing newest-first, the user starts on the freshest insight and can
 * flip back through their history.
 */
export function ThreadFlipbookView({
  threads,
  ordinals,
  isLocked,
}: ThreadFlipbookViewProps) {
  const posthog = usePostHog();
  const [currentIdx, setCurrentIdx] = useState(0);

  // If the upstream list shrinks below the current cursor (rare — e.g. a
  // thread is dismissed while the flipbook is open) clamp back into range.
  useEffect(() => {
    if (currentIdx > threads.length - 1) {
      setCurrentIdx(Math.max(0, threads.length - 1));
    }
  }, [threads.length, currentIdx]);

  // Onboarding tooltip — shown once, dismissed on first swipe up.
  const [showOnboarding, setShowOnboarding] = useState(false);
  useEffect(() => {
    void AsyncStorage.getItem(ONBOARDING_STORAGE_KEY).then((v) => {
      if (v !== "true") setShowOnboarding(true);
    });
  }, []);
  const dismissOnboarding = useCallback(() => {
    setShowOnboarding(false);
    void AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
  }, []);

  const cardOpacity = useSharedValue(1);
  const cardTranslateY = useSharedValue(0);
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardTranslateY.value }],
  }));

  const animateIn = useCallback(
    (direction: "up" | "down") => {
      const offset = direction === "up" ? 24 : -24;
      cardOpacity.value = 0;
      cardTranslateY.value = offset;
      cardOpacity.value = withTiming(1, { duration: 260 });
      cardTranslateY.value = withTiming(0, { duration: 260 });
    },
    [cardOpacity, cardTranslateY]
  );

  const handleSwipeUp = useCallback(() => {
    if (showOnboarding) dismissOnboarding();
    if (currentIdx >= threads.length - 1) {
      // End of feed — give a soft "soft" haptic so the user knows we heard them
      // but there's no next card to advance to.
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCurrentIdx((i) => i + 1);
    animateIn("up");
  }, [
    currentIdx,
    threads.length,
    showOnboarding,
    dismissOnboarding,
    animateIn,
  ]);

  const handleSwipeDown = useCallback(() => {
    if (currentIdx <= 0) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentIdx((i) => i - 1);
    animateIn("down");
  }, [currentIdx, animateIn]);

  const current = threads[currentIdx];

  const handleTap = useCallback(() => {
    if (!current) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isLocked(current, currentIdx)) {
      // Respect the `paywall` flag so locked-tap behavior matches every
      // other premium entry point (TryPremiumPill, ThreadCard, chapters, etc.)
      launchPremiumFlow(posthog, "thread_flipbook_locked", {
        bump: { surface: "thread", refId: current.id },
      });
      return;
    }
    // The detail screen calls `markThreadViewed` on mount so we don't need
    // an optimistic write here — same contract as the legacy ThreadCard.
    router.push(`/threads/${current.id}`);
  }, [current, currentIdx, isLocked, posthog]);

  // Compose pan + tap gestures. activeOffsetY mirrors capsule flipbook so
  // a horizontal scroll attempt doesn't accidentally grab the gesture.
  const composed = useMemo(() => {
    const pan = Gesture.Pan()
      .activeOffsetY([-12, 12])
      .onEnd((e) => {
        if (e.translationY < -40) runOnJS(handleSwipeUp)();
        else if (e.translationY > 40) runOnJS(handleSwipeDown)();
      });
    const tap = Gesture.Tap()
      .maxDuration(220)
      .onEnd(() => runOnJS(handleTap)());
    return Gesture.Exclusive(pan, tap);
  }, [handleSwipeUp, handleSwipeDown, handleTap]);

  if (!current) return null;

  const ordinal = ordinals.get(current.id) ?? 1;
  const locked = isLocked(current, currentIdx);

  return (
    <View
      style={{
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 4,
        paddingBottom: 12,
      }}
    >
      <GestureDetector gesture={composed}>
        <Animated.View style={[{ flex: 1 }, cardStyle]}>
          <ThreadFlipCard
            thread={current}
            ordinalRank={ordinal}
            locked={locked}
          />
        </Animated.View>
      </GestureDetector>

      {/* Position indicator — centered under the card so users orient
          inside their thread history. Hidden when there's only one card. */}
      {threads.length > 1 ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 16,
            left: 0,
            right: 0,
            alignItems: "center",
            zIndex: 5,
          }}
        >
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 5,
              borderRadius: 9999,
              backgroundColor: "rgba(0,0,0,0.45)",
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 11,
                color: "#FFFFFF",
                letterSpacing: 0.4,
              }}
            >
              {currentIdx + 1} / {threads.length}
            </Text>
          </View>
        </View>
      ) : null}

      {/* First-run "swipe up" hint, dismissed after the first successful swipe. */}
      {showOnboarding ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 90,
            alignItems: "center",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 9999,
              backgroundColor: "rgba(0,0,0,0.78)",
            }}
          >
            <Ionicons name="arrow-up" size={14} color="#FFFFFF" />
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 12,
                color: "#FFFFFF",
                letterSpacing: 0.5,
              }}
            >
              Swipe up to flip through your threads
            </Text>
          </View>
        </View>
      ) : null}

    </View>
  );
}
