import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable as RNPressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Gesture,
  GestureDetector,
  Pressable,
} from "react-native-gesture-handler";
import { format, parseISO, parse as parseDate } from "date-fns";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  runOnJS,
  runOnUI,
  type SharedValue,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import type { Entry } from "@/store/entryStore";
import { EntryMediaImage } from "@/components/common/EntryMediaImage";
import { InfoTipModal } from "@/components/common/InfoTipModal";
import { useTheme } from "@/hooks/useTheme";

function stripEntryHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const FOCAL_CARD_BG = "#FFFFEB";
const FLIP_SPRING_RESET = {
  damping: 34,
  stiffness: 175,
  mass: 0.92,
};

const EXIT_CORAL = "#FF6D6D";
/** Nudge on Newer/Older tap (px); positive = card moves like pulling toward newer). */
const NUDGE_DP = 36;
/** Padding inside footer above the pill row (space below focal card). */
const CONTROL_SECTION_PADDING_TOP = 28;
const PILL_ROW_MIN_H = 52;
const DOCK_BOTTOM_PAD = 12;
/** ~max focal card block height; backdrop feed ends above focal + gap. */
const FOCAL_CARD_EST = 228;
/** Space between focal card bottom and the footer bar (swipe layer bottom inset). */
const FOCAL_GAP_ABOVE_SWIPE_BOTTOM = 40;
const FEED_GAP_ABOVE_FOCAL = 20;

interface FlipbookMemoriesProps {
  entries: Entry[];
  onExitPress: () => void;
}

function MiniFeedTile({ entry }: { entry: Entry }) {
  const { colors } = useTheme();
  const dateStr = entry.entry_date
    ? format(new Date(entry.entry_date), "MMMM d, yyyy")
    : `${entry.entry_year}`;
  const plain = stripEntryHtml(entry.body);

  return (
    <RNPressable
      onPress={() => router.push(`/entry/${entry.id}`)}
      style={{
        width: "100%",
        borderRadius: 12,
        backgroundColor: colors.surfaceSecondary,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 10,
        marginBottom: 8,
      }}
    >
      <Text
        style={{
          fontFamily: "Roboto-Light",
          fontSize: 10,
          color: colors.textMuted,
        }}
        numberOfLines={1}
      >
        {dateStr}
      </Text>
      <Text
        style={{
          fontFamily: "LibreBaskerville-Bold",
          fontSize: 13,
          color: colors.text,
          marginTop: 4,
        }}
        numberOfLines={1}
      >
        {entry.title || plain.slice(0, 42) || "Moment"}
      </Text>
      <Text
        style={{
          fontFamily: "Roboto-Light",
          fontSize: 11,
          color: colors.textSecondary,
          marginTop: 4,
          lineHeight: 15,
        }}
        numberOfLines={3}
      >
        {plain}
      </Text>
    </RNPressable>
  );
}

function RollerdexFeed({
  sorted,
  currentIndex,
  dragY,
  topInset,
  bottomInset,
}: {
  sorted: Entry[];
  currentIndex: number;
  dragY: SharedValue<number>;
  topInset: number;
  /** Distance from this layer’s bottom to where the feed should end (above focal). */
  bottomInset: number;
}) {
  const older = sorted.slice(currentIndex + 1, currentIndex + 12);
  const leftCol = older.filter((_, i) => i % 2 === 0);
  const rightCol = older.filter((_, i) => i % 2 === 1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.value * 0.14 }],
    opacity: 0.5,
  }));

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        {
          position: "absolute",
          left: 0,
          right: 0,
          top: topInset + 46,
          bottom: bottomInset,
        },
        animatedStyle,
      ]}
    >
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          gap: 8,
          paddingHorizontal: 12,
          justifyContent: "flex-end",
          alignItems: "stretch",
          overflow: "hidden",
        }}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          {leftCol.map((e) => (
            <MiniFeedTile key={e.id} entry={e} />
          ))}
        </View>
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          {rightCol.map((e) => (
            <MiniFeedTile key={e.id} entry={e} />
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

function FocalEntryStack({ entry, selectedDate }: { entry: Entry; selectedDate: Date }) {
  const firstMedia = entry.media?.[0];
  const plainBody = stripEntryHtml(entry.body);
  const cardText = "#1A1A1A";
  const cardMuted = "rgba(0, 0, 0, 0.55)";
  const cardDate = "rgba(0, 0, 0, 0.45)";

  const dateLine = format(selectedDate, "EEEE, MMMM d");
  const timeLine = entry.created_at
    ? format(parseISO(entry.created_at), "h:mm a")
    : null;

  return (
    <View style={{ position: "relative" }}>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          right: -10,
          bottom: -10,
          borderRadius: 16,
          backgroundColor: "#000000",
          borderWidth: 3,
          borderColor: "#FFFFFF",
        }}
      />
      <View
        style={{
          borderRadius: 16,
          borderWidth: 1,
          borderColor: "rgba(0, 0, 0, 0.12)",
          backgroundColor: FOCAL_CARD_BG,
          padding: 20,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            gap: 14,
            alignItems: "flex-start",
            minHeight: firstMedia ? 120 : undefined,
          }}
        >
          <View
            style={{
              flex: 1,
              minWidth: 0,
              justifyContent: "space-between",
              alignSelf: "stretch",
            }}
          >
            <View>
              {entry.title ? (
                <Text
                  style={{
                    fontFamily: "LibreBaskerville-Bold",
                    fontSize: 18,
                    color: cardText,
                  }}
                  numberOfLines={2}
                >
                  {entry.title}
                </Text>
              ) : null}
              <Text
                style={{
                  fontFamily: "Roboto-Regular",
                  fontSize: 14,
                  color: cardMuted,
                  marginTop: entry.title ? 6 : 0,
                  lineHeight: 22,
                }}
                numberOfLines={firstMedia ? 5 : 4}
              >
                {plainBody}
              </Text>
            </View>
            <Text
              style={{
                fontFamily: "Roboto-Light",
                fontSize: 12,
                color: cardDate,
                marginTop: 12,
                alignSelf: "flex-start",
              }}
            >
              {dateLine}
              {timeLine ? ` · ${timeLine}` : ""}
            </Text>
          </View>
          {firstMedia ? (
            <EntryMediaImage
              media={firstMedia}
              style={{
                width: 112,
                height: 112,
                borderRadius: 14,
                backgroundColor: "rgba(0,0,0,0.06)",
                borderWidth: 1.5,
                borderColor: "#1A1A1A",
              }}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

export function FlipbookMemories({ entries, onExitPress }: FlipbookMemoriesProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showFlipInfo, setShowFlipInfo] = useState(false);
  const dragY = useSharedValue(0);

  const sorted = useMemo(
    () =>
      [...entries].sort((a, b) => {
        const ta = a.entry_date ?? `${a.entry_year}-01-01`;
        const tb = b.entry_date ?? `${b.entry_year}-01-01`;
        return tb.localeCompare(ta);
      }),
    [entries]
  );

  useEffect(() => {
    setCurrentIndex((i) => Math.min(i, Math.max(0, sorted.length - 1)));
  }, [sorted.length]);

  const tryGoNext = useCallback(() => {
    setCurrentIndex((i) => {
      if (i >= sorted.length - 1) return i;
      queueMicrotask(() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      });
      return i + 1;
    });
  }, [sorted.length]);

  const tryGoPrev = useCallback(() => {
    setCurrentIndex((i) => {
      if (i <= 0) return i;
      queueMicrotask(() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      });
      return i - 1;
    });
  }, []);

  const nudgeForPrev = useCallback(() => {
    runOnUI(() => {
      "worklet";
      dragY.value = withSequence(
        withTiming(NUDGE_DP, { duration: 120 }),
        withSpring(0, FLIP_SPRING_RESET)
      );
    })();
  }, [dragY]);

  const nudgeForNext = useCallback(() => {
    runOnUI(() => {
      "worklet";
      dragY.value = withSequence(
        withTiming(-NUDGE_DP, { duration: 120 }),
        withSpring(0, FLIP_SPRING_RESET)
      );
    })();
  }, [dragY]);

  const goPrevWithNudge = useCallback(() => {
    if (currentIndex <= 0) return;
    nudgeForPrev();
    tryGoPrev();
  }, [currentIndex, nudgeForPrev, tryGoPrev]);

  const onSwipeBounce = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const goNextWithNudge = useCallback(() => {
    if (currentIndex >= sorted.length - 1) return;
    nudgeForNext();
    tryGoNext();
  }, [currentIndex, nudgeForNext, tryGoNext, sorted.length]);

  /** Backdrop tiles end above the focal stack (insets are relative to the swipe layer only). */
  const feedBottomInset =
    FOCAL_GAP_ABOVE_SWIPE_BOTTOM + FOCAL_CARD_EST + FEED_GAP_ABOVE_FOCAL;

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-14, 14])
        .failOffsetX([-32, 32])
        .onUpdate((e) => {
          dragY.value = e.translationY;
        })
        .onEnd((e) => {
          const { translationY, velocityY } = e;
          if (translationY < -48 || velocityY < -520) {
            runOnJS(tryGoNext)();
          } else if (translationY > 48 || velocityY > 520) {
            runOnJS(tryGoPrev)();
          } else {
            runOnJS(onSwipeBounce)();
          }
          dragY.value = withSpring(0, {
            ...FLIP_SPRING_RESET,
            velocity: velocityY * 0.0014,
          });
        }),
    [tryGoNext, tryGoPrev]
  );

  const focalStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.value }],
  }));

  const current = sorted[currentIndex];
  const selectedDate = current
    ? current.entry_date
      ? parseDate(current.entry_date, "yyyy-MM-dd", new Date())
      : new Date(current.entry_year, 0, 1)
    : new Date();

  if (sorted.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.background,
          paddingHorizontal: 28,
        }}
      >
        <Text
          style={{
            fontFamily: "LibreBaskerville-Regular",
            fontSize: 16,
            color: colors.textSecondary,
            textAlign: "center",
            lineHeight: 24,
          }}
        >
          Your story is just beginning.
        </Text>
        <Pressable
          onPress={() => router.push("/composer")}
          style={{
            marginTop: 24,
            borderRadius: 9999,
            backgroundColor: colors.primary,
            borderWidth: 2,
            borderColor: "#000000",
            paddingHorizontal: 24,
            paddingVertical: 14,
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 15,
              color: "#000000",
            }}
          >
            Add your first moment
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000000" }}>
      <View
        style={{
          position: "absolute",
          right: 16,
          top: insets.top + 8,
          zIndex: 200,
          elevation: 24,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <RNPressable
          onPress={() => setShowFlipInfo(true)}
          style={{
            borderRadius: 9999,
            backgroundColor: "rgba(0,0,0,0.55)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.35)",
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 12,
              color: "#FFFFFF",
            }}
          >
            What&apos;s this?
          </Text>
        </RNPressable>
        <RNPressable
          onPress={onExitPress}
          style={{
            borderRadius: 9999,
            backgroundColor: EXIT_CORAL,
            borderWidth: 2,
            borderColor: "#FFFFFF",
            paddingHorizontal: 14,
            paddingVertical: 8,
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 13,
              color: "#FFFFFF",
            }}
          >
            Exit Flipbook
          </Text>
        </RNPressable>
      </View>

      <View style={{ flex: 1, minHeight: 0, zIndex: 1 }}>
        <GestureDetector gesture={panGesture}>
          <View
            style={{
              flex: 1,
              minHeight: 0,
              backgroundColor: "#000000",
            }}
            collapsable={false}
          >
            <RollerdexFeed
              sorted={sorted}
              currentIndex={currentIndex}
              dragY={dragY}
              topInset={insets.top}
              bottomInset={feedBottomInset}
            />
            <Animated.View
              style={[
                {
                  position: "absolute",
                  left: 20,
                  right: 20,
                  bottom: FOCAL_GAP_ABOVE_SWIPE_BOTTOM,
                  zIndex: 5,
                  alignItems: "stretch",
                },
                focalStyle,
              ]}
            >
              {sorted.length === 1 ? (
                <Text
                  style={{
                    fontFamily: "Roboto-Regular",
                    fontSize: 14,
                    color: "rgba(255,255,255,0.72)",
                    textAlign: "center",
                    lineHeight: 21,
                    marginBottom: 16,
                    paddingHorizontal: 4,
                  }}
                >
                  Keep adding more moments to add to your story timeline
                </Text>
              ) : null}
              {current ? (
                <FocalEntryStack entry={current} selectedDate={selectedDate} />
              ) : null}
            </Animated.View>
          </View>
        </GestureDetector>
      </View>

      {/*
        Fixed footer OUTSIDE GestureDetector: tap-only, never competes with pan.
        Flex layout guarantees this renders (no RNGH overlay clipping).
      */}
      <View
        pointerEvents="auto"
        collapsable={false}
        style={{
          zIndex: 100000,
          elevation: 10000,
          backgroundColor: "#000000",
          borderTopWidth: StyleSheet.hairlineWidth * 2,
          borderTopColor: "rgba(255,255,255,0.28)",
          paddingTop: CONTROL_SECTION_PADDING_TOP,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + DOCK_BOTTOM_PAD,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            minHeight: PILL_ROW_MIN_H,
            width: "100%",
          }}
        >
          <RNPressable
            onPress={goPrevWithNudge}
            disabled={currentIndex <= 0}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 16,
              borderRadius: 9999,
              backgroundColor: "#000000",
              borderWidth: 1.5,
              borderColor: "#FFFFFF",
              opacity: currentIndex <= 0 ? 0.35 : 1,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 13,
                  color: "#FFFFFF",
                }}
              >
                Newer
              </Text>
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 11,
                  color: "#FFFFFF",
                }}
              >
                {"↓"}
              </Text>
            </View>
          </RNPressable>

          <RNPressable
            onPress={() => current && router.push(`/entry/${current.id}`)}
            disabled={!current}
            style={{
              flex: 1,
              marginHorizontal: 10,
              maxWidth: 220,
              minHeight: PILL_ROW_MIN_H,
              paddingVertical: 13,
              paddingHorizontal: 20,
              borderRadius: 9999,
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
              opacity: !current ? 0.4 : 1,
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 14,
                color: "#000000",
                textAlign: "center",
              }}
              numberOfLines={1}
            >
              View this moment
            </Text>
          </RNPressable>

          <RNPressable
            onPress={goNextWithNudge}
            disabled={currentIndex >= sorted.length - 1}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 16,
              borderRadius: 9999,
              backgroundColor: "#000000",
              borderWidth: 1.5,
              borderColor: "#FFFFFF",
              opacity: currentIndex >= sorted.length - 1 ? 0.35 : 1,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 13,
                  color: "#FFFFFF",
                }}
              >
                Older
              </Text>
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 11,
                  color: "#FFFFFF",
                }}
              >
                {"↑"}
              </Text>
            </View>
          </RNPressable>
        </View>
      </View>

      <InfoTipModal
        visible={showFlipInfo}
        onClose={() => setShowFlipInfo(false)}
        title="Flipbook"
      >
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 15,
            color: "#333333",
            lineHeight: 22,
          }}
        >
          Swipe the card up or down to stroll through your moments in time. Each stop is a surprise slice of your story. When one resonates, tap{" "}
          <Text style={{ fontFamily: "Roboto-Medium" }}>View this moment</Text> to open it fully.
        </Text>
      </InfoTipModal>
    </View>
  );
}
