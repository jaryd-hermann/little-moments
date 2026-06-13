import { useMemo, useState } from "react";
import {
  Alert,
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
import { useAuthStore } from "@/store/authStore";
import { useEntries } from "@/hooks/useEntries";
import { saveMagicFillBatch } from "@/lib/magicFill";
import { momentTitleStyle } from "@/lib/momentTypography";
import {
  selectedPhoto,
  useMagicFillStore,
} from "@/store/magicFillStore";
import { DayAssetPreview } from "@/components/capture/DayAssetPreview";
import { MagicFillScreenHeader } from "@/components/magic-fill/MagicFillScreenHeader";
import { MagicFillPrimaryButton } from "@/components/magic-fill/MagicFillPrimaryButton";
import { magicFillHeadlineStyle } from "@/lib/magicFillTypography";
import { useSettingsStore } from "@/store/settingsStore";
import { syncMagicFillCompletedToProfile } from "@/lib/magicFillProfileSync";

const THUMB_SIZE = 88;

export default function MagicFillPreviewScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  const userId = useAuthStore((s) => s.user?.id);
  const { fetchEntries } = useEntries();
  const drafts = useMagicFillStore((s) => s.drafts);
  const setDrafts = useMagicFillStore((s) => s.setDrafts);
  const gapTarget = useMagicFillStore((s) => s.gapTarget);
  const captionMode = useMagicFillStore((s) => s.captionMode);
  const setCaptionMode = useMagicFillStore((s) => s.setCaptionMode);
  const setTextCaptionIndex = useMagicFillStore((s) => s.setTextCaptionIndex);
  const setSavedCount = useMagicFillStore((s) => s.setSavedCount);
  const setIsSaving = useMagicFillStore((s) => s.setIsSaving);
  const setGapCountCache = useMagicFillStore((s) => s.setGapCountCache);
  const setHasCompletedMagicFill = useSettingsStore(
    (s) => s.setHasCompletedMagicFill
  );
  const [saving, setSaving] = useState(false);

  const previewDrafts = useMemo(
    () =>
      drafts.filter(
        (d) => !d.skipped && d.rawCaption.trim() && d.title && d.body
      ),
    [drafts]
  );

  const updateDraft = (ymd: string, patch: { title?: string; body?: string }) => {
    setDrafts(
      drafts.map((d) => (d.ymd === ymd ? { ...d, ...patch } : d))
    );
  };

  const handleSave = async () => {
    const missing = drafts.filter(
      (d) => !d.skipped && (!d.rawCaption.trim() || !d.title || !d.body)
    );
    if (missing.length > 0) {
      const idx = drafts.findIndex((d) => d.ymd === missing[0].ymd);
      setCaptionMode("text");
      setTextCaptionIndex(Math.max(0, idx));
      router.push("/magic-fill/caption-text");
      return;
    }

    if (!userId) return;
    setSaving(true);
    setIsSaving(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const result = await saveMagicFillBatch({
        drafts,
        userId,
      });
      await fetchEntries();
      setSavedCount(result.savedCount);
      setHasCompletedMagicFill(true);
      void syncMagicFillCompletedToProfile();
      setGapCountCache(null);
      posthog.capture("magic_fill_saved", {
        count: result.savedCount,
        gap_target: gapTarget,
        mode: captionMode ?? "text",
      });
      if (result.failedYmds.length > 0) {
        Alert.alert(
          "Partial save",
          `${result.savedCount} moments saved. ${result.failedYmds.length} could not be saved.`
        );
      }
      router.replace("/magic-fill/success");
    } catch {
      Alert.alert("Save failed", "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
      setIsSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <MagicFillScreenHeader />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: Math.max(insets.bottom, 16) + 80,
        }}
      >
        <Text
          style={magicFillHeadlineStyle({
            fontSize: 28,
            lineHeight: 34,
            color: colors.text,
            marginBottom: 6,
            marginTop: 4,
          })}
        >
          {previewDrafts.length} moments ready
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 15,
            color: colors.textSecondary,
            marginBottom: 20,
          }}
        >
          Tap any line to tweak it. Then save them to your Capsule.
        </Text>

        {previewDrafts.map((draft) => {
          const photo = selectedPhoto(draft);
          return (
            <View
              key={draft.ymd}
              style={{
                marginBottom: 20,
                borderRadius: 16,
                padding: 14,
                backgroundColor: colors.surface,
                borderWidth: 2,
                borderColor: colors.text,
              }}
            >
              <View style={{ flexDirection: "row", gap: 14 }}>
                <View
                  style={{
                    width: THUMB_SIZE,
                    height: THUMB_SIZE,
                    borderRadius: 10,
                    overflow: "hidden",
                    borderWidth: 2,
                    borderColor: colors.text,
                    backgroundColor: colors.surfaceSecondary,
                  }}
                >
                  {photo ? (
                    <DayAssetPreview asset={photo} forceLivePlayback />
                  ) : null}
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <TextInput
                    value={draft.title ?? ""}
                    onChangeText={(title) => updateDraft(draft.ymd, { title })}
                    style={momentTitleStyle({
                      fontSize: 17,
                      lineHeight: 22,
                      color: colors.text,
                      marginBottom: 6,
                    })}
                  />
                  <TextInput
                    value={draft.body ?? ""}
                    onChangeText={(body) => updateDraft(draft.ymd, { body })}
                    multiline
                    style={{
                      fontFamily: "Roboto-Regular",
                      fontSize: 14,
                      lineHeight: 20,
                      color: colors.textSecondary,
                    }}
                  />
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View
        style={{
          position: "absolute",
          left: 20,
          right: 20,
          bottom: Math.max(insets.bottom, 16),
        }}
      >
        <MagicFillPrimaryButton
          label={`Save ${previewDrafts.length} to Capsule`}
          variant="pink"
          icon={<Ionicons name="checkmark" size={18} color="#1A1A1A" />}
          onPress={() => void handleSave()}
          disabled={saving || previewDrafts.length === 0}
        />
      </View>
    </View>
  );
}
