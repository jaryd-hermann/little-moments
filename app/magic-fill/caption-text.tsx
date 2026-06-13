import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { usePostHog } from "posthog-react-native";
import { useTheme } from "@/hooks/useTheme";
import { PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";
import {
  selectedPhoto,
  useMagicFillStore,
} from "@/store/magicFillStore";
import { DayAssetPreview } from "@/components/capture/DayAssetPreview";
import { MagicFillDatePill } from "@/components/magic-fill/MagicFillDatePill";
import { MagicFillScreenHeader } from "@/components/magic-fill/MagicFillScreenHeader";

const QUICK_STARTS = [
  "Felt like…",
  "Won't forget",
  "Small thing, but",
  "Best part was",
];

const CAPTION_FONT = Platform.select({
  ios: "Helvetica",
  default: "sans-serif",
});

export default function MagicFillCaptionTextScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  const inputRef = useRef<TextInput>(null);
  const drafts = useMagicFillStore((s) => s.drafts);
  const textCaptionIndex = useMagicFillStore((s) => s.textCaptionIndex);
  const setTextCaptionIndex = useMagicFillStore((s) => s.setTextCaptionIndex);
  const setRawCaption = useMagicFillStore((s) => s.setRawCaption);
  const skipDay = useMagicFillStore((s) => s.skipDay);
  const setCaptionMode = useMagicFillStore((s) => s.setCaptionMode);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const activeDrafts = useMemo(
    () => drafts.filter((d) => !d.skipped),
    [drafts]
  );
  const draft = activeDrafts[textCaptionIndex];
  const [text, setText] = useState(draft?.rawCaption ?? "");

  useEffect(() => {
    setText(draft?.rawCaption ?? "");
  }, [draft?.ymd, draft?.rawCaption]);

  useEffect(() => {
    if (draft) return;
    router.replace("/magic-fill/caption-mode");
  }, [draft]);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardVisible(false)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const saveAndAdvance = useCallback(
    (nextIndex: number, captionText: string) => {
      if (draft) {
        setRawCaption(draft.ymd, captionText.trim(), "text");
      }
      if (nextIndex >= activeDrafts.length) {
        posthog.capture("magic_fill_captions_completed", {
          mode: "text",
          count: activeDrafts.length,
        });
        router.push("/magic-fill/processing");
        return;
      }
      setTextCaptionIndex(nextIndex);
    },
    [
      activeDrafts.length,
      draft,
      posthog,
      setRawCaption,
      setTextCaptionIndex,
    ]
  );

  const handleDone = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Keyboard.dismiss();
    saveAndAdvance(textCaptionIndex + 1, text);
  }, [saveAndAdvance, text, textCaptionIndex]);

  const handleSwitchToVoice = useCallback(() => {
    if (draft && text.trim()) {
      setRawCaption(draft.ymd, text.trim(), "text");
    }
    setCaptionMode("voice");
    router.replace("/magic-fill/caption-voice");
  }, [draft, setCaptionMode, setRawCaption, text]);

  if (!draft) {
    return null;
  }

  const photo = selectedPhoto(draft);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <MagicFillScreenHeader />

      <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
        <Text
          style={{
            fontFamily: "Roboto-Medium",
            fontSize: 13,
            color: colors.textSecondary,
            textAlign: "center",
          }}
        >
          {textCaptionIndex + 1} of {activeDrafts.length}
        </Text>
        <View style={{ flexDirection: "row", gap: 4, marginTop: 8 }}>
          {activeDrafts.map((_, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                backgroundColor:
                  i <= textCaptionIndex ? colors.primary : colors.border,
              }}
            />
          ))}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 16,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      >
        <View
          style={{
            width: "100%",
            aspectRatio: 1,
            borderRadius: 16,
            overflow: "hidden",
            marginBottom: 16,
            backgroundColor: colors.surfaceSecondary,
          }}
        >
          {photo ? <DayAssetPreview asset={photo} forceLivePlayback /> : null}
          <MagicFillDatePill
            date={draft.date}
            style={{ position: "absolute", top: 12, left: 12 }}
          />
        </View>

        {!keyboardVisible ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {QUICK_STARTS.map((pill) => (
              <Pressable
                key={pill}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setText((t) => (t ? `${t} ${pill}` : pill));
                  inputRef.current?.focus();
                }}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 9999,
                  backgroundColor: colors.surfaceSecondary,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Roboto-Regular",
                    fontSize: 13,
                    color: colors.text,
                  }}
                >
                  {pill}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.background,
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 10),
        }}
      >
        <Pressable
          onPress={() => {
            skipDay(draft.ymd);
            saveAndAdvance(textCaptionIndex, text);
          }}
          style={{
            alignSelf: "flex-start",
            marginBottom: 8,
            paddingVertical: 4,
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 14,
              color: colors.textMuted,
            }}
          >
            Skip day
          </Text>
        </Pressable>

        <View
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.background,
            paddingHorizontal: 14,
            paddingTop: 10,
            paddingBottom: 8,
          }}
        >
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            placeholder="Speak your mind or type here..."
            placeholderTextColor={colors.textMuted}
            multiline
            scrollEnabled
            textAlignVertical="top"
            autoFocus
            style={{
              fontFamily: CAPTION_FONT,
              fontSize: 16,
              lineHeight: 24,
              color: colors.text,
              minHeight: 44,
              maxHeight: 160,
              paddingVertical: 6,
              paddingHorizontal: 4,
            }}
          />

          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 10,
              marginTop: 8,
            }}
          >
            <Pressable
              onPress={handleSwitchToVoice}
              hitSlop={6}
              accessibilityLabel="Switch to voice captioning"
              style={{
                borderRadius: 10,
                backgroundColor: colors.surfaceSecondary,
                padding: 10,
              }}
            >
              <Ionicons name="mic-outline" size={22} color={colors.icon} />
            </Pressable>

            <Pressable
              onPress={handleDone}
              disabled={!text.trim()}
              hitSlop={6}
              accessibilityLabel="Done with this moment"
              style={{
                borderRadius: 9999,
                backgroundColor: colors.primary,
                borderWidth: 2,
                borderColor: PINK_CTA_BORDER,
                paddingHorizontal: 20,
                paddingVertical: 10,
                opacity: !text.trim() ? 0.45 : 1,
              }}
            >
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 14,
                  color: PINK_CTA_INK,
                  letterSpacing: 0.3,
                  textTransform: "uppercase",
                }}
              >
                Done
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
