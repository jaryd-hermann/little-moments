import { CaptureBrowseHeading } from "@/components/capture/CaptureBrowseHeading";
import { PromptWithAccentText } from "@/components/capture/PromptWithAccentText";
import type { MediaAsset } from "@/hooks/useMediaLibrary";
import { useTheme } from "@/hooks/useTheme";
import type { ReflectionQuestionItem } from "@/lib/captureReflectionQuestions";
import { REFLECTION_QUESTIONS } from "@/lib/captureReflectionQuestions";
import { bevelShadow, PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import * as Haptics from "expo-haptics";
import { CaptureDatePill } from "@/components/capture/CaptureDatePill";
import { DayAssetPreview } from "@/components/capture/DayAssetPreview";
import { Image } from "expo-image";
import { usePostHog } from "posthog-react-native";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

const CARD_SIDE_GUTTER = 20;

function loopLogicalIndex(
  page: number,
  segmentLength: number,
  useLoop: boolean
): number {
  if (segmentLength <= 0) return 0;
  if (!useLoop) {
    return Math.min(Math.max(page, 0), segmentLength - 1);
  }
  const N = segmentLength;
  let p = page;
  while (p < N) p += N;
  while (p >= 2 * N) p -= N;
  return p - N;
}

interface CuratorBrowsePanelProps {
  /** Large display line (e.g. Yesterday / Today / weekday) — PM Gothic. */
  headingTitle: string;
  /** Optional inline muted suffix after the title (e.g. ", Jun 8"). */
  headingTitleSecondary?: string;
  /** Optional pill (e.g. moment count) shown next to the chevron. */
  headingTagBubble?: ReactNode;
  /** Hide the internal CaptureBrowseHeading entirely — parent owns it. */
  hideHeading?: boolean;
  onPressChangeDay: () => void;
  dayPhotos: MediaAsset[];
  loadingPhotos: boolean;
  onChoosePhoto: (asset: MediaAsset) => void;
  onStartQuestionCapture: (
    q: ReflectionQuestionItem,
    method: "speaking" | "typing"
  ) => void;
  showBackToBrowse?: boolean;
  onBackToBrowse?: () => void;
  /** Hide day dropdown during onboarding first capture. */
  hideChangeDay?: boolean;
  /** PostHog: capture `question_fallback_shown` for empty days and photo-mode opt-in. */
  analyticsContext?: { target_ymd: string; surface: string };
  /** Increment to open the question carousel from parent (e.g. “Do a prompt instead” from Ellie). */
  forceQuestionModeNonce?: number;
  /**
   * Post-onboarding first capture: friendlier empty-day copy in the dashed banner
   * when there are no photos for the selected day.
   */
  ellieNoPhotosFirstCapture?: boolean;
  /**
   * Hide the dashed "no photos … let's reflect" banner — used on the
   * Capture screen for *today*, where the parent renders a dedicated
   * "Capture with camera" CTA above instead.
   */
  suppressNoPhotosBanner?: boolean;
  /**
   * Launch the native camera (photo or short video). When provided,
   * a "Take a photo/video" secondary CTA appears under the primary
   * "Choose this moment" button. Replaces the previous
   * "Capture with a question instead" CTA now that the question prompt
   * flow is hidden in favour of photo/video capture.
   */
  onCaptureWithCamera?: () => void;
}

export function CuratorBrowsePanel({
  headingTitle,
  headingTitleSecondary,
  headingTagBubble,
  hideHeading = false,
  onPressChangeDay,
  dayPhotos,
  loadingPhotos,
  onChoosePhoto,
  onStartQuestionCapture,
  showBackToBrowse,
  onBackToBrowse,
  hideChangeDay,
  analyticsContext,
  forceQuestionModeNonce = 0,
  ellieNoPhotosFirstCapture = false,
  suppressNoPhotosBanner = false,
  onCaptureWithCamera,
}: CuratorBrowsePanelProps) {
  const { colors, theme } = useTheme();
  const posthog = usePostHog();
  const { width: screenWidth } = useWindowDimensions();
  const PAGE_WIDTH = screenWidth;
  const MAIN_CARD_WIDTH = Math.max(260, screenWidth - 52);
  const MAIN_CARD_HEIGHT = MAIN_CARD_WIDTH;
  const STACK_AREA_HEIGHT = MAIN_CARD_HEIGHT + 44;
  const PEEK_W = MAIN_CARD_WIDTH - 36;
  const PEEK_H = MAIN_CARD_HEIGHT - 28;

  const N = dayPhotos.length;
  const M = REFLECTION_QUESTIONS.length;
  const usePhotoLoop = N > 1;
  const useQuestionLoop = M > 1;
  /** Tighter gap below the “no photos” banner when this day is empty. */
  const questionSlideTopPad = N === 0 ? 2 : 8;

  const photoLoopData = useMemo(
    () => (usePhotoLoop ? [...dayPhotos, ...dayPhotos, ...dayPhotos] : dayPhotos),
    [dayPhotos, usePhotoLoop]
  );

  const questionLoopData = useMemo(
    () =>
      useQuestionLoop
        ? [...REFLECTION_QUESTIONS, ...REFLECTION_QUESTIONS, ...REFLECTION_QUESTIONS]
        : REFLECTION_QUESTIONS,
    [useQuestionLoop]
  );

  const [mode, setMode] = useState<"photos" | "questions">("photos");
  const [photoIndex, setPhotoIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const photoListRef = useRef<FlatList<MediaAsset>>(null);
  const questionListRef = useRef<FlatList<ReflectionQuestionItem>>(null);
  const lastHapticPhotoIdx = useRef(0);
  const lastHapticQuestionIdx = useRef(0);

  const dayKey = analyticsContext?.target_ymd ?? "";
  const prevDayKeyRef = useRef<string | null>(null);
  const wasLoadingRef = useRef(true);

  const dotActive = theme === "dark" ? "#FFFFFF" : "#000000";
  const dotMuted =
    theme === "dark" ? "rgba(255,255,255,0.32)" : "rgba(0,0,0,0.28)";

  useEffect(() => {
    if (loadingPhotos) {
      wasLoadingRef.current = true;
      return;
    }
    const finishedLoad = wasLoadingRef.current;
    wasLoadingRef.current = false;
    const dayChanged = prevDayKeyRef.current !== dayKey;
    if (dayChanged) prevDayKeyRef.current = dayKey;

    if (finishedLoad || dayChanged) {
      setMode("photos");
      lastHapticPhotoIdx.current = 0;
      lastHapticQuestionIdx.current = 0;
    }
  }, [loadingPhotos, dayKey, dayPhotos.length]);

  useEffect(() => {
    if (forceQuestionModeNonce === 0) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (analyticsContext && dayPhotos.length > 0) {
      posthog.capture("question_fallback_shown", {
        reason: "user_opt_in",
        target_ymd: analyticsContext.target_ymd,
        surface: analyticsContext.surface,
        photo_count: dayPhotos.length,
      });
    }
    setMode("questions");
    setQuestionIndex(0);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (M > 1) {
          questionListRef.current?.scrollToOffset({
            offset: M * PAGE_WIDTH,
            animated: false,
          });
        } else {
          questionListRef.current?.scrollToOffset({ offset: 0, animated: false });
        }
      });
    });
  }, [forceQuestionModeNonce]);

  const onPhotoScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const page = Math.round(x / PAGE_WIDTH);
      const logical = loopLogicalIndex(page, N, usePhotoLoop);
      if (logical !== lastHapticPhotoIdx.current) {
        lastHapticPhotoIdx.current = logical;
        void Haptics.selectionAsync();
      }
      setPhotoIndex(logical);
    },
    [PAGE_WIDTH, N, usePhotoLoop]
  );

  const onPhotoMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!usePhotoLoop) return;
      const x = e.nativeEvent.contentOffset.x;
      const page = Math.round(x / PAGE_WIDTH);
      if (page < N) {
        photoListRef.current?.scrollToOffset({
          offset: (page + N) * PAGE_WIDTH,
          animated: false,
        });
      } else if (page >= 2 * N) {
        photoListRef.current?.scrollToOffset({
          offset: (page - N) * PAGE_WIDTH,
          animated: false,
        });
      }
    },
    [N, PAGE_WIDTH, usePhotoLoop]
  );

  const onQuestionScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const page = Math.round(x / PAGE_WIDTH);
      const logical = loopLogicalIndex(page, M, useQuestionLoop);
      if (logical !== lastHapticQuestionIdx.current) {
        lastHapticQuestionIdx.current = logical;
        void Haptics.selectionAsync();
      }
      setQuestionIndex(logical);
    },
    [PAGE_WIDTH, M, useQuestionLoop]
  );

  const onQuestionMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!useQuestionLoop) return;
      const x = e.nativeEvent.contentOffset.x;
      const page = Math.round(x / PAGE_WIDTH);
      if (page < M) {
        questionListRef.current?.scrollToOffset({
          offset: (page + M) * PAGE_WIDTH,
          animated: false,
        });
      } else if (page >= 2 * M) {
        questionListRef.current?.scrollToOffset({
          offset: (page - M) * PAGE_WIDTH,
          animated: false,
        });
      }
    },
    [M, PAGE_WIDTH, useQuestionLoop]
  );

  const inPhotoMode =
    !loadingPhotos && dayPhotos.length > 0 && mode === "photos";
  /**
   * Question prompt flow is temporarily hidden — the Capture experience
   * only surfaces photo/video capture for now. The state machinery is
   * kept intact so we can re-enable it by flipping this flag back to the
   * original expression. (See user request: "hide the question prompt
   * flow and only lean into photo/video".)
   */
  const inQuestionMode = false;

  useEffect(() => {
    if (loadingPhotos || !inPhotoMode) return;
    if (N > 1) {
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          photoListRef.current?.scrollToOffset({
            offset: N * PAGE_WIDTH,
            animated: false,
          });
        });
      });
      return () => cancelAnimationFrame(id);
    }
    photoListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [loadingPhotos, inPhotoMode, dayKey, N, PAGE_WIDTH]);

  useEffect(() => {
    if (loadingPhotos || !inQuestionMode) return;
    if (M > 1) {
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          questionListRef.current?.scrollToOffset({
            offset: M * PAGE_WIDTH,
            animated: false,
          });
        });
      });
      return () => cancelAnimationFrame(id);
    }
    questionListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [loadingPhotos, inQuestionMode, dayKey, M, PAGE_WIDTH, mode]);

  const activePhoto = dayPhotos[photoIndex];
  const activeQuestion = REFLECTION_QUESTIONS[questionIndex];

  const emptyDayFallbackLoggedYmd = useRef<string | null>(null);
  useEffect(() => {
    if (!analyticsContext) return;
    if (loadingPhotos) return;
    if (dayPhotos.length > 0) {
      emptyDayFallbackLoggedYmd.current = null;
      return;
    }
    const ymd = analyticsContext.target_ymd;
    if (emptyDayFallbackLoggedYmd.current === ymd) return;
    emptyDayFallbackLoggedYmd.current = ymd;
    posthog.capture("question_fallback_shown", {
      reason: "no_photos_for_day",
      target_ymd: ymd,
      surface: analyticsContext.surface,
    });
  }, [analyticsContext, loadingPhotos, dayPhotos.length, posthog]);

  const goQuestions = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (analyticsContext && dayPhotos.length > 0) {
      posthog.capture("question_fallback_shown", {
        reason: "user_opt_in",
        target_ymd: analyticsContext.target_ymd,
        surface: analyticsContext.surface,
        photo_count: dayPhotos.length,
      });
    }
    setMode("questions");
    setQuestionIndex(0);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (M > 1) {
          questionListRef.current?.scrollToOffset({
            offset: M * PAGE_WIDTH,
            animated: false,
          });
        } else {
          questionListRef.current?.scrollToOffset({ offset: 0, animated: false });
        }
      });
    });
  };

  const goPhotos = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMode("photos");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (N > 1) {
          photoListRef.current?.scrollToOffset({
            offset: N * PAGE_WIDTH,
            animated: false,
          });
        } else {
          photoListRef.current?.scrollToOffset({ offset: 0, animated: false });
        }
      });
    });
  };

  const accentBg =
    theme === "dark" ? "rgba(212, 165, 216, 0.55)" : "rgba(212, 165, 216, 0.45)";
  /** In-focus prompt card frame (photo cards stay black). */
  const promptFocusBorderColor = theme === "dark" ? "#D9CFC0" : "#000000";
  const serifCard = {
    fontFamily: "LibreBaskerville-Bold",
    fontSize: 22,
    lineHeight: 30,
    color: colors.text,
    textAlign: "center" as const,
  };

  function renderQuestionPeekCard(q: ReflectionQuestionItem) {
    return (
      <View
        style={{
          width: PEEK_W,
          height: PEEK_H,
          borderRadius: 14,
          overflow: "hidden",
          zIndex: 0,
          borderWidth: 2,
          borderColor: "#000000",
          backgroundColor: "#FFFFFF",
          padding: 12,
          justifyContent: "center",
        }}
      >
        <Text
          numberOfLines={4}
          style={{
            fontFamily: "LibreBaskerville-Regular",
            fontSize: 14,
            lineHeight: 20,
            color: "rgba(0,0,0,0.78)",
            textAlign: "center",
          }}
        >
          {q.prompt}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, paddingTop: 4 }}>
      {hideHeading ? null : (
        <CaptureBrowseHeading
          title={headingTitle}
          titleSecondary={headingTitleSecondary}
          tagBubble={headingTagBubble}
          hideChangeDay={hideChangeDay}
          onPressChangeDay={onPressChangeDay}
          topLeftAction={
            showBackToBrowse
              ? { label: "← change", onPress: () => onBackToBrowse?.() }
              : undefined
          }
          titleAccessory={
            inQuestionMode && dayPhotos.length > 0 ? (
              <Pressable onPress={goPhotos} hitSlop={6}>
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 14,
                    color: colors.textSecondary,
                  }}
                >
                  Pick a photo instead
                </Text>
              </Pressable>
            ) : undefined
          }
        />
      )}

      {!loadingPhotos && N === 0 && !suppressNoPhotosBanner ? (
        <View
          style={{
            marginHorizontal: CARD_SIDE_GUTTER,
            marginBottom: 4,
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderRadius: 999,
            backgroundColor:
              theme === "dark" ? "rgba(247, 242, 230, 0.12)" : "#F7F2E6",
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor:
              theme === "dark" ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.32)",
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 14,
              lineHeight: 20,
              color: colors.textSecondary,
              textAlign: "center",
            }}
          >
            {`No photos or videos from ${headingTitle.toLowerCase()}.`}
          </Text>
        </View>
      ) : null}

      {loadingPhotos ? (
        <View
          style={{
            height: STACK_AREA_HEIGHT + 24,
            marginHorizontal: CARD_SIDE_GUTTER,
            borderRadius: 16,
            backgroundColor: colors.surfaceSecondary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Regular",
              color: colors.textMuted,
            }}
          >
            Loading photos…
          </Text>
        </View>
      ) : inPhotoMode ? (
        <>
          <FlatList
            ref={photoListRef}
            data={photoLoopData}
            horizontal
            pagingEnabled
            decelerationRate="fast"
            snapToInterval={PAGE_WIDTH}
            snapToAlignment="start"
            disableIntervalMomentum
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item, index) => `${item.id}-p-${index}`}
            onScroll={onPhotoScroll}
            onMomentumScrollEnd={onPhotoMomentumScrollEnd}
            scrollEventThrottle={16}
            getItemLayout={(_, index) => ({
              length: PAGE_WIDTH,
              offset: PAGE_WIDTH * index,
              index,
            })}
            renderItem={({ item, index: listIndex }) => {
              const prev = photoLoopData[listIndex - 1];
              const next = photoLoopData[listIndex + 1];
              const badgeIdx = usePhotoLoop ? (listIndex % N) + 1 : listIndex + 1;
              const isActivePhoto = usePhotoLoop
                ? listIndex % N === photoIndex
                : listIndex === photoIndex;
              return (
                <View
                  style={{
                    width: PAGE_WIDTH,
                    alignItems: "center",
                    paddingTop: 8,
                  }}
                >
                  <View
                    style={{
                      width: MAIN_CARD_WIDTH + 40,
                      height: STACK_AREA_HEIGHT,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    {prev ? (
                      <View
                        style={{
                          position: "absolute",
                          left: 4,
                          top: 26,
                          width: PEEK_W,
                          height: PEEK_H,
                          borderRadius: 14,
                          overflow: "hidden",
                          opacity: 0.5,
                          zIndex: 0,
                          borderWidth: 1,
                          borderColor: colors.border,
                          backgroundColor: colors.surfaceSecondary,
                        }}
                      >
                        <Image
                          source={{ uri: prev.uri }}
                          style={{ width: "100%", height: "100%" }}
                          contentFit="cover"
                        />
                      </View>
                    ) : null}
                    {next ? (
                      <View
                        style={{
                          position: "absolute",
                          right: 4,
                          top: 26,
                          width: PEEK_W,
                          height: PEEK_H,
                          borderRadius: 14,
                          overflow: "hidden",
                          opacity: 0.5,
                          zIndex: 0,
                          borderWidth: 1,
                          borderColor: colors.border,
                          backgroundColor: colors.surfaceSecondary,
                        }}
                      >
                        <Image
                          source={{ uri: next.uri }}
                          style={{ width: "100%", height: "100%" }}
                          contentFit="cover"
                        />
                      </View>
                    ) : null}
                    <View
                      style={{
                        width: MAIN_CARD_WIDTH,
                        height: MAIN_CARD_HEIGHT,
                        borderRadius: 16,
                        overflow: "hidden",
                        zIndex: 1,
                        borderWidth: 2,
                        borderColor: colors.text,
                        backgroundColor: colors.surfaceSecondary,
                      }}
                    >
                      <DayAssetPreview asset={item} animate={isActivePhoto} />
                      <View
                        style={{
                          position: "absolute",
                          bottom: 12,
                          left: 12,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        {item.mediaType === "video" ? (
                          <View
                            style={{
                              paddingHorizontal: 8,
                              paddingVertical: 6,
                              borderRadius: 9999,
                              backgroundColor: "#FFC100",
                              borderWidth: 2,
                              borderColor: "#000000",
                            }}
                          >
                            <Ionicons name="videocam" size={12} color="#1A1A1A" />
                          </View>
                        ) : null}
                        <CaptureDatePill
                          label={`${format(new Date(item.creationTime), "h:mm a")} · ${badgeIdx}/${N}`}
                        />
                      </View>
                    </View>
                  </View>
                </View>
              );
            }}
          />
          {dayPhotos.length > 1 ? (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                gap: 6,
                marginTop: 12,
              }}
            >
              {dayPhotos.map((_, i) => (
                <View
                  key={i}
                  style={{
                    width: i === photoIndex ? 20 : 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor:
                      i === photoIndex ? dotActive : dotMuted,
                  }}
                />
              ))}
            </View>
          ) : null}
        </>
      ) : inQuestionMode ? (
        <>
          <FlatList
            ref={questionListRef}
            data={questionLoopData}
            horizontal
            pagingEnabled
            decelerationRate="fast"
            snapToInterval={PAGE_WIDTH}
            snapToAlignment="start"
            disableIntervalMomentum
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item, index) => `${item.id}-q-${index}`}
            onScroll={onQuestionScroll}
            onMomentumScrollEnd={onQuestionMomentumScrollEnd}
            scrollEventThrottle={16}
            getItemLayout={(_, index) => ({
              length: PAGE_WIDTH,
              offset: PAGE_WIDTH * index,
              index,
            })}
            renderItem={({ item, index }) => {
              const prev = questionLoopData[index - 1];
              const next = questionLoopData[index + 1];
              const labelNum = useQuestionLoop ? (index % M) + 1 : index + 1;
              const slideQ = useQuestionLoop ? index % M : index;
              return (
                <View
                  style={{
                    width: PAGE_WIDTH,
                    alignItems: "center",
                    paddingTop: questionSlideTopPad,
                  }}
                >
                  <View
                    style={{
                      width: MAIN_CARD_WIDTH + 40,
                      height: STACK_AREA_HEIGHT,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    {prev ? (
                      <View
                        style={{
                          position: "absolute",
                          left: 4,
                          top: 26,
                        }}
                      >
                        {renderQuestionPeekCard(prev)}
                      </View>
                    ) : null}
                    {next ? (
                      <View
                        style={{
                          position: "absolute",
                          right: 4,
                          top: 26,
                        }}
                      >
                        {renderQuestionPeekCard(next)}
                      </View>
                    ) : null}
                    <View
                      style={{
                        width: MAIN_CARD_WIDTH,
                        height: MAIN_CARD_HEIGHT,
                        borderRadius: 16,
                        overflow: "hidden",
                        zIndex: 1,
                        borderWidth: 2,
                        borderColor: promptFocusBorderColor,
                        backgroundColor: colors.surface,
                        paddingHorizontal: 18,
                        paddingTop: 16,
                        paddingBottom: 12,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "Roboto-Medium",
                          fontSize: 10,
                          letterSpacing: 1,
                          color: colors.textMuted,
                          marginBottom: 10,
                        }}
                      >
                        QUESTION {labelNum} OF {M}
                      </Text>
                      <View
                        style={{
                          flex: 1,
                          justifyContent: "center",
                          paddingVertical: 4,
                          minHeight: 0,
                        }}
                      >
                        <PromptWithAccentText
                          prompt={item.prompt}
                          accent={item.promptAccent}
                          serifStyle={serifCard}
                          accentBg={accentBg}
                          accentColor={colors.text}
                        />
                      </View>
                      {M > 1 ? (
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginTop: 6,
                          }}
                        >
                          <View style={{ flexDirection: "row", gap: 5 }}>
                            {REFLECTION_QUESTIONS.map((_, i) => (
                              <View
                                key={i}
                                style={{
                                  width: i === slideQ ? 18 : 5,
                                  height: 5,
                                  borderRadius: 2.5,
                                  backgroundColor:
                                    i === slideQ ? dotActive : dotMuted,
                                }}
                              />
                            ))}
                          </View>
                          <Text
                            style={{
                              fontFamily: "Roboto-Medium",
                              fontSize: 11,
                              letterSpacing: 0.6,
                              color: colors.textMuted,
                            }}
                          >
                            SWIPE ⇄
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            }}
          />
        </>
      ) : null}

      <View
        style={{
          paddingHorizontal: CARD_SIDE_GUTTER,
          marginTop: 20,
          paddingBottom: 24,
        }}
      >
        {inPhotoMode ? (
          <>
            <Pressable
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                if (activePhoto) onChoosePhoto(activePhoto);
              }}
              style={{
                height: 56,
                borderRadius: 9999,
                backgroundColor: colors.primary,
                borderWidth: 2,
                borderColor: PINK_CTA_BORDER,
                alignItems: "center",
                justifyContent: "center",
                ...bevelShadow(theme),
              }}
            >
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 15,
                  color: PINK_CTA_INK,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                }}
              >
                Choose this moment
              </Text>
            </Pressable>
            {onCaptureWithCamera ? (
              <View style={{ alignItems: "center", marginTop: 14 }}>
                <Pressable
                  onPress={() => {
                    void Haptics.impactAsync(
                      Haptics.ImpactFeedbackStyle.Medium
                    );
                    onCaptureWithCamera();
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 9999,
                    borderWidth: 1.5,
                    borderColor: colors.border,
                  }}
                >
                  <Ionicons
                    name="camera-outline"
                    size={20}
                    color={colors.text}
                    style={{ marginRight: 8 }}
                  />
                  <Text
                    style={{
                      fontFamily: "Roboto-Medium",
                      fontSize: 14,
                      color: colors.text,
                    }}
                  >
                    Take a photo/video
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </>
        ) : null}

        {inQuestionMode ? (
          <>
            <Pressable
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onStartQuestionCapture(activeQuestion, "speaking");
              }}
              style={{
                height: 56,
                borderRadius: 9999,
                backgroundColor: colors.primary,
                borderWidth: 2,
                borderColor: PINK_CTA_BORDER,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                ...bevelShadow(theme),
              }}
            >
              <Ionicons name="mic" size={20} color={PINK_CTA_INK} />
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 15,
                  color: PINK_CTA_INK,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                }}
              >
                Start speaking
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onStartQuestionCapture(activeQuestion, "typing");
              }}
              style={{
                height: 48,
                marginTop: 10,
                borderRadius: 9999,
                borderWidth: 1.5,
                borderColor: colors.border,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
              }}
            >
              <Ionicons name="create-outline" size={18} color={colors.text} />
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 15,
                  color: colors.text,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                }}
              >
                Start typing
              </Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </View>
  );
}
