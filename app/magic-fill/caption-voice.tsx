import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppState,
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
import { magicFillHeadlineStyle, MAGIC_FILL_CTA_FILL } from "@/lib/magicFillTypography";
import { PINK_CTA_INK } from "@/lib/themedShadow";
import {
  enqueueMagicFillVoiceTranscription,
  flushMagicFillVoiceTranscriptions,
} from "@/lib/magicFillVoiceQueue";
import {
  selectedPhotoForDraft,
  displayPhotoAsset,
  videoClipStartForPhoto,
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
import { MagicFillVoiceReadySheet } from "@/components/magic-fill/MagicFillVoiceReadySheet";
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
  const pickedVideoClips = useMagicFillStore((s) => s.pickedVideoClips);

  const voiceRef = useRef<ContinuousVoiceCaptionHandle>(null);
  const advancingRef = useRef(false);
  const [duration, setDuration] = useState(0);
  const [liveText, setLiveText] = useState("");
  const [busy, setBusy] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [pendingTranscriptions, setPendingTranscriptions] = useState(0);
  const [showVoiceReady, setShowVoiceReady] = useState(true);
  const [recordingArmed, setRecordingArmed] = useState(false);

  const activeDrafts = useMemo(
    () => drafts.filter((d) => !d.skipped),
    [drafts]
  );
  const draft = activeDrafts[voiceCaptionIndex];

  useEffect(() => {
    setLiveText(activeDrafts[voiceCaptionIndex]?.rawCaption ?? "");
  }, [voiceCaptionIndex, activeDrafts]);

  const handoffDraftSegment = useCallback(async (target: { ymd: string }) => {
    const existing = useMagicFillStore
      .getState()
      .drafts.find((d) => d.ymd === target.ymd);
    if (existing?.voiceSegmentCaptured) return;

    const uri = await voiceRef.current?.stopForHandoff();
    // Only mark the moment captured once we actually have audio — otherwise a
    // recording that never started (permission, interruption) would be flagged
    // "done" with an empty caption and could never be redone.
    if (!uri) return;
    markVoiceSegmentCaptured(target.ymd);

    // Fire-and-forget: transcription (a network round-trip) runs in the
    // background queue so advancing to the next moment stays instant. We only
    // track a pending counter for the "Saving prior moments…" hint; the actual
    // await happens once at the end via `flushMagicFillVoiceTranscriptions`.
    setPendingTranscriptions((n) => n + 1);
    const job = enqueueMagicFillVoiceTranscription(target.ymd, uri);
    void job.finally(() =>
      setPendingTranscriptions((n) => Math.max(0, n - 1))
    );
  }, [markVoiceSegmentCaptured]);

  const handoffCurrentSegment = useCallback(async () => {
    if (!draft) return;
    await handoffDraftSegment({ ymd: draft.ymd });
  }, [draft, handoffDraftSegment]);

  // If the app is backgrounded mid-recording (incoming call, home button, a
  // notification the user taps), the OS can tear down the audio session and
  // the in-progress clip is lost. Hand it off proactively so whatever was said
  // is preserved instead of silently dropped.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      // Only on a true background transition — "inactive" fires for transient
      // things (Control Center, notification shade) and shouldn't drop the clip.
      if (next === "background" && voiceRef.current?.isRecording()) {
        void handoffCurrentSegment();
      }
    });
    return () => sub.remove();
  }, [handoffCurrentSegment]);

  const proceedToProcessing = useCallback(async () => {
    if (busy || advancingRef.current) return;
    advancingRef.current = true;
    setBusy(true);
    try {
      const state = useMagicFillStore.getState();
      const active = state.drafts.filter((d) => !d.skipped);
      const current = active[state.voiceCaptionIndex];
      if (current && !current.voiceSegmentCaptured) {
        await handoffDraftSegment({ ymd: current.ymd });
      }
      await flushMagicFillVoiceTranscriptions();
      posthog.capture("magic_fill_captions_completed", {
        mode: "voice",
        count: active.length,
      });
      router.push("/magic-fill/processing");
    } finally {
      setBusy(false);
      advancingRef.current = false;
    }
  }, [busy, handoffDraftSegment, posthog]);

  const handleNextMoment = useCallback(async () => {
    if (!draft || busy || advancingRef.current) return;
    const isLast = voiceCaptionIndex >= activeDrafts.length - 1;

    if (isLast) {
      await proceedToProcessing();
      return;
    }

    advancingRef.current = true;
    setBusy(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await handoffCurrentSegment();

      const nextIndex = voiceCaptionIndex + 1;
      setVoiceCaptionIndex(nextIndex);
      setLiveText("");
      setDuration(0);
      // Only arm the mic if the moment we're entering hasn't been captured
      // already (which happens when the user stepped Back and is moving forward
      // again). Revisited moments stay paused so we don't append a duplicate
      // segment — the user can hit Restart to redo them.
      const nextDraft = useMagicFillStore
        .getState()
        .drafts.filter((d) => !d.skipped)[nextIndex];
      if (!nextDraft?.voiceSegmentCaptured) {
        await voiceRef.current?.startSegment();
      }
    } finally {
      setBusy(false);
      advancingRef.current = false;
    }
  }, [
    activeDrafts.length,
    busy,
    draft,
    handoffCurrentSegment,
    proceedToProcessing,
    setVoiceCaptionIndex,
    voiceCaptionIndex,
  ]);

  const handleBackMoment = useCallback(async () => {
    if (busy || advancingRef.current) return;
    // At the first moment, Back leaves the voice flow entirely.
    if (voiceCaptionIndex <= 0) {
      if (router.canGoBack()) router.back();
      else router.replace("/(tabs)/today");
      return;
    }
    advancingRef.current = true;
    setBusy(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      // Preserve whatever was recorded for the current moment before stepping
      // back, then land on the previous moment paused (not recording) so the
      // user can review what they said and hit Restart to redo it.
      await handoffCurrentSegment();
      setVoiceCaptionIndex(voiceCaptionIndex - 1);
      setDuration(0);
    } finally {
      setBusy(false);
      advancingRef.current = false;
    }
  }, [busy, voiceCaptionIndex, handoffCurrentSegment, setVoiceCaptionIndex]);

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
    const total = activeDrafts.length;
    const captioned = activeDrafts.filter((d) => {
      if (d.ymd === draft?.ymd) {
        return Boolean(
          liveText.trim() ||
            d.rawCaption.trim() ||
            isRecording ||
            d.voiceSegmentCaptured
        );
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
    await proceedToProcessing();
  }, [activeDrafts, draft?.ymd, isRecording, liveText, proceedToProcessing]);

  if (!draft) {
    router.replace("/magic-fill/caption-mode");
    return null;
  }

  const photo = selectedPhotoForDraft(draft, pickedVideoClips);
  const photoForPreview = photo
    ? displayPhotoAsset(photo, pickedVideoClips)
    : null;
  const displayText = liveText || draft.rawCaption;
  const isLast = voiceCaptionIndex >= activeDrafts.length - 1;
  const placeholder = "Keep talking — we'll capture this moment's story.";
  const isTranscribing = pendingTranscriptions > 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <MagicFillScreenHeader
        onBack={() => void handleBackMoment()}
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
          {photoForPreview ? (
            <DayAssetPreview
              asset={photoForPreview}
              animate={false}
              videoClipStartSec={videoClipStartForPhoto(
                photo,
                pickedVideoClips
              )}
            />
          ) : null}
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
          barColor={MAGIC_FILL_CTA_FILL}
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
            const thumb = selectedPhotoForDraft(d, pickedVideoClips);
            const thumbDisplay = thumb
              ? displayPhotoAsset(thumb, pickedVideoClips)
              : null;
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
                    borderColor: MAGIC_FILL_CTA_FILL,
                  }}
                >
                  {thumbDisplay ? (
                    <DayAssetPreview
                      asset={thumbDisplay}
                      // Never animate here: an active video/Live Photo player
                      // takes over the audio session and silently stops the
                      // voice recording. Stills keep the mic stable.
                      animate={false}
                      videoClipStartSec={videoClipStartForPhoto(
                        thumb,
                        pickedVideoClips
                      )}
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
                        zIndex: 2,
                      }}
                    >
                      <View
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 13,
                          backgroundColor: MAGIC_FILL_CTA_FILL,
                          borderWidth: 2,
                          borderColor: "#000000",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons name="checkmark" size={15} color={PINK_CTA_INK} />
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
        autoStartRecording={recordingArmed}
        onDurationTick={setDuration}
        onRecordingChange={setIsRecording}
      />

      <MagicFillVoiceReadySheet
        visible={showVoiceReady}
        onRecordingStart={() => setRecordingArmed(true)}
        onDismiss={() => setShowVoiceReady(false)}
      />
    </View>
  );
}
