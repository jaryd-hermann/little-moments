import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { usePostHog } from "posthog-react-native";
import { useTheme } from "@/hooks/useTheme";
import { magicFillHeadlineStyle } from "@/lib/magicFillTypography";
import {
  enqueueMagicFillVoiceTranscription,
  flushMagicFillVoiceTranscriptions,
} from "@/lib/magicFillVoiceQueue";
import {
  selectedPhoto,
  useMagicFillStore,
} from "@/store/magicFillStore";
import { DayAssetPreview } from "@/components/capture/DayAssetPreview";
import { MagicFillDatePill } from "@/components/magic-fill/MagicFillDatePill";
import { MagicFillScreenHeader } from "@/components/magic-fill/MagicFillScreenHeader";
import { MagicFillPrimaryButton } from "@/components/magic-fill/MagicFillPrimaryButton";
import {
  ContinuousVoiceCaptionSession,
  type ContinuousVoiceCaptionHandle,
} from "@/components/magic-fill/ContinuousVoiceCaptionSession";
import { VoiceWaveformBars } from "@/components/magic-fill/VoiceWaveformBars";

const SQUARE = Dimensions.get("window").width - 40;

export default function MagicFillCaptionVoiceScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  const drafts = useMagicFillStore((s) => s.drafts);
  const voiceCaptionIndex = useMagicFillStore((s) => s.voiceCaptionIndex);
  const setVoiceCaptionIndex = useMagicFillStore((s) => s.setVoiceCaptionIndex);
  const setRawCaption = useMagicFillStore((s) => s.setRawCaption);
  const markVoiceSegmentCaptured = useMagicFillStore(
    (s) => s.markVoiceSegmentCaptured
  );
  const setVoiceSegmentCaptured = useMagicFillStore(
    (s) => s.setVoiceSegmentCaptured
  );
  const setCaptionMode = useMagicFillStore((s) => s.setCaptionMode);

  const voiceRef = useRef<ContinuousVoiceCaptionHandle>(null);
  const advancingRef = useRef(false);
  const [duration, setDuration] = useState(0);
  const [liveText, setLiveText] = useState("");
  const [busy, setBusy] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [pendingTranscriptions, setPendingTranscriptions] = useState(0);

  const activeDrafts = useMemo(
    () => drafts.filter((d) => !d.skipped),
    [drafts]
  );
  const draft = activeDrafts[voiceCaptionIndex];

  useEffect(() => {
    setLiveText(activeDrafts[voiceCaptionIndex]?.rawCaption ?? "");
  }, [voiceCaptionIndex, activeDrafts]);

  const proceedToProcessing = useCallback(async () => {
    if (!draft || busy || advancingRef.current) return;
    advancingRef.current = true;
    setBusy(true);
    try {
      if (voiceRef.current?.isRecording()) {
        const ymd = draft.ymd;
        const uri = await voiceRef.current.stopForHandoff();
        markVoiceSegmentCaptured(ymd);
        if (uri) {
          setPendingTranscriptions((n) => n + 1);
          void enqueueMagicFillVoiceTranscription(ymd, uri).finally(() =>
            setPendingTranscriptions((n) => Math.max(0, n - 1))
          );
        }
      }
      await flushMagicFillVoiceTranscriptions();
      posthog.capture("magic_fill_captions_completed", {
        mode: "voice",
        count: activeDrafts.length,
      });
      router.push("/magic-fill/processing");
    } finally {
      setBusy(false);
      advancingRef.current = false;
    }
  }, [activeDrafts.length, busy, draft, markVoiceSegmentCaptured, posthog]);

  const handleNextMoment = useCallback(async () => {
    if (!draft || busy || advancingRef.current) return;
    const isLast = voiceCaptionIndex >= activeDrafts.length - 1;

    if (isLast) {
      void proceedToProcessing();
      return;
    }

    advancingRef.current = true;
    setBusy(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const ymd = draft.ymd;
      const uri = await voiceRef.current?.stopForHandoff();
      markVoiceSegmentCaptured(ymd);

      if (uri) {
        setPendingTranscriptions((n) => n + 1);
        void enqueueMagicFillVoiceTranscription(ymd, uri).finally(() =>
          setPendingTranscriptions((n) => Math.max(0, n - 1))
        );
      }

      setVoiceCaptionIndex(voiceCaptionIndex + 1);
      setLiveText("");
      setDuration(0);
      await voiceRef.current?.startSegment();
    } finally {
      setBusy(false);
      advancingRef.current = false;
    }
  }, [
    activeDrafts.length,
    busy,
    draft,
    markVoiceSegmentCaptured,
    proceedToProcessing,
    setVoiceCaptionIndex,
    voiceCaptionIndex,
  ]);

  const handleRestartMoment = useCallback(async () => {
    if (!draft || busy || advancingRef.current) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRawCaption(draft.ymd, "", "voice");
    setVoiceSegmentCaptured(draft.ymd, false);
    setLiveText("");
    setBusy(true);
    try {
      await voiceRef.current?.restartSegment();
    } finally {
      setBusy(false);
    }
  }, [busy, draft, setRawCaption, setVoiceSegmentCaptured]);

  const handleFinishAll = useCallback(async () => {
    await flushMagicFillVoiceTranscriptions();
    const total = activeDrafts.length;
    const captioned = activeDrafts.filter((d) => {
      if (d.ymd === draft?.ymd) {
        return Boolean(liveText.trim() || d.rawCaption.trim() || isRecording);
      }
      return Boolean(d.rawCaption.trim() || d.voiceSegmentCaptured);
    }).length;

    if (captioned < total) {
      Alert.alert(
        `${captioned}/${total} captioned`,
        "Finish now or keep going?",
        [
          { text: "Keep going", style: "cancel" },
          {
            text: "Finish now",
            onPress: () => void proceedToProcessing(),
          },
        ]
      );
      return;
    }
    void proceedToProcessing();
  }, [
    activeDrafts,
    draft?.ymd,
    isRecording,
    liveText,
    proceedToProcessing,
  ]);

  if (!draft) {
    router.replace("/magic-fill/caption-mode");
    return null;
  }

  const photo = selectedPhoto(draft);
  const displayText = liveText || draft.rawCaption;
  const isLast = voiceCaptionIndex >= activeDrafts.length - 1;
  const placeholder = "Keep talking — we'll capture this moment's story.";
  const isTranscribing = pendingTranscriptions > 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <MagicFillScreenHeader
        rightSlot={
          <Pressable
            accessibilityLabel="Switch to text captioning"
            onPress={() => {
              setCaptionMode("text");
              router.replace("/magic-fill/caption-text");
            }}
            hitSlop={8}
          >
            <Ionicons name="keypad-outline" size={22} color={colors.text} />
          </Pressable>
        }
      />

      <View style={{ alignItems: "center", marginBottom: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {isRecording ? (
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: "#EF4444",
              }}
            />
          ) : null}
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 13,
              color: colors.textSecondary,
            }}
          >
            {Math.floor(duration / 60)}:{(duration % 60).toString().padStart(2, "0")}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 200,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            width: SQUARE,
            height: SQUARE,
            alignSelf: "center",
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

        <Text
          style={
            displayText
              ? {
                  fontFamily: "Roboto-Regular",
                  fontSize: 18,
                  lineHeight: 28,
                  color: colors.text,
                  minHeight: 56,
                }
              : magicFillHeadlineStyle({
                  fontSize: 22,
                  lineHeight: 30,
                  color: colors.textMuted,
                  minHeight: 56,
                })
          }
        >
          {displayText || placeholder}
        </Text>

        <VoiceWaveformBars
          isActive={isRecording && !busy}
          barColor={colors.primary}
        />
        {isTranscribing ? (
          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 13,
              color: colors.textMuted,
              textAlign: "center",
              marginTop: 8,
            }}
          >
            Saving prior moments…
          </Text>
        ) : null}
      </ScrollView>

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: Math.max(insets.bottom, 12),
          paddingHorizontal: 20,
          gap: 12,
        }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
        >
          {activeDrafts.map((d, i) => {
            const thumb = selectedPhoto(d);
            const isActive = i === voiceCaptionIndex;
            const isDone = i < voiceCaptionIndex;
            const isUpcoming = i > voiceCaptionIndex;
            return (
              <View
                key={d.ymd}
                style={{
                  alignItems: "center",
                  width: 56,
                  opacity: isActive ? 1 : isDone ? 0.85 : isUpcoming ? 0.35 : 0.5,
                }}
              >
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 10,
                    overflow: "hidden",
                    borderWidth: isActive ? 2 : 0,
                    borderColor: colors.primary,
                  }}
                >
                  {thumb ? (
                    <DayAssetPreview
                      asset={thumb}
                      animate={isActive}
                      forceLivePlayback={isActive}
                    />
                  ) : null}
                  {isActive && isRecording ? (
                    <View
                      style={{
                        position: "absolute",
                        bottom: 4,
                        right: 4,
                        backgroundColor: "rgba(0,0,0,0.55)",
                        borderRadius: 8,
                        padding: 2,
                      }}
                    >
                      <Ionicons name="mic" size={10} color="#FFFFFF" />
                    </View>
                  ) : null}
                  {isDone ? (
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
                      <View
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 13,
                          backgroundColor: "#7C3AED",
                          borderWidth: 2,
                          borderColor: "#000000",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons name="checkmark" size={15} color="#000000" />
                      </View>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </ScrollView>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Pressable
            accessibilityLabel="Restart this moment"
            disabled={busy}
            onPress={() => void handleRestartMoment()}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 9999,
              borderWidth: 1.5,
              borderColor: colors.border,
              opacity: busy ? 0.5 : 1,
            }}
          >
            <Ionicons name="refresh" size={18} color={colors.text} />
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 13,
                color: colors.text,
              }}
            >
              Restart
            </Text>
          </Pressable>

          <View style={{ flex: 1 }}>
            <MagicFillPrimaryButton
              label={isLast ? "Finish" : "Next moment!"}
              variant="pink"
              onPress={() => void handleNextMoment()}
              disabled={busy}
              style={{ alignSelf: "stretch" }}
            />
          </View>

          <Pressable
            accessibilityLabel="Done captioning all moments"
            disabled={busy}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              void handleFinishAll();
            }}
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: colors.surfaceSecondary,
              borderWidth: 1.5,
              borderColor: colors.border,
              alignItems: "center",
              justifyContent: "center",
              opacity: busy ? 0.5 : 1,
            }}
          >
            <Ionicons name="checkmark" size={24} color={colors.text} />
          </Pressable>
        </View>
      </View>

      <ContinuousVoiceCaptionSession
        ref={voiceRef}
        enabled
        onDurationTick={setDuration}
        onRecordingChange={setIsRecording}
      />
    </View>
  );
}
