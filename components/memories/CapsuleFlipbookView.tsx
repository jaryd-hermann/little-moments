import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import type { Entry } from "@/store/entryStore";
import { useTheme } from "@/hooks/useTheme";
import { entryMomentDayHeadingText } from "@/lib/reflectionTarget";
import { EntryMediaImage } from "@/components/common/EntryMediaImage";
import { EntryPinToggle } from "@/components/common/EntryPinToggle";
import { ShareMomentModal } from "@/components/common/ShareMomentModal";
import { enqueueMomentsMediaPrefetch } from "@/lib/viewportMediaPrefetch";
import { useCapsuleFlipbookStore } from "@/store/capsuleFlipbookStore";

const ONBOARDING_STORAGE_KEY = "capsule_flipbook_swipe_hint_seen";

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function firstSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const m = trimmed.match(/^[\s\S]*?[.!?](?=\s|$)/);
  return (m?.[0] ?? trimmed).trim();
}

/**
 * Deterministic Fisher-Yates driven by a mulberry32 PRNG. Same `(list, seed)`
 * always yields the same order, so the deck stays put across re-renders and
 * only reorders when the seed changes.
 */
function seededShuffle<T>(list: T[], seed: number): T[] {
  let state = seed >>> 0 || 1;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Same ordering as Capsule list “newest” sort: `entry_date` desc, then `created_at`. */
function compareMomentsListOrder(a: Entry, b: Entry): number {
  const da = a.entry_date ?? "";
  const db = b.entry_date ?? "";
  const byDay = db.localeCompare(da);
  if (byDay !== 0) return byDay;
  return (
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

interface CapsuleFlipbookViewProps {
  entries: Entry[];
  /**
   * When true, swiping past the last entry no-ops instead of routing to
   * `/(tabs)/today?capture=1`. Used by the onboarding reveal screen so the
   * user stays on the auth stack until they tap the explicit Continue CTA.
   */
  disableEndOfFeedRoute?: boolean;
}

export function CapsuleFlipbookView({
  entries,
  disableEndOfFeedRoute = false,
}: CapsuleFlipbookViewProps) {
  const { colors } = useTheme();

  const moments = useMemo(
    () => entries.filter((e) => e.entry_type === "moment"),
    [entries]
  );

  const shuffleEnabled = useCapsuleFlipbookStore(
    (s) => s.flipbookShuffleEnabled
  );
  const shuffleSeed = useCapsuleFlipbookStore((s) => s.flipbookShuffleSeed);
  const focusEntryId = useCapsuleFlipbookStore((s) => s.focusEntryId);
  const setFocusEntryId = useCapsuleFlipbookStore((s) => s.setFocusEntryId);

  const orderedMoments = useMemo(() => {
    const chronological = [...moments].sort(compareMomentsListOrder);
    return shuffleEnabled ? seededShuffle(chronological, shuffleSeed) : chronological;
  }, [moments, shuffleEnabled, shuffleSeed]);

  const momentsKey = useMemo(
    () => orderedMoments.map((e) => e.id).join(","),
    [orderedMoments]
  );

  const [history, setHistory] = useState<Entry[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [shareEntry, setShareEntry] = useState<Entry | null>(null);

  // Onboarding tooltip — first-time tap-up hint.
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

  useLayoutEffect(() => {
    if (orderedMoments.length === 0) {
      setHistory([]);
      setCurrentIdx(0);
      return;
    }
    // A recap push asked us to open on one specific moment, so it becomes the
    // visible card regardless of the shuffled order. Only clear the request
    // once the moment is actually present — entries may still be loading.
    if (focusEntryId) {
      const focused = orderedMoments.find((e) => e.id === focusEntryId);
      if (focused) {
        setHistory([focused]);
        setCurrentIdx(0);
        setFocusEntryId(null);
        return;
      }
    }
    setHistory((prev) => {
      if (prev.length === 0) return [orderedMoments[0]];
      const ids = new Set(orderedMoments.map((e) => e.id));
      const pruned = prev.filter((e) => ids.has(e.id));
      if (pruned.length === 0) return [orderedMoments[0]];
      const rank = (id: string) =>
        orderedMoments.findIndex((e) => e.id === id);
      return [...pruned].sort((a, b) => rank(a.id) - rank(b.id));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [momentsKey, focusEntryId]);

  useEffect(() => {
    setCurrentIdx((i) =>
      Math.min(Math.max(0, i), Math.max(0, history.length - 1))
    );
  }, [history.length]);

  useEffect(() => {
    const batch: Entry[] = [];
    const current = history[currentIdx];
    if (current) batch.push(current);
    const nextInHistory = history[currentIdx + 1];
    if (nextInHistory) batch.push(nextInHistory);
    if (batch.length > 0) {
      enqueueMomentsMediaPrefetch(batch, 9000);
    }
  }, [currentIdx, history]);

  const cardOpacity = useSharedValue(1);
  const cardTranslateY = useSharedValue(0);
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardTranslateY.value }],
  }));

  const pickNext = useCallback((): Entry | null => {
    if (orderedMoments.length === 0) return null;
    const seen = new Set(history.map((h) => h.id));
    for (const e of orderedMoments) {
      if (!seen.has(e.id)) return e;
    }
    return null;
  }, [orderedMoments, history]);

  const handleSwipeUp = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (showOnboarding) dismissOnboarding();

    if (currentIdx < history.length - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      const next = pickNext();
      if (!next) {
        // End of feed — route to Capture (capture-another mode if a moment for today already exists),
        // unless the host (e.g. onboarding reveal) opted out.
        if (!disableEndOfFeedRoute) {
          router.push("/(tabs)/today?capture=1");
        }
        return;
      }
      setHistory((h) => [...h, next]);
      setCurrentIdx((i) => i + 1);
    }
    cardOpacity.value = 0;
    cardTranslateY.value = 24;
    cardOpacity.value = withTiming(1, { duration: 280 });
    cardTranslateY.value = withTiming(0, { duration: 280 });
  }, [
    currentIdx,
    history,
    pickNext,
    cardOpacity,
    cardTranslateY,
    showOnboarding,
    dismissOnboarding,
    disableEndOfFeedRoute,
  ]);

  const handleSwipeDown = useCallback(() => {
    if (currentIdx <= 0) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentIdx(currentIdx - 1);
    cardOpacity.value = 0;
    cardTranslateY.value = -24;
    cardOpacity.value = withTiming(1, { duration: 280 });
    cardTranslateY.value = withTiming(0, { duration: 280 });
  }, [currentIdx, cardOpacity, cardTranslateY]);

  const current = history[currentIdx];

  const handleTap = useCallback(() => {
    if (!current) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/entry/${current.id}`);
  }, [current]);

  const pan = Gesture.Pan()
    .activeOffsetY([-12, 12])
    .onEnd((e) => {
      if (e.translationY < -40) runOnJS(handleSwipeUp)();
      else if (e.translationY > 40) runOnJS(handleSwipeDown)();
    });
  const tap = Gesture.Tap()
    .maxDuration(220)
    .onEnd(() => runOnJS(handleTap)());
  const composed = Gesture.Exclusive(pan, tap);

  if (!current) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 32,
        }}
      >
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 14,
            color: colors.textSecondary,
            textAlign: "center",
          }}
        >
          Capture a moment to start your flipbook.
        </Text>
      </View>
    );
  }

  const firstMedia = current.media?.[0];
  const sentence = firstSentence(stripHtml(current.body));
  const momentDayLabel = entryMomentDayHeadingText(current);
  const promptOnlyCardBg = "#414141";

  return (
    <View
      style={{
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 4,
        paddingBottom: 8,
      }}
    >
      <GestureDetector gesture={composed}>
        <Animated.View
          style={[
            {
              flex: 1,
              borderRadius: 18,
              overflow: "hidden",
              backgroundColor: firstMedia
                ? colors.surfaceSecondary
                : promptOnlyCardBg,
            },
            cardStyle,
          ]}
        >
          {firstMedia ? (
            <EntryMediaImage
              media={firstMedia}
              enableLivePhoto
              style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
            />
          ) : (
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {current.word_of_day ? (
                <Text
                  style={{
                    fontFamily: "PMGothicLudington-Text110",
                    fontSize: 60,
                    color: "rgba(255,255,255,0.22)",
                  }}
                >
                  {current.word_of_day.toLowerCase()}
                </Text>
              ) : null}
            </View>
          )}
          {firstMedia ? (
            <>
              {/* Top gradient for legibility behind date / actions */}
              <LinearGradient
                colors={["rgba(0,0,0,0.5)", "rgba(0,0,0,0)"]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 0.5 }}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  height: "30%",
                }}
                pointerEvents="none"
              />
              {/* Bottom gradient for legibility on photo backgrounds */}
              <LinearGradient
                colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.7)"]}
                start={{ x: 0.5, y: 0.5 }}
                end={{ x: 0.5, y: 1 }}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: "55%",
                }}
                pointerEvents="none"
              />
            </>
          ) : null}

          {/* Top-left: calendar day this moment is *for* (not photo EXIF / save time). */}
          {momentDayLabel ? (
            <View
              style={{
                position: "absolute",
                top: 16,
                left: 16,
                maxWidth: "72%",
              }}
              pointerEvents="none"
            >
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 11,
                  color: "rgba(255,255,255,0.85)",
                  letterSpacing: 0.6,
                }}
                numberOfLines={2}
              >
                {momentDayLabel}
              </Text>
            </View>
          ) : null}

          <View
            style={{
              position: "absolute",
              left: 20,
              right: 20,
              bottom: 24,
            }}
            pointerEvents="none"
          >
            {current.title ? (
              <Text
                style={{
                  fontFamily: "PMGothicLudington-Text110",
                  fontSize: 24,
                  lineHeight: 30,
                  color: "#FFFFFF",
                  marginBottom: 6,
                }}
                numberOfLines={2}
              >
                {current.title}
              </Text>
            ) : null}
            {sentence ? (
              <Text
                style={{
                  fontFamily: "Roboto-Regular",
                  fontSize: 14,
                  lineHeight: 20,
                  color: "rgba(255,255,255,0.78)",
                }}
                numberOfLines={2}
              >
                {sentence}
              </Text>
            ) : null}
          </View>
        </Animated.View>
      </GestureDetector>

      {/* Top-right action buttons live OUTSIDE the gesture detector so taps on
          them don't propagate to the card's tap-to-open handler. */}
      <View
        style={{
          position: "absolute",
          top: 16,
          right: 36,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          zIndex: 10,
        }}
      >
        <EntryPinToggle entryId={current.id} />
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShareEntry(current);
          }}
          hitSlop={10}
          accessibilityLabel="Share moment"
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: "rgba(0,0,0,0.14)",
            backgroundColor: "#FFFFFF",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="share-outline" size={18} color="#000000" />
        </Pressable>
      </View>

      {/* First-time onboarding tooltip */}
      {showOnboarding ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 80,
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
              Swipe up to flip through your moments
            </Text>
          </View>
        </View>
      ) : null}

      <ShareMomentModal
        visible={!!shareEntry}
        entry={shareEntry}
        onDismiss={() => setShareEntry(null)}
      />
    </View>
  );
}
