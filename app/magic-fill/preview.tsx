import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Modal,
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
import { useAuthStore } from "@/store/authStore";
import { useEntries } from "@/hooks/useEntries";
import { saveMagicFillBatch } from "@/lib/magicFill";
import { momentTitleStyle } from "@/lib/momentTypography";
import {
  selectedPhoto,
  useMagicFillStore,
  type MagicFillDraft,
} from "@/store/magicFillStore";
import { DayAssetPreview } from "@/components/capture/DayAssetPreview";
import { MagicFillScreenHeader } from "@/components/magic-fill/MagicFillScreenHeader";
import { MagicFillPrimaryButton } from "@/components/magic-fill/MagicFillPrimaryButton";
import { magicFillHeadlineStyle } from "@/lib/magicFillTypography";
import { useSettingsStore } from "@/store/settingsStore";
import { syncMagicFillCompletedToProfile } from "@/lib/magicFillProfileSync";

const THUMB_SIZE = 88;
const BODY_COLLAPSED_LINES = 4;

function bodyLikelyTruncated(body: string): boolean {
  const text = body.trim();
  if (!text) return false;
  if (text.split("\n").length > BODY_COLLAPSED_LINES) return true;
  return text.length > 140;
}

function MagicFillPreviewBody({
  body,
  expanded,
  onExpand,
  onCollapse,
  onChangeBody,
  colors,
}: {
  body: string;
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onChangeBody: (body: string) => void;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const [truncated, setTruncated] = useState(() => bodyLikelyTruncated(body));
  const showMore = truncated || bodyLikelyTruncated(body);

  const handleTextLayout = useCallback(
    (lineCount: number) => {
      if (!expanded && lineCount >= BODY_COLLAPSED_LINES && body.trim().length > 0) {
        setTruncated(true);
      }
    },
    [body, expanded]
  );

  if (expanded) {
    return (
      <View>
        <TextInput
          value={body}
          onChangeText={onChangeBody}
          multiline
          autoFocus
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 14,
            lineHeight: 20,
            color: colors.textSecondary,
          }}
        />
        {showMore ? (
          <Pressable
            onPress={onCollapse}
            hitSlop={8}
            style={{ marginTop: 4, alignSelf: "flex-start" }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 13,
                color: colors.textMuted,
              }}
            >
              less
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View>
      <Pressable onPress={onExpand} accessibilityRole="button">
        <Text
          numberOfLines={BODY_COLLAPSED_LINES}
          onTextLayout={(e) => handleTextLayout(e.nativeEvent.lines.length)}
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 14,
            lineHeight: 20,
            color: colors.textSecondary,
          }}
        >
          {body}
        </Text>
      </Pressable>
      {showMore ? (
        <Pressable
          onPress={onExpand}
          hitSlop={8}
          style={{ marginTop: 4, alignSelf: "flex-start" }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 13,
              color: "#FFC100",
            }}
          >
            more
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function MagicFillPreviewDraftCard({
  draft,
  onUpdateDraft,
  onRequestRemove,
  colors,
}: {
  draft: MagicFillDraft;
  onUpdateDraft: (patch: { title?: string; body?: string }) => void;
  onRequestRemove: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const [bodyExpanded, setBodyExpanded] = useState(false);
  const photo = selectedPhoto(draft);

  return (
    <View
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
          }}
        >
          <View
            style={{
              flex: 1,
              borderRadius: 10,
              overflow: "hidden",
              borderWidth: 2,
              borderColor: colors.text,
              backgroundColor: colors.surfaceSecondary,
            }}
          >
            {photo ? <DayAssetPreview asset={photo} forceLivePlayback /> : null}
          </View>
          <Pressable
            accessibilityLabel="Remove moment"
            onPress={onRequestRemove}
            hitSlop={6}
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: "rgba(255,255,255,0.92)",
              borderWidth: 1,
              borderColor: "rgba(0,0,0,0.14)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="close" size={14} color="#1A1A1A" />
          </Pressable>
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <TextInput
            value={draft.title ?? ""}
            onChangeText={(title) => onUpdateDraft({ title })}
            style={momentTitleStyle({
              fontSize: 17,
              lineHeight: 22,
              color: colors.text,
              marginBottom: 6,
            })}
          />
          <MagicFillPreviewBody
            body={draft.body ?? ""}
            expanded={bodyExpanded}
            onExpand={() => setBodyExpanded(true)}
            onCollapse={() => setBodyExpanded(false)}
            onChangeBody={(body) => onUpdateDraft({ body })}
            colors={colors}
          />
        </View>
      </View>
    </View>
  );
}

export default function MagicFillPreviewScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  const userId = useAuthStore((s) => s.user?.id);
  const { fetchEntries } = useEntries();
  const drafts = useMagicFillStore((s) => s.drafts);
  const setDrafts = useMagicFillStore((s) => s.setDrafts);
  const skipDay = useMagicFillStore((s) => s.skipDay);
  const gapTarget = useMagicFillStore((s) => s.gapTarget);
  const pickedVideoClips = useMagicFillStore((s) => s.pickedVideoClips);
  const captionMode = useMagicFillStore((s) => s.captionMode);
  const setSavedCount = useMagicFillStore((s) => s.setSavedCount);
  const setIsSaving = useMagicFillStore((s) => s.setIsSaving);
  const setGapCountCache = useMagicFillStore((s) => s.setGapCountCache);
  const setHasCompletedMagicFill = useSettingsStore(
    (s) => s.setHasCompletedMagicFill
  );
  const [saving, setSaving] = useState(false);
  const [removeYmd, setRemoveYmd] = useState<string | null>(null);

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

  const confirmRemove = () => {
    if (!removeYmd) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    skipDay(removeYmd);
    setRemoveYmd(null);
  };

  const handleSave = async () => {
    if (previewDrafts.length === 0) return;
    if (!userId) return;

    setSaving(true);
    setIsSaving(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const result = await saveMagicFillBatch({
        drafts: previewDrafts,
        userId,
        pickedVideoClips,
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

        {previewDrafts.map((draft) => (
          <MagicFillPreviewDraftCard
            key={draft.ymd}
            draft={draft}
            colors={colors}
            onUpdateDraft={(patch) => updateDraft(draft.ymd, patch)}
            onRequestRemove={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setRemoveYmd(draft.ymd);
            }}
          />
        ))}
      </ScrollView>

      <Modal
        visible={removeYmd != null}
        transparent
        animationType="fade"
        onRequestClose={() => setRemoveYmd(null)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.45)",
            justifyContent: "center",
            paddingHorizontal: 28,
          }}
          onPress={() => setRemoveYmd(null)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              borderRadius: 20,
              backgroundColor: colors.background,
              padding: 24,
              borderWidth: 2,
              borderColor: colors.text,
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 18,
                lineHeight: 26,
                color: colors.text,
                marginBottom: 20,
              }}
            >
              Are you sure you want to remove this moment?
            </Text>
            <MagicFillPrimaryButton
              label="Keep moment"
              variant="pink"
              onPress={() => setRemoveYmd(null)}
              style={{ marginBottom: 10 }}
            />
            <Pressable
              onPress={confirmRemove}
              style={{ paddingVertical: 12, alignItems: "center" }}
            >
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 15,
                  color: colors.textMuted,
                }}
              >
                Remove
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

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
