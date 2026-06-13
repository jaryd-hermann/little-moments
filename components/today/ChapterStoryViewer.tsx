import { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  Dimensions,
  Modal,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { usePostHog } from "posthog-react-native";
import type { ChapterRecord } from "@/lib/chapters";
import {
  chapterMonthName,
  chapterWeekLabel,
  chapterTotalSlides,
  chapterCardTitle,
} from "@/lib/chapters";
import { ChapterImageSlide } from "./ChapterImageSlide";
import { shareInvite } from "@/lib/inviteShare";
import { markChapterViewed } from "@/lib/views";
import { useTheme } from "@/hooks/useTheme";
import { PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";

const { width: SCREEN_W } = Dimensions.get("window");
const CTA_BG = "#F0D7FF";
const CTA_ICON = "#1A1A1A";

interface ChapterStoryViewerProps {
  visible: boolean;
  chapter: ChapterRecord | null;
  onClose: () => void;
  /** Optional handler for the in-completion "Share chapter" CTA. */
  onShare?: (chapter: ChapterRecord) => void;
}

function RichBody({ text, color }: { text: string; color: string }) {
  const parts = text.split(/(\*[^*]+\*)/g);
  return (
    <Text
      style={{
        textAlign: "center",
        fontSize: 20,
        lineHeight: 32,
        fontFamily: "LibreBaskerville-Regular",
        color,
      }}
    >
      {parts.map((part, i) => {
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
          return (
            <Text key={i} style={{ fontFamily: "LibreBaskerville-Italic" }}>
              {part.slice(1, -1)}
            </Text>
          );
        }
        return part;
      })}
    </Text>
  );
}

export function ChapterStoryViewer({
  visible,
  chapter,
  onClose,
  onShare,
}: ChapterStoryViewerProps) {
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  const { colors } = useTheme();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showComplete, setShowComplete] = useState(false);
  const prevChapterRef = useRef<string | null>(null);

  const totalSlides = chapter ? chapterTotalSlides(chapter) : 0;

  const handleOpen = useCallback(() => {
    if (!chapter) return;
    if (prevChapterRef.current !== chapter.id) {
      setCurrentIndex(0);
      setShowComplete(false);
      prevChapterRef.current = chapter.id;
      posthog.capture("viewed_chapter", {
        chapter_number: chapter.chapter_number,
        ref_month: chapter.ref_month,
        ref_year: chapter.ref_year,
      });
      // First-view tracking: mark `chapters.viewed_at` and fire
      // `chapter_viewed` (different from `viewed_chapter` above which fires on
      // every open). Skip dummy chapters — they don't exist server-side.
      if (
        chapter.viewed_at == null &&
        !chapter.id.startsWith("dummy-")
      ) {
        void markChapterViewed({
          chapterId: chapter.id,
          posthog,
          chapterNumber: chapter.chapter_number,
          refWeekStartDate: chapter.ref_week_start_date,
          createdAt: chapter.created_at,
        });
      }
    }
  }, [chapter, posthog]);

  if (visible && chapter && prevChapterRef.current !== chapter.id) {
    handleOpen();
  }

  if (!chapter) return null;

  const hasImageSlide = !!chapter.image_slide;
  const isLastSlide = currentIndex === totalSlides - 1;

  const goNext = () => {
    if (currentIndex < totalSlides - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      setShowComplete(true);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  };

  const handleTapContent = (x: number) => {
    if (x < SCREEN_W / 3) {
      goPrev();
    } else {
      goNext();
    }
  };

  const handleClose = () => {
    setShowComplete(false);
    setCurrentIndex(0);
    prevChapterRef.current = null;
    onClose();
  };

  const isCover = currentIndex === 0;
  const isImageSlide = hasImageSlide && currentIndex === totalSlides - 1;
  const textSlideIndex = isCover ? -1 : currentIndex - 1;

  const bg = "#0A0A0A";
  const textColor = "#FFFFFF";
  const mutedColor = "rgba(255,255,255,0.5)";
  const barBg = "rgba(255,255,255,0.3)";
  const barFill = "#FFFFFF";

  return (
    <Modal visible={visible} animationType="fade" transparent={false}>
      <View style={{ flex: 1, backgroundColor: bg }}>
        {/* Progress bars */}
        <View
          style={{
            flexDirection: "row",
            gap: 4,
            paddingHorizontal: 16,
            paddingTop: insets.top + 12,
          }}
        >
          {Array.from({ length: totalSlides }).map((_, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: 2,
                borderRadius: 1,
                backgroundColor: barBg,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  height: "100%",
                  borderRadius: 1,
                  backgroundColor: barFill,
                  width: i <= currentIndex ? "100%" : "0%",
                }}
              />
            </View>
          ))}
        </View>

        {/* Close */}
        <Pressable
          onPress={handleClose}
          style={{
            position: "absolute",
            right: 16,
            top: insets.top + 12,
            zIndex: 10,
            width: 32,
            height: 32,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{ fontSize: 18, fontWeight: "bold", color: textColor }}
          >
            ✕
          </Text>
        </Pressable>

        {/* Slide content */}
        {isImageSlide && chapter.image_slide ? (
          <ScrollView
            style={{ flex: 1, marginTop: 16 }}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: 16,
            }}
            showsVerticalScrollIndicator={false}
          >
            <ChapterImageSlide imageSlide={chapter.image_slide} />
          </ScrollView>
        ) : (
          <Pressable
            onPress={(e) => handleTapContent(e.nativeEvent.locationX)}
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 16,
            }}
          >
            {isCover && (
              <View style={{ alignItems: "center", gap: 24 }}>
                <Text
                  style={{
                    fontFamily: "Roboto-Light",
                    fontSize: 12,
                    color: mutedColor,
                    letterSpacing: 3,
                    textTransform: "uppercase",
                  }}
                >
                  Chapter {chapter.chapter_number}
                </Text>

                <Text
                  style={{
                    fontFamily: "LibreBaskerville-Bold",
                    fontSize: 36,
                    lineHeight: 44,
                    color: textColor,
                    textAlign: "center",
                  }}
                >
                  {chapter.ref_week_start_date
                    ? chapterWeekLabel(chapter)
                    : chapter.ref_month != null
                      ? chapterMonthName(chapter.ref_month)
                      : ""}
                </Text>

                <View
                  style={{
                    width: 64,
                    height: 1,
                    backgroundColor: "rgba(255,255,255,0.2)",
                  }}
                />

                <Text
                  style={{
                    fontFamily: "LibreBaskerville-Regular",
                    fontSize: 48,
                    color: textColor,
                  }}
                >
                  {chapter.moment_count}
                </Text>

                <Text
                  style={{
                    fontFamily: "Roboto-Light",
                    fontSize: 14,
                    color: mutedColor,
                    letterSpacing: 0.5,
                  }}
                >
                  moments captured
                </Text>
              </View>
            )}

            {!isCover && !isImageSlide && chapter.slides[textSlideIndex] && (
              <View style={{ paddingHorizontal: 16 }}>
                <RichBody
                  text={chapter.slides[textSlideIndex].body}
                  color={textColor}
                />
              </View>
            )}
          </Pressable>
        )}

        {/* Bottom: dots + CTA circle */}
        <View
          style={{
            paddingBottom: insets.bottom + 12,
            paddingHorizontal: 16,
            gap: 12,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* Dots — centered */}
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                gap: 6,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {Array.from({ length: totalSlides }).map((_, i) => (
                <View
                  key={i}
                  style={{
                    width: i === currentIndex ? 20 : 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor:
                      i === currentIndex
                        ? textColor
                        : "rgba(255,255,255,0.3)",
                  }}
                />
              ))}
            </View>

            {/* CTA circle — right side */}
            <Pressable
              onPress={goNext}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: CTA_BG,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name={isLastSlide ? "checkmark" : "arrow-forward"}
                size={20}
                color={CTA_ICON}
              />
            </Pressable>
          </View>
        </View>

        {/* Completion overlay — rendered inside the same Modal */}
        {showComplete && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              justifyContent: "center",
              paddingHorizontal: 24,
              zIndex: 100,
            }}
          >
            <Pressable
              onPress={handleClose}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0,0,0,0.6)",
              }}
            />
            <View
              style={{
                zIndex: 2,
                borderRadius: 20,
                backgroundColor: colors.surface,
                paddingHorizontal: 24,
                paddingTop: 44,
                paddingBottom: 28,
                borderWidth: 1,
                borderColor: colors.border,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.12,
                shadowRadius: 24,
                elevation: 8,
              }}
            >
              <Pressable
                onPress={handleClose}
                hitSlop={12}
                style={{
                  position: "absolute",
                  top: 12,
                  right: 12,
                  width: 36,
                  height: 36,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="close" size={22} color={colors.text} />
              </Pressable>

              <Text
                style={{
                  fontFamily: "LibreBaskerville-Regular",
                  fontSize: 22,
                  color: colors.text,
                  lineHeight: 30,
                  textAlign: "center",
                }}
              >
                {chapterCardTitle(chapter)}
              </Text>

              <Text
                style={{
                  fontFamily: "LibreBaskerville-Regular",
                  fontSize: 16,
                  color: colors.textSecondary,
                  textAlign: "center",
                  marginTop: 12,
                  lineHeight: 24,
                }}
              >
                Another month in the book.
              </Text>

              <View style={{ marginTop: 28, gap: 12 }}>
                {onShare && (
                  <Pressable
                    onPress={() => {
                      if (!chapter) return;
                      const c = chapter;
                      setShowComplete(false);
                      onShare(c);
                    }}
                    style={{
                      height: 48,
                      borderRadius: 9999,
                      backgroundColor: CTA_BG,
                      borderWidth: 2,
                      borderColor: PINK_CTA_BORDER,
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "row",
                      gap: 8,
                    }}
                  >
                    <Ionicons
                      name="share-outline"
                      size={16}
                      color={PINK_CTA_INK}
                    />
                    <Text
                      style={{
                        fontFamily: "Roboto-Medium",
                        fontSize: 14,
                        color: PINK_CTA_INK,
                        letterSpacing: 0.6,
                        textTransform: "uppercase",
                      }}
                    >
                      Share chapter
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => {
                    handleClose();
                    router.push("/(tabs)/today?capture=1");
                  }}
                  style={{
                    height: 48,
                    borderRadius: 9999,
                    backgroundColor: onShare ? "transparent" : CTA_BG,
                    borderWidth: onShare ? 1.5 : 2,
                    borderColor: onShare ? colors.border : PINK_CTA_BORDER,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Roboto-Medium",
                      fontSize: 14,
                      color: onShare ? colors.text : PINK_CTA_INK,
                      letterSpacing: onShare ? 0.4 : 0.6,
                      textTransform: onShare ? "none" : "uppercase",
                    }}
                  >
                    Capture a moment
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void shareInvite()}
                  style={{
                    height: 48,
                    borderRadius: 9999,
                    borderWidth: 1.5,
                    borderColor: colors.border,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Roboto-Medium",
                      fontSize: 14,
                      color: colors.text,
                      letterSpacing: 0.4,
                    }}
                  >
                    Invite a friend
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}
