import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Image as RNImage, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { useTheme } from "@/hooks/useTheme";
import type { PromptType } from "@/lib/momentAssist";
import { ThinkingDots } from "@/components/dig-deeper/ThinkingDots";
import { PhotoAccessNudgeCard } from "@/components/common/PhotoAccessNudgeCard";

const APP_ICON = require("@/assets/images/white-icon.png");

interface PromptCardProps {
  promptType: PromptType;
  promptValue: string;
  photoUri?: string;
  photoDate?: number;
  isShuffling?: boolean;
  onShuffle?: () => void;
  /** Photo prompt: shuffle (random roll) vs change (open gallery again). */
  photoControlVariant?: "shuffle" | "change";
  instruction?: string;
  hideHelperText?: boolean;
  /** Extra copy below the photo prompt (e.g. activation shuffle hint). */
  photoFooterNote?: string;
  /** No library access: show the PhotoAccessNudgeCard nudge instead of the photo. */
  photoPermissionBlocked?: boolean;
  onRequestPhotoAccess?: () => void;
  photoAccessButtonLabel?: string;
  /** Optional: invoked when user taps "start with a word instead" inside the photo nudge. */
  onPhotoAccessWordFallback?: () => void;
  /** Notifies parent to show Start speaking/typing: after `photoEllieTypingDelayMs` from mount (activation), or when URI is set (other flows). */
  onPhotoViewportReady?: () => void;
  /**
   * When set (e.g. activation), ThinkingDots run for this many ms from first paint of the photo
   * prompt, then Ellie footer + CTAs — independent of when the random photo URI resolves.
   */
  photoEllieTypingDelayMs?: number;
}

function PhotoImage({ uri }: { uri: string }) {
  const [useRnFallback, setUseRnFallback] = useState(() => uri.startsWith("file://"));

  useEffect(() => {
    setUseRnFallback(uri.startsWith("file://"));
  }, [uri]);

  if (useRnFallback) {
    return (
      <RNImage
        source={{ uri }}
        style={{ width: "100%", aspectRatio: 1 }}
        resizeMode="cover"
      />
    );
  }

  return (
    <Image
      key={uri}
      source={{ uri }}
      style={{ width: "100%", aspectRatio: 1 }}
      contentFit="cover"
      onError={() => {
        console.log("[PromptCard] expo-image failed, trying RN Image for:", uri?.substring(0, 60));
        setUseRnFallback(true);
      }}
    />
  );
}

export function PromptCard({
  promptType,
  promptValue,
  photoUri,
  photoDate,
  isShuffling,
  onShuffle,
  photoControlVariant = "shuffle",
  instruction,
  hideHelperText,
  photoFooterNote,
  photoPermissionBlocked,
  onRequestPhotoAccess,
  photoAccessButtonLabel,
  onPhotoAccessWordFallback,
  onPhotoViewportReady,
  photoEllieTypingDelayMs,
}: PromptCardProps) {
  const { colors } = useTheme();
  const firstPhotoReadyNotifiedRef = useRef(false);
  const [activationPostTypingReveal, setActivationPostTypingReveal] = useState(false);

  const onPhotoViewportReadyRef = useRef(onPhotoViewportReady);
  onPhotoViewportReadyRef.current = onPhotoViewportReady;

  const notifyViewportReadyOnce = useCallback(() => {
    if (firstPhotoReadyNotifiedRef.current) return;
    firstPhotoReadyNotifiedRef.current = true;
    onPhotoViewportReadyRef.current?.();
  }, []);

  /** Activation: fixed 5s typing row from mount — not tied to photo library fetch. */
  useEffect(() => {
    if (!photoEllieTypingDelayMs || photoPermissionBlocked) {
      return;
    }
    const t = setTimeout(() => {
      setActivationPostTypingReveal(true);
      notifyViewportReadyOnce();
    }, photoEllieTypingDelayMs);
    return () => clearTimeout(t);
  }, [photoEllieTypingDelayMs, photoPermissionBlocked, notifyViewportReadyOnce]);

  useEffect(() => {
    if (!photoUri) {
      firstPhotoReadyNotifiedRef.current = false;
    }
  }, [photoUri]);

  /** Today / Add: show CTAs as soon as we have a URI (no waiting on image decode). */
  useEffect(() => {
    if (photoEllieTypingDelayMs || photoPermissionBlocked) return;
    if (photoUri) {
      notifyViewportReadyOnce();
    }
  }, [photoUri, photoEllieTypingDelayMs, photoPermissionBlocked, notifyViewportReadyOnce]);

  if (promptType === "photo") {
    const useTypingDelay = !!photoEllieTypingDelayMs;
    const showLoadingRowBelowCard =
      useTypingDelay && !photoPermissionBlocked && !activationPostTypingReveal;
    const showQuestionRow =
      !photoPermissionBlocked &&
      (useTypingDelay ? activationPostTypingReveal : !!photoUri);

    const showShuffleControl =
      !!onShuffle &&
      !photoPermissionBlocked &&
      !!photoUri &&
      (!useTypingDelay || activationPostTypingReveal);

    return (
      <View style={{ marginBottom: 16 }}>
        <View
          style={{
            borderRadius: 16,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceSecondary,
          }}
        >
          {photoPermissionBlocked ? (
            <View style={{ width: "100%", aspectRatio: 1 }}>
              <PhotoAccessNudgeCard
                variant="compact"
                primaryLabel={photoAccessButtonLabel ?? "CONTINUE"}
                onPrimaryPress={() => onRequestPhotoAccess?.()}
                onWordFallbackPress={onPhotoAccessWordFallback}
              />
            </View>
          ) : photoUri ? (
            <View>
              <PhotoImage uri={photoUri} />
              {photoDate != null && (
                <View
                  style={{
                    position: "absolute",
                    top: 12,
                    left: 12,
                    backgroundColor: "rgba(0,0,0,0.5)",
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "LibreBaskerville-Bold",
                      fontSize: 14,
                      color: "#FFFFFF",
                    }}
                  >
                    {format(new Date(photoDate), "MMM d, yyyy")}
                  </Text>
                </View>
              )}
              {isShuffling && (
                <View
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: "rgba(0,0,0,0.45)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ActivityIndicator size="large" color="#FFFFFF" />
                </View>
              )}
            </View>
          ) : (
            <View
              style={{
                width: "100%",
                aspectRatio: 1,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.surfaceSecondary,
              }}
            >
              <ActivityIndicator size="large" color={colors.primary} />
              <Text
                style={{
                  fontFamily: "Roboto-Regular",
                  fontSize: 15,
                  lineHeight: 24,
                  color: colors.text,
                  textAlign: "center",
                  marginTop: 12,
                  paddingHorizontal: 24,
                }}
              >
                Finding a photo you took
              </Text>
              <Text
                style={{
                  fontFamily: "Roboto-Light",
                  fontSize: 14,
                  lineHeight: 22,
                  color: colors.textMuted,
                  textAlign: "center",
                  marginTop: 6,
                  paddingHorizontal: 24,
                }}
              >
                The first time can take a few seconds
              </Text>
            </View>
          )}
          {showShuffleControl ? (
            <Pressable
              onPress={onShuffle}
              accessibilityLabel={
                photoControlVariant === "change" ? "Change photo" : "Shuffle to another photo"
              }
              hitSlop={8}
              style={{
                position: "absolute",
                bottom: 12,
                right: 12,
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: "rgba(0,0,0,0.55)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name={photoControlVariant === "change" ? "images-outline" : "shuffle"}
                size={20}
                color="#FFFFFF"
              />
            </Pressable>
          ) : null}
        </View>
        {showLoadingRowBelowCard ? (
          <View style={{ marginTop: 10 }}>
            <ThinkingDots />
          </View>
        ) : null}
        {showQuestionRow ? (
          <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 14, paddingRight: 32 }}>
            <RNImage
              source={APP_ICON}
              style={{ width: 28, height: 28, borderRadius: 8, marginRight: 10, marginTop: 2 }}
            />
            <Text
              style={{
                flex: 1,
                fontFamily: "Roboto-Regular",
                fontSize: 15,
                lineHeight: 24,
                color: colors.text,
              }}
            >
              What was this moment?
              {photoFooterNote ? (
                <>
                  {"\n\n"}
                  <Text style={{ fontStyle: "italic" }}>{photoFooterNote}</Text>
                </>
              ) : null}
            </Text>
          </View>
        ) : null}
      </View>
    );
  }

  if (promptType === "word") {
    return (
      <View style={{ marginBottom: 16 }}>
        {instruction && (
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 14,
              color: colors.textMuted,
              textAlign: "center",
              marginBottom: 10,
            }}
          >
            {instruction}
          </Text>
        )}
        <View
          style={{
            borderRadius: 16,
            borderWidth: 1.5,
            borderColor: colors.primary,
            paddingVertical: 28,
            paddingHorizontal: 20,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontFamily: "LibreBaskerville-Bold",
              fontSize: 36,
              color: colors.text,
              textAlign: "center",
              textTransform: "lowercase",
            }}
          >
            {promptValue}
          </Text>
        </View>
        {!hideHelperText && (
          <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 10, paddingRight: 32 }}>
            <RNImage
              source={APP_ICON}
              style={{ width: 28, height: 28, borderRadius: 8, marginRight: 10, marginTop: 2 }}
            />
            <Text
              style={{
                flex: 1,
                fontFamily: "Roboto-Regular",
                fontSize: 15,
                lineHeight: 24,
                color: colors.text,
              }}
            >
              Read the word and let it take you somewhere. What memory or association does it unlock?
            </Text>
          </View>
        )}
      </View>
    );
  }

  // question or freetext
  return (
    <View
      style={{
        marginBottom: 16,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: colors.primary,
        paddingVertical: 20,
        paddingHorizontal: 20,
      }}
    >
      <Text
        style={{
          fontFamily: "LibreBaskerville-Regular",
          fontSize: 18,
          lineHeight: 26,
          color: colors.text,
          textAlign: "center",
        }}
      >
        {promptValue}
      </Text>
    </View>
  );
}
