import { useCallback, useEffect, useMemo, useState } from "react";
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
import { format } from "date-fns";
import type { Entry } from "@/store/entryStore";
import { useTheme } from "@/hooks/useTheme";
import { EntryMediaImage } from "@/components/common/EntryMediaImage";
import { EntryPinToggle } from "@/components/common/EntryPinToggle";
import { ShareMomentModal } from "@/components/common/ShareMomentModal";

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

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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

  // Shuffle once per mount of this component for "feels fresh" randomness on landing.
  const shuffled = useMemo(() => shuffle(moments), [moments]);

  const [history, setHistory] = useState<Entry[]>(() =>
    shuffled[0] ? [shuffled[0]] : []
  );
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

  const cardOpacity = useSharedValue(1);
  const cardTranslateY = useSharedValue(0);
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardTranslateY.value }],
  }));

  const pickNext = useCallback((): Entry | null => {
    if (shuffled.length === 0) return null;
    const seen = new Set(history.map((h) => h.id));
    const fresh = shuffled.filter((e) => !seen.has(e.id));
    if (fresh.length === 0) return null;
    return fresh[0] ?? null;
  }, [shuffled, history]);

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
  // Prefer the photo's original capture time (EXIF / MediaLibrary creationTime
  // recorded when the moment was saved) over the date the entry was logged.
  const dateSource = firstMedia?.taken_at
    ? new Date(firstMedia.taken_at)
    : current.entry_date
      ? new Date(`${current.entry_date}T00:00:00`)
      : null;
  const dateStr =
    dateSource && !Number.isNaN(dateSource.getTime())
      ? format(dateSource, "MMM d, yyyy")
      : current.entry_year
        ? `${current.entry_year}`
        : "";

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
              backgroundColor: colors.surfaceSecondary,
            },
            cardStyle,
          ]}
        >
          {firstMedia ? (
            <EntryMediaImage
              media={firstMedia}
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
                    fontFamily: "LibreBaskerville-Italic",
                    fontSize: 60,
                    color: "rgba(0,0,0,0.55)",
                  }}
                >
                  {current.word_of_day.toLowerCase()}
                </Text>
              ) : null}
            </View>
          )}
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

          {/* Top-left date */}
          {dateStr ? (
            <View
              style={{
                position: "absolute",
                top: 16,
                left: 16,
              }}
              pointerEvents="none"
            >
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 11,
                  color: "rgba(255,255,255,0.85)",
                  letterSpacing: 1,
                  textTransform: "uppercase",
                }}
              >
                {dateStr}
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
                  fontFamily: "LibreBaskerville-Bold",
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
        <EntryPinToggle entryId={current.id} size={20} />
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
