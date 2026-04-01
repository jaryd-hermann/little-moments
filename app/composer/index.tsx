import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Keyboard,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { RichEditor, RichToolbar, actions } from "react-native-pell-rich-editor";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { usePostHog } from "posthog-react-native";
import { format, parse } from "date-fns";
import { RichTextEditor } from "@/components/composer/RichTextEditor";
import {
  MediaAttachmentBar,
  type MediaItem,
} from "@/components/composer/MediaAttachmentBar";
import { MicRecorder } from "@/components/composer/MicRecorder";
import { PromptSheet } from "@/components/composer/PromptSheet";
import { DatePrecisionPicker } from "@/components/composer/DatePrecisionPicker";
import { useEntries } from "@/hooks/useEntries";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/store/authStore";
import { useEntryStore, type EntryMedia } from "@/store/entryStore";
import { useMomentCelebrationStore } from "@/store/momentCelebrationStore";
import { uploadEntryMedia, deleteEntryMedia } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { getEntryMediaDisplayUri } from "@/lib/entryMediaUrl";
import {
  plainTextToComposerHtml,
  takeDigDeeperPendingResult,
} from "@/lib/digDeeperReturn";
import { useDraftStore } from "@/store/draftStore";

const MAX_ATTACHMENTS = 5;
/** Bottom dock height (gallery + optional toolbar + action row); scroll padding so content clears it. */
const COMPOSER_DOCK_ESTIMATE = 152;
const APP_ICON = require("@/assets/images/icon.png");

type Precision = "exact" | "month_only" | "year_only";

/** `new Date("yyyy-MM-dd")` is UTC midnight → wrong local calendar day; parse as local date. */
function initialComposerDate(dateParam: string | undefined): Date {
  if (!dateParam) return new Date();
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return parse(dateParam, "yyyy-MM-dd", new Date());
  }
  const ms = Date.parse(dateParam);
  return Number.isNaN(ms) ? new Date() : new Date(ms);
}

export default function ComposerScreen() {
  const { colors, theme } = useTheme();
  const posthog = usePostHog();
  const params = useLocalSearchParams<{
    date?: string;
    entryId?: string;
    photoUri?: string;
    isCrashAndBurn?: string;
  }>();

  const { saveEntry, editEntry, fetchEntries, isLoading } = useEntries();
  const user = useAuthStore((s) => s.user);
  const entries = useEntryStore((s) => s.entries);

  const rawEntryId = params.entryId;
  const entryIdParam =
    typeof rawEntryId === "string"
      ? rawEntryId
      : Array.isArray(rawEntryId)
        ? rawEntryId[0]
        : undefined;

  const rawPhotoUri = params.photoUri;
  const photoUriParam =
    typeof rawPhotoUri === "string"
      ? rawPhotoUri
      : Array.isArray(rawPhotoUri)
        ? rawPhotoUri[0]
        : undefined;

  const editingEntry = useMemo(
    () =>
      entryIdParam
        ? (entries.find((e) => e.id === entryIdParam) ?? null)
        : null,
    [entryIdParam, entries]
  );
  const nextMomentNumber = useMemo(
    () => entries.filter((e) => e.entry_type === "moment").length + 1,
    [entries]
  );
  const insets = useSafeAreaInsets();
  const [keyboardShift, setKeyboardShift] = useState(0);

  useEffect(() => {
    const showEvt =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const subShow = Keyboard.addListener(showEvt, (e) => {
      setKeyboardShift(e.endCoordinates.height);
    });
    const subHide = Keyboard.addListener(hideEvt, () => {
      setKeyboardShift(0);
    });
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);
  const editorRef = useRef<RichEditor>(null);
  const titleRef = useRef<TextInput>(null);

  const rawDateParam = params.date;
  const dateParam =
    typeof rawDateParam === "string"
      ? rawDateParam
      : Array.isArray(rawDateParam)
        ? rawDateParam[0]
        : undefined;

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [media, setMedia] = useState<MediaItem[]>(() =>
    entryIdParam
      ? []
      : photoUriParam
        ? [{ uri: photoUriParam, type: "image" }]
        : []
  );
  const [editLoaded, setEditLoaded] = useState(!entryIdParam);
  const initialAttachmentIdsRef = useRef<string[]>([]);
  const [date, setDate] = useState(() => initialComposerDate(dateParam));
  const [precision, setPrecision] = useState<Precision>("exact");
  const [showPrompts, setShowPrompts] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showFormatting, setShowFormatting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [micFullscreen, setMicFullscreen] = useState(false);
  const [originalText, setOriginalText] = useState<{ title: string; body: string } | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);

  const dateKey = useMemo(() => format(date, "yyyy-MM-dd"), [date]);

  useEffect(() => {
    if (entryIdParam || draftLoaded) return;
    const draft = useDraftStore.getState().getDraft(dateKey);
    if (draft) {
      setTitle(draft.title);
      setBody(draft.body);
      setPrecision(draft.precision);
      setMedia(draft.media.map((m) => ({ uri: m.uri, type: m.type })));
      requestAnimationFrame(() => {
        editorRef.current?.setContentHTML(draft.body);
      });
    }
    setDraftLoaded(true);
  }, [entryIdParam, dateKey, draftLoaded]);

  useEffect(() => {
    setDate(initialComposerDate(dateParam));
  }, [dateParam]);

  useEffect(() => {
    if (entryIdParam) return;
    const timer = setTimeout(() => {
      titleRef.current?.focus();
    }, 400);
    return () => clearTimeout(timer);
  }, [entryIdParam]);

  useEffect(() => {
    if (!entryIdParam) return;
    if (editingEntry) return;
    void fetchEntries();
  }, [entryIdParam, editingEntry, fetchEntries]);

  useEffect(() => {
    if (!entryIdParam) {
      setEditLoaded(true);
      initialAttachmentIdsRef.current = [];
      return;
    }
    if (!editingEntry) {
      return;
    }
    setTitle(editingEntry.title ?? "");
    setBody(editingEntry.body);
    setPrecision(editingEntry.date_precision);
    if (editingEntry.entry_date) {
      setDate(parse(editingEntry.entry_date, "yyyy-MM-dd", new Date()));
    } else {
      setDate(
        new Date(
          editingEntry.entry_year,
          (editingEntry.entry_month ?? 1) - 1,
          1
        )
      );
    }
    const sorted = [...(editingEntry.media ?? [])].sort(
      (a, b) => a.display_order - b.display_order
    );
    setMedia(
      sorted.map((m) => ({
        uri: getEntryMediaDisplayUri(m),
        type: m.media_type,
        existingId: m.id,
      }))
    );
    initialAttachmentIdsRef.current = sorted.map((m) => m.id);
    setEditLoaded(true);
  }, [entryIdParam, editingEntry]);

  useEffect(() => {
    if (!entryIdParam || editingEntry || isLoading) return;
    setEditLoaded(true);
  }, [entryIdParam, editingEntry, isLoading]);

  useEffect(() => {
    if (!entryIdParam) {
      posthog.capture("started_adding_moment");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const pending = takeDigDeeperPendingResult();
      if (!pending?.enhancedBody?.trim()) return;
      const html = plainTextToComposerHtml(pending.enhancedBody.trim());
      setBody(html);
      if (pending.enhancedTitle) {
        setTitle(pending.enhancedTitle);
      }
      if (pending.originalBody || pending.originalTitle) {
        setOriginalText({
          title: pending.originalTitle,
          body: pending.originalBody,
        });
        setShowOriginal(false);
      }
      requestAnimationFrame(() => {
        editorRef.current?.setContentHTML(html);
      });
    }, [])
  );

  const openGallery = async () => {
    if (media.length >= MAX_ATTACHMENTS) {
      Alert.alert("Limit reached", `You can attach up to ${MAX_ATTACHMENTS} items.`);
      return;
    }

    posthog.capture("added_photo_to_moment");
    const remaining = MAX_ATTACHMENTS - media.length;

    let result: ImagePicker.ImagePickerResult | null = null;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        allowsMultipleSelection: remaining > 1,
        selectionLimit: remaining,
        quality: 1,
      });
    } catch {
      // PHPicker multi-select can fail on certain images; fall back to single selection
      try {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images", "videos"],
          allowsMultipleSelection: false,
          quality: 1,
        });
      } catch {
        Alert.alert(
          "Couldn't load photo",
          "This image format isn't supported. Try selecting a different photo."
        );
        return;
      }
    }

    if (result && !result.canceled) {
      setMedia((prev) => [
        ...prev,
        ...result.assets.map((a) => ({
          uri: a.uri,
          type: (a.type === "video" ? "video" : "image") as "image" | "video",
        })),
      ]);
    }
  };

  const handleClose = () => {
    if (!entryIdParam && (body.trim() || title.trim())) {
      useDraftStore.getState().saveDraft(dateKey, {
        title,
        body,
        media: media.map((m) => ({ uri: m.uri, type: m.type })),
        dateISO: format(date, "yyyy-MM-dd"),
        precision,
        isCrashAndBurn: params.isCrashAndBurn === "true",
        savedAt: Date.now(),
      });
    }
    router.back();
  };

  const handleSave = async () => {
    if (!body.trim()) return;
    if (!user) return;

    setIsSaving(true);
    const isMomentEntry = params.isCrashAndBurn !== "true";
    const isEditing = !!entryIdParam;
    const celebrationNth =
      !isEditing && isMomentEntry ? nextMomentNumber : null;

    try {
      const entryDate =
        precision === "exact" ? format(date, "yyyy-MM-dd") : null;

      if (isEditing && entryIdParam) {
        const snapshot = useEntryStore
          .getState()
          .entries.find((e) => e.id === entryIdParam);
        if (!snapshot) {
          throw new Error("Moment not found.");
        }

        await editEntry(entryIdParam, {
          title: title.trim() || null,
          body: body.trim(),
          entry_date: entryDate,
          entry_month:
            precision !== "year_only" ? date.getMonth() + 1 : null,
          entry_year: date.getFullYear(),
          date_precision: precision,
        });

        const keptIds = new Set(
          media
            .map((m) => m.existingId)
            .filter((id): id is string => !!id)
        );

        const mediaById = new Map(
          (snapshot.media ?? []).map((m) => [m.id, m])
        );
        const rebuilt: EntryMedia[] = [];

        try {
          for (const id of initialAttachmentIdsRef.current) {
            if (keptIds.has(id)) continue;
            const row = snapshot.media?.find((m) => m.id === id);
            if (row?.storage_path) {
              try {
                await deleteEntryMedia(row.storage_path);
              } catch {
                /* storage may already be gone */
              }
              await supabase.from("entry_media").delete().eq("id", id);
            }
          }

          for (let i = 0; i < media.length; i++) {
            const item = media[i];
            if (item.existingId) {
              const row = mediaById.get(item.existingId);
              if (!row) continue;
              if (row.display_order !== i) {
                const { error: ordErr } = await supabase
                  .from("entry_media")
                  .update({ display_order: i })
                  .eq("id", item.existingId);
                if (ordErr) throw ordErr;
              }
              rebuilt.push({ ...row, display_order: i });
            } else {
              const { publicUrl, storagePath } = await uploadEntryMedia(
                user.id,
                entryIdParam,
                item.uri,
                item.type
              );
              const { data: row, error: mediaErr } = await supabase
                .from("entry_media")
                .insert({
                  entry_id: entryIdParam,
                  user_id: user.id,
                  storage_path: storagePath,
                  storage_url: publicUrl,
                  media_type: item.type,
                  display_order: i,
                })
                .select()
                .single();
              if (mediaErr) throw mediaErr;
              if (row) rebuilt.push(row as EntryMedia);
            }
          }
          useEntryStore.getState().updateEntry(entryIdParam, {
            media: rebuilt,
          });
        } catch {
          await fetchEntries();
          Alert.alert(
            "Updated without photo",
            "Your changes were saved, but a photo could not be updated. You can try again from this moment."
          );
        }

        if (entryDate) {
          useEntryStore.getState().setSelectedDate(
            parse(entryDate, "yyyy-MM-dd", new Date())
          );
        }
        const todayStr = format(new Date(), "yyyy-MM-dd");
        if (entryDate === todayStr) {
          const merged = useEntryStore
            .getState()
            .entries.find((e) => e.id === entryIdParam);
          if (merged) useEntryStore.getState().setTodayEntry(merged);
        }

        useDraftStore.getState().clearDraft(dateKey);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
        router.dismissTo("/(tabs)/today");
        return;
      }

      const entry = await saveEntry({
        title: title.trim() || null,
        body: body.trim(),
        ai_enhanced_body: null,
        original_body: null,
        entry_type:
          params.isCrashAndBurn === "true"
            ? "crash_and_burn"
            : "moment",
        entry_date: entryDate,
        entry_month:
          precision !== "year_only" ? date.getMonth() + 1 : null,
        entry_year: date.getFullYear(),
        date_precision: precision,
        word_of_day: null,
        ai_conversation: null,
        is_ai_enhanced: false,
        streak_day_number: null,
      });

      const insertedMedia: EntryMedia[] = [];
      if (media.length > 0 && entry) {
        try {
          for (let i = 0; i < media.length; i++) {
            const item = media[i];
            const { publicUrl, storagePath } = await uploadEntryMedia(
              user.id,
              entry.id,
              item.uri,
              item.type
            );
            const { data: row, error: mediaErr } = await supabase
              .from("entry_media")
              .insert({
                entry_id: entry.id,
                user_id: user.id,
                storage_path: storagePath,
                storage_url: publicUrl,
                media_type: item.type,
                display_order: i,
              })
              .select()
              .single();
            if (mediaErr) throw mediaErr;
            if (row) insertedMedia.push(row as EntryMedia);
          }
          if (insertedMedia.length > 0) {
            useEntryStore.getState().updateEntry(entry.id, {
              media: insertedMedia,
            });
          }
        } catch {
          Alert.alert(
            "Saved without photo",
            "Your story was saved, but a photo could not be attached. You can add it later from your entry."
          );
        }
      }

      if (entry.entry_date) {
        useEntryStore.getState().setSelectedDate(
          parse(entry.entry_date, "yyyy-MM-dd", new Date())
        );
      }
      const todayStr = format(new Date(), "yyyy-MM-dd");
      if (entry.entry_date === todayStr) {
        const merged = useEntryStore
          .getState()
          .entries.find((e) => e.id === entry.id);
        if (merged) useEntryStore.getState().setTodayEntry(merged);
      }

      useDraftStore.getState().clearDraft(dateKey);
      posthog.capture("shared_daily_moment", {
        has_photo: media.length > 0,
        entry_type: params.isCrashAndBurn === "true" ? "crash_and_burn" : "moment",
      });
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
      router.dismissTo("/(tabs)/today");
      if (celebrationNth != null) {
        setTimeout(() => {
          useMomentCelebrationStore.getState().show(celebrationNth);
        }, 320);
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" &&
              err !== null &&
              "message" in err &&
              typeof (err as { message: unknown }).message === "string"
            ? (err as { message: string }).message
            : "Failed to save entry. Please try again.";
      Alert.alert("Error", message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDigDeeper = () => {
    if (!body.trim()) return;
    router.push({
      pathname: "/dig-deeper",
      params: {
        title,
        body,
        isCrashAndBurn: params.isCrashAndBurn ?? "false",
      },
    });
  };

  if (micFullscreen) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.background }}
        edges={["top"]}
      >
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={0}
        >
          <View style={{ flex: 1, opacity: 0.3, paddingHorizontal: 20, paddingTop: 16 }}>
            {title ? (
              <Text style={{ fontFamily: "LibreBaskerville-Bold", fontSize: 22, color: colors.text }}>
                {title}
              </Text>
            ) : null}
            {body ? (
              <Text style={{ fontFamily: "LibreBaskerville-Regular", fontSize: 14, color: colors.textSecondary, marginTop: 8 }} numberOfLines={6}>
                {body.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim()}
              </Text>
            ) : null}
          </View>

          <View
            style={{
              height: "50%",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              backgroundColor: colors.background,
              overflow: "hidden",
            }}
          >
            <MicRecorder
              fullscreen
              onTranscription={(text) => {
                setBody((prev) => (prev ? prev + " " + text : text));
                setMicFullscreen(false);
              }}
              onCancel={() => setMicFullscreen(false)}
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["top"]}
    >
      {/* Header — outside keyboard shift so it stays pinned */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          paddingHorizontal: 20,
          paddingVertical: 12,
        }}
      >
        <View style={{ width: 88, justifyContent: "center" }}>
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 13,
              color: colors.textSecondary,
              letterSpacing: 0.2,
            }}
            numberOfLines={1}
          >
            {entryIdParam ? "Edit moment" : `Moment #${nextMomentNumber}`}
          </Text>
        </View>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Pressable
            onPress={() => setShowDatePicker(true)}
            style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                color: colors.text,
                textDecorationLine: "underline",
                textAlign: "center",
              }}
            >
              {precision === "exact"
                ? format(date, "EEEE, MMMM d")
                : precision === "month_only"
                  ? format(date, "MMMM yyyy")
                  : format(date, "yyyy")}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          </Pressable>
        </View>
        <View style={{ width: 88, alignItems: "flex-end" }}>
          <Pressable onPress={handleClose} hitSlop={8}>
            <Ionicons name="close" size={24} color={colors.icon} />
          </Pressable>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <ScrollView
          className="flex-1"
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom:
              24 +
              COMPOSER_DOCK_ESTIMATE +
              (keyboardShift > 0 ? keyboardShift : insets.bottom),
            flexGrow: 1,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <TextInput
            ref={titleRef}
            value={title}
            onChangeText={setTitle}
            placeholder="Give this moment a title..."
            placeholderTextColor={colors.textMuted}
            style={{
              marginTop: 16,
              paddingHorizontal: 0,
              fontFamily: "LibreBaskerville-Bold",
              fontSize: 22,
              color: colors.text,
              textAlign: "left",
            }}
            multiline={false}
          />

          <View className="mt-4 flex-1" style={{ minHeight: 250 }}>
            {entryIdParam && !editLoaded ? (
              <View
                style={{
                  flex: 1,
                  minHeight: 200,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ActivityIndicator color={colors.textMuted} />
              </View>
            ) : (
              <RichTextEditor
                key={entryIdParam ?? "new"}
                ref={editorRef}
                initialContent={body}
                placeholder="What happened? What did you notice?"
                onChange={setBody}
              />
            )}

            {originalText && (
              <View style={{ marginTop: 20, paddingHorizontal: 4 }}>
                <Pressable
                  onPress={() => setShowOriginal((v) => !v)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingVertical: 6,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Roboto-Medium",
                      fontSize: 11,
                      color: colors.textMuted,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                    }}
                  >
                    ORIGINAL
                  </Text>
                  <Ionicons
                    name={showOriginal ? "chevron-up" : "chevron-down"}
                    size={14}
                    color={colors.textMuted}
                  />
                </Pressable>
                {showOriginal && (
                  <View
                    style={{
                      marginTop: 6,
                      borderRadius: 12,
                      backgroundColor: colors.surfaceSecondary,
                      padding: 14,
                    }}
                  >
                    {originalText.title ? (
                      <Text
                        style={{
                          fontFamily: "LibreBaskerville-Bold",
                          fontSize: 14,
                          color: colors.textSecondary,
                          marginBottom: 8,
                        }}
                      >
                        {originalText.title}
                      </Text>
                    ) : null}
                    <Text
                      style={{
                        fontFamily: "Roboto-Regular",
                        fontSize: 14,
                        lineHeight: 22,
                        color: colors.textSecondary,
                      }}
                    >
                      {originalText.body
                        .replace(/<[^>]*>/g, "")
                        .replace(/&nbsp;/g, " ")
                        .replace(/&amp;/g, "&")
                        .replace(/\s+/g, " ")
                        .trim()}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </ScrollView>

        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: colors.background,
            transform: [{ translateY: -keyboardShift }],
            paddingBottom: keyboardShift > 0 ? 4 : insets.bottom,
          }}
        >
          <View style={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 6 }}>
            <MediaAttachmentBar
              compact
              leading={
                <Pressable
                  onPress={openGallery}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: colors.surface,
                    borderWidth: 2,
                    borderColor: theme === "dark" ? "#FFFFFF" : colors.border,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name="images-outline"
                    size={18}
                    color={colors.text}
                  />
                </Pressable>
              }
              media={media}
              onRemoveMedia={(index) =>
                setMedia((prev) => prev.filter((_, i) => i !== index))
              }
              resolveDbMedia={(existingId) =>
                editingEntry?.media?.find((m) => m.id === existingId)
              }
            />
          </View>

          {showFormatting && (
            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              <RichToolbar
                editor={editorRef}
                selectedIconTint={colors.primary}
                iconTint={colors.textMuted}
                actions={[
                  actions.setBold,
                  actions.setItalic,
                  actions.setUnderline,
                  actions.insertBulletsList,
                  actions.insertOrderedList,
                ]}
                style={{
                  backgroundColor: colors.surface,
                  height: 42,
                }}
              />
            </View>
          )}

          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: colors.border,
              backgroundColor: colors.background,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 20,
                paddingVertical: 6,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Pressable
                  onPress={() => setShowPrompts(true)}
                  style={{
                    borderRadius: 8,
                    backgroundColor: "#1A1A1A",
                    padding: 8,
                  }}
                >
                  <Ionicons
                    name="bulb-outline"
                    size={20}
                    color="rgba(255, 255, 255, 0.5)"
                  />
                </Pressable>

                <Pressable
                  onPress={() => {
                    posthog.capture("uses_voice_transcribe", { source: "composer" });
                    setMicFullscreen(true);
                  }}
                  style={{
                    borderRadius: 8,
                    backgroundColor: colors.surfaceSecondary,
                    padding: 8,
                  }}
                >
                  <Ionicons
                    name="mic-outline"
                    size={20}
                    color={colors.textMuted}
                  />
                </Pressable>

                <Pressable
                  onPress={() => setShowFormatting((v) => !v)}
                  style={{
                    borderRadius: 8,
                    padding: 8,
                    backgroundColor: showFormatting
                      ? colors.primaryLight + "28"
                      : colors.surfaceSecondary,
                  }}
                >
                  <Ionicons
                    name="text-outline"
                    size={20}
                    color={
                      showFormatting ? colors.primary : colors.textMuted
                    }
                  />
                </Pressable>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Pressable
                  onPress={handleSave}
                  disabled={!body.trim() || isSaving}
                  style={{
                    borderRadius: 9999,
                    backgroundColor: colors.primary,
                    borderWidth: theme === "light" ? 2 : 0,
                    borderColor: "#1A1A1A",
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    opacity: !body.trim() || isSaving ? 0.5 : 1,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Roboto-Medium",
                      fontSize: 13,
                      color: "#000000",
                      letterSpacing: 0.5,
                      textTransform: "uppercase",
                    }}
                  >
                    {entryIdParam ? "+ SAVE" : "+ ADD"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleDigDeeper}
                  disabled={!body.trim()}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    borderRadius: 9999,
                    borderWidth: 1,
                    borderColor: colors.border,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    opacity: !body.trim() ? 0.5 : 1,
                  }}
                >
                  <Image
                    source={APP_ICON}
                    style={{ width: 20, height: 20, borderRadius: 5 }}
                    resizeMode="contain"
                  />
                  <Text
                    style={{
                      fontFamily: "Roboto-Medium",
                      fontSize: 13,
                      color: colors.text,
                      letterSpacing: 0.5,
                      textTransform: "uppercase",
                    }}
                  >
                    Dig Deeper
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </View>

      <PromptSheet
        visible={showPrompts}
        onClose={() => setShowPrompts(false)}
        onSelectPrompt={(prompt) => setBody(prompt)}
      />

      <DatePrecisionPicker
        visible={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        date={date}
        precision={precision}
        onChangePrecision={setPrecision}
        onChangeDate={setDate}
      />
    </SafeAreaView>
  );
}
