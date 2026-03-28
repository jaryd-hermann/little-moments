import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { RichEditor, RichToolbar, actions } from "react-native-pell-rich-editor";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { format } from "date-fns";
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
import { uploadEntryMedia } from "@/lib/storage";
import { supabase } from "@/lib/supabase";

const MAX_ATTACHMENTS = 5;

type Precision = "exact" | "month_only" | "year_only";

export default function ComposerScreen() {
  const { colors, theme } = useTheme();
  const params = useLocalSearchParams<{
    date?: string;
    entryId?: string;
    photoUri?: string;
    isCrashAndBurn?: string;
  }>();

  const { saveEntry } = useEntries();
  const user = useAuthStore((s) => s.user);
  const editorRef = useRef<RichEditor>(null);
  const titleRef = useRef<TextInput>(null);

  const initialDate = params.date
    ? new Date(params.date)
    : new Date();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [media, setMedia] = useState<MediaItem[]>(
    params.photoUri
      ? [{ uri: params.photoUri, type: "image" }]
      : []
  );
  const [date, setDate] = useState(initialDate);
  const [precision, setPrecision] = useState<Precision>("exact");
  const [showPrompts, setShowPrompts] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showFormatting, setShowFormatting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [micFullscreen, setMicFullscreen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      titleRef.current?.focus();
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  const openGallery = async () => {
    if (media.length >= MAX_ATTACHMENTS) {
      Alert.alert("Limit reached", `You can attach up to ${MAX_ATTACHMENTS} items.`);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      selectionLimit: MAX_ATTACHMENTS - media.length,
      quality: 0.8,
    });

    if (!result.canceled) {
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
    if (body.trim() || title.trim()) {
      Alert.alert(
        "Discard entry?",
        "You have unsaved content. Are you sure you want to close?",
        [
          { text: "Keep Editing", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => router.back(),
          },
        ]
      );
    } else {
      router.back();
    }
  };

  const handleSave = async () => {
    if (!body.trim()) return;
    if (!user) return;

    setIsSaving(true);
    try {
      const entryDate =
        precision === "exact"
          ? format(date, "yyyy-MM-dd")
          : null;

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

      if (media.length > 0 && entry) {
        for (let i = 0; i < media.length; i++) {
          const item = media[i];
          const url = await uploadEntryMedia(
            user.id,
            entry.id,
            item.uri,
            item.type
          );
          await supabase.from("entry_media").insert({
            entry_id: entry.id,
            user_id: user.id,
            storage_path: `${user.id}/${entry.id}/${Date.now()}.${item.type === "image" ? "jpg" : "mp4"}`,
            storage_url: url,
            media_type: item.type,
            display_order: i,
          });
        }
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      router.back();
    } catch (err) {
      Alert.alert("Error", "Failed to save entry. Please try again.");
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
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            paddingHorizontal: 20,
            paddingVertical: 12,
          }}
        >
          <Pressable onPress={handleClose}>
            <Ionicons name="close" size={24} color={colors.icon} />
          </Pressable>
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
          <View style={{ width: 24 }} />
        </View>

        {/* Content area */}
        <ScrollView className="flex-1 px-5" keyboardShouldPersistTaps="handled">
          <TextInput
            ref={titleRef}
            value={title}
            onChangeText={setTitle}
            placeholder="Give this moment a title..."
            placeholderTextColor={colors.textMuted}
            style={{
              marginTop: 16,
              fontFamily: "LibreBaskerville-Bold",
              fontSize: 22,
              color: colors.text,
            }}
            multiline={false}
          />

          <View className="mt-4 flex-1" style={{ minHeight: 250 }}>
            <RichTextEditor
              ref={editorRef}
              initialContent={body}
              placeholder="What happened? What did you notice?"
              onChange={setBody}
            />
          </View>

          {media.length > 0 && (
            <View className="mt-4 mb-4">
              <MediaAttachmentBar
                media={media}
                onRemoveMedia={(index) =>
                  setMedia((prev) => prev.filter((_, i) => i !== index))
                }
              />
            </View>
          )}
        </ScrollView>

        {/* Floating Gallery button */}
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 }}>
          <Pressable
            onPress={openGallery}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: colors.surface,
              borderWidth: 2,
              borderColor: "#FFFFFF",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="images-outline" size={18} color={colors.text} />
          </Pressable>
        </View>

        {/* Formatting toolbar */}
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

        {/* Bottom action bar */}
        <SafeAreaView
          edges={["bottom"]}
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
              paddingVertical: 8,
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
                onPress={() => setMicFullscreen(true)}
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
                  backgroundColor:
                    theme === "dark" ? "#FFFFFF" : "#1A1A1A",
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  opacity: !body.trim() || isSaving ? 0.5 : 1,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 13,
                    color:
                      theme === "dark" ? "#000000" : "#FFFFFF",
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                  }}
                >
                  ADD
                </Text>
              </Pressable>
              <Pressable
                onPress={handleDigDeeper}
                disabled={!body.trim()}
                style={{
                  borderRadius: 9999,
                  borderWidth: 1,
                  borderColor: colors.border,
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  opacity: !body.trim() ? 0.5 : 1,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 13,
                    color: colors.text,
                    letterSpacing: 0.5,
                  }}
                >
                  Dig Deeper
                </Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>

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
