import { useState, useEffect, useLayoutEffect, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  Dimensions,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePostHog } from "posthog-react-native";
import { STORY_SLIDES, type StorySlide } from "@/constants/storySlides";
import { useTheme } from "@/hooks/useTheme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const SLIDE_DURATION = 5000;

interface StoryViewerProps {
  visible: boolean;
  onClose: (highestSlide: number) => void;
  initialSlide?: number;
  slides?: StorySlide[];
  /** When this changes while opening, slide index resets (e.g. marketing story slug). */
  viewerKey?: string;
}

export function StoryViewer({
  visible,
  onClose,
  initialSlide = 0,
  slides,
  viewerKey = "default",
}: StoryViewerProps) {
  const { colors, theme } = useTheme();
  const posthog = usePostHog();
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(initialSlide);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const highestRef = useRef(initialSlide);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeSlides = slides ?? STORY_SLIDES;

  const bg = theme === "dark" ? "#0A0A0A" : colors.background;
  const textColor = theme === "dark" ? "#FFFFFF" : "#1A1A1A";
  const mutedColor = theme === "dark" ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)";
  const barBg = theme === "dark" ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.2)";
  const barFill = theme === "dark" ? "#FFFFFF" : "#1A1A1A";

  useLayoutEffect(() => {
    if (visible) {
      setCurrentIndex(initialSlide);
      const len = activeSlides.length;
      highestRef.current = Math.min(initialSlide + 1, len);
      setProgress(0);
      posthog.capture("viewed_marketing_story", { story: viewerKey });
    }
  }, [visible, viewerKey, initialSlide, activeSlides.length]);

  useEffect(() => {
    if (!visible || isPaused) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    setProgress(0);
    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const p = Math.min(elapsed / SLIDE_DURATION, 1);
      setProgress(p);
      if (p >= 1) {
        if (currentIndex < activeSlides.length - 1) {
          setCurrentIndex((prev) => prev + 1);
        } else {
          highestRef.current = activeSlides.length;
          onClose(activeSlides.length);
        }
      }
    }, 50);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [visible, currentIndex, isPaused, activeSlides.length]);

  useEffect(() => {
    if (currentIndex + 1 > highestRef.current) {
      highestRef.current = currentIndex + 1;
    }
  }, [currentIndex]);

  const safeIndex = Math.min(
    currentIndex,
    Math.max(0, activeSlides.length - 1)
  );
  const slide = activeSlides[safeIndex];

  const handleTap = (x: number) => {
    if (x < SCREEN_WIDTH / 3) {
      if (currentIndex > 0) setCurrentIndex((prev) => prev - 1);
    } else {
      if (currentIndex < activeSlides.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        highestRef.current = activeSlides.length;
        onClose(activeSlides.length);
      }
    }
  };

  const handleClose = () => {
    onClose(highestRef.current);
  };

  return (
    <Modal
      key={viewerKey}
      visible={visible}
      animationType="fade"
      transparent={false}
    >
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
          {activeSlides.map((_, i) => (
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
                  width:
                    i < currentIndex
                      ? "100%"
                      : i === currentIndex
                        ? `${progress * 100}%`
                        : "0%",
                }}
              />
            </View>
          ))}
        </View>

        {/* Close button */}
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
          <Text style={{ fontSize: 18, fontWeight: "bold", color: textColor }}>
            ✕
          </Text>
        </Pressable>

        {/* Slide content */}
        <Pressable
          onPress={(e) => handleTap(e.nativeEvent.locationX)}
          onLongPress={() => setIsPaused(true)}
          onPressOut={() => setIsPaused(false)}
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 32,
          }}
        >
          {slide.emoji ? (
            <Text style={{ fontSize: 72 }}>{slide.emoji}</Text>
          ) : null}
          <Text
            style={{
              marginTop: 32,
              textAlign: "center",
              fontSize: 28,
              fontFamily: "LibreBaskerville-Bold",
              color: textColor,
            }}
          >
            {slide.title}
          </Text>
          <Text
            style={{
              marginTop: 16,
              textAlign: "center",
              fontSize: 17,
              lineHeight: 28,
              fontFamily: "Roboto-Regular",
              color: theme === "dark" ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.7)",
            }}
          >
            {slide.body}
          </Text>
        </Pressable>

        {/* Slide counter */}
        <Text
          style={{
            paddingBottom: insets.bottom + 16,
            textAlign: "center",
            fontSize: 13,
            fontFamily: "Roboto-Light",
            color: mutedColor,
          }}
        >
          {currentIndex + 1} / {activeSlides.length}
        </Text>
      </View>
    </Modal>
  );
}
