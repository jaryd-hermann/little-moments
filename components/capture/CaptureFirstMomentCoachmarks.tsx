import {
  coachmarkTargetForStep,
  useCaptureFirstMomentCoachmarkStore,
  type CoachmarkStep,
  type CoachmarkTargetRect,
} from "@/store/captureFirstMomentCoachmarkStore";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BUBBLE_FILL = "#FECFB4";
const BUBBLE_STROKE = "#000000";
const BUBBLE_INK = "#1A1A1A";
const BUBBLE_MAX_WIDTH = 280;

const COPY: Record<CoachmarkStep, string> = {
  1: "Tap this to turn moments into core memories",
  2: "Dig deeper to reflect more on this moment",
  3: "Capture lives here — come back daily to log a moment",
  4: "Capsule holds all your saved moments",
  5: "Chapters turns weeks into stories and movies",
  6: "Connect shows how your moments link together",
};

function computeBubblePosition(
  target: CoachmarkTargetRect,
  bubbleWidth: number,
  bubbleHeight: number,
  screenWidth: number,
  screenHeight: number,
  insets: { top: number; bottom: number },
  step: CoachmarkStep
): { left: number; top: number } {
  const gap = 14;
  const margin = 16;
  const headerClearance = insets.top + 52;
  const preferAbove = step >= 3;
  const preferBelow = step === 1;

  const targetCenterX = target.x + target.width / 2;
  const aboveTop = target.y - bubbleHeight - gap;
  const belowTop = target.y + target.height + gap;

  let top = preferBelow
    ? belowTop
    : preferAbove
      ? aboveTop
      : aboveTop;

  if (!preferBelow && !preferAbove && aboveTop < headerClearance) {
    top = belowTop;
  }

  const maxTop = screenHeight - insets.bottom - bubbleHeight - margin;
  if (preferAbove) {
    top = Math.min(aboveTop, maxTop);
    top = Math.max(headerClearance, top);
  } else if (preferBelow) {
    top = Math.min(belowTop, maxTop);
  } else if (top > maxTop) {
    top = Math.max(headerClearance, aboveTop);
  }

  if (top + bubbleHeight + gap > target.y && top < target.y + target.height) {
    if (preferBelow || target.y + target.height + gap + bubbleHeight <= maxTop) {
      top = target.y + target.height + gap;
    } else {
      top = Math.max(headerClearance, target.y - bubbleHeight - gap);
    }
  }

  let left = targetCenterX - bubbleWidth / 2;
  left = Math.max(margin, Math.min(left, screenWidth - bubbleWidth - margin));

  return { left, top };
}

function CoachmarkBubble({
  target,
  copy,
  step,
  onPress,
}: {
  target: CoachmarkTargetRect;
  copy: string;
  step: CoachmarkStep;
  onPress: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const bubbleWidth = Math.min(BUBBLE_MAX_WIDTH, screenWidth - 32);
  const [bubbleSize, setBubbleSize] = useState({ width: bubbleWidth, height: 96 });

  const position = useMemo(
    () =>
      computeBubblePosition(
        target,
        bubbleWidth,
        bubbleSize.height,
        screenWidth,
        screenHeight,
        insets,
        step
      ),
    [target, bubbleWidth, bubbleSize.height, screenWidth, screenHeight, insets, step]
  );

  const onBubbleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== bubbleSize.width || height !== bubbleSize.height) {
      setBubbleSize({ width, height });
    }
  };

  return (
    <Pressable
      onPress={onPress}
      onLayout={onBubbleLayout}
      style={{
        position: "absolute",
        left: position.left,
        top: position.top,
        width: bubbleWidth,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 14,
        backgroundColor: BUBBLE_FILL,
        borderWidth: 2,
        borderColor: BUBBLE_STROKE,
      }}
    >
      {step === 1 ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <Image
            source={require("@/assets/images/core-untapped.png")}
            style={{ width: 28, height: 28, marginTop: 1, flexShrink: 0 }}
            contentFit="contain"
          />
          <Text
            style={{
              flex: 1,
              flexShrink: 1,
              minWidth: 0,
              fontFamily: "Roboto-Medium",
              fontSize: 14,
              lineHeight: 20,
              color: BUBBLE_INK,
            }}
            numberOfLines={2}
          >
            {copy}
          </Text>
        </View>
      ) : (
        <Text
          style={{
            fontFamily: "Roboto-Medium",
            fontSize: 14,
            lineHeight: 20,
            color: BUBBLE_INK,
          }}
          numberOfLines={2}
        >
          {copy}
        </Text>
      )}
      <Text
        style={{
          marginTop: 8,
          fontFamily: "Roboto-Medium",
          fontSize: 12,
          color: BUBBLE_INK,
          opacity: 0.65,
        }}
      >
        Tap to continue
      </Text>
    </Pressable>
  );
}

function HighlightRing({
  target,
  step,
}: {
  target: CoachmarkTargetRect;
  step: CoachmarkStep;
}) {
  const pad = 6;
  const isPill = step === 2;
  const isTab = step >= 3;
  const height = target.height + pad * 2;
  const borderRadius = isPill || isTab ? height / 2 : 9999;

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: target.x - pad,
        top: target.y - pad,
        width: target.width + pad * 2,
        height,
        borderRadius,
        borderWidth: 2,
        borderColor: "#FFFFFF",
      }}
    />
  );
}

export function CaptureFirstMomentCoachmarks() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const visible = useCaptureFirstMomentCoachmarkStore((s) => s.visible);
  const step = useCaptureFirstMomentCoachmarkStore((s) => s.step);
  const targets = useCaptureFirstMomentCoachmarkStore((s) => s.targets);
  const advance = useCaptureFirstMomentCoachmarkStore((s) => s.advance);
  const dismiss = useCaptureFirstMomentCoachmarkStore((s) => s.dismiss);
  const bumpRemeasure = useCaptureFirstMomentCoachmarkStore(
    (s) => s.bumpRemeasure
  );

  if (!visible) return null;

  const handleTap = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    advance();
  };

  const highlight = coachmarkTargetForStep(step, targets);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <Pressable style={{ flex: 1 }} onPress={handleTap}>
        <View
          pointerEvents="none"
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
          }}
        />
        {highlight ? <HighlightRing target={highlight} step={step} /> : null}
        {highlight ? (
          <CoachmarkBubble
            target={highlight}
            copy={COPY[step]}
            step={step}
            onPress={handleTap}
          />
        ) : (
          <View
            style={{
              position: "absolute",
              left: 24,
              right: 24,
              top: height / 2 - 60,
              padding: 16,
              borderRadius: 14,
              backgroundColor: BUBBLE_FILL,
              borderWidth: 2,
              borderColor: BUBBLE_STROKE,
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 14,
                color: BUBBLE_INK,
                textAlign: "center",
              }}
            >
              {COPY[step]}
            </Text>
            <Pressable
              onPress={() => {
                bumpRemeasure();
                handleTap();
              }}
              style={{ marginTop: 12, alignItems: "center" }}
            >
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 12,
                  color: BUBBLE_INK,
                  opacity: 0.65,
                }}
              >
                Tap to continue
              </Text>
            </Pressable>
          </View>
        )}
        <Pressable
          onPress={() => {
            void Haptics.selectionAsync();
            dismiss();
          }}
          hitSlop={12}
          style={{
            position: "absolute",
            top: insets.top + 12,
            right: 16,
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: "rgba(0,0,0,0.55)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="close" size={18} color="#FFFFFF" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
