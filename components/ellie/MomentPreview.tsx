import { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  LayoutAnimation,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";

interface MomentPreviewProps {
  title: string;
  body: string;
  photoUri?: string;
  /** Original capture time of `photoUri` in ms; persisted as `entry_media.taken_at` so the Capsule date pill stays accurate after save. */
  photoDate?: number;
  onSave: (
    title: string,
    body: string,
    attachedPhotoUri?: string,
    /**
     * Original capture time of the photo being saved (ms). When the user
     * replaces the photo here, we look up the new asset's creationTime and
     * forward it so `taken_at` reflects the actual file, not the prompt.
     */
    attachedPhotoTakenAtMs?: number
  ) => void;
  onGoDeeper?: () => void;
  saving?: boolean;
  goingDeeper?: boolean;
  /** When set, gallery opens only after full photo-library access is confirmed (pre-permission explainer). */
  ensureFullPhotoLibraryAccess?: () => Promise<boolean>;
}

/** EXIF DateTimeOriginal is `YYYY:MM:DD HH:mm:ss` — convert the date portion's colons into dashes so Date.parse handles it. */
function parseExifDate(ts: string | undefined): number | undefined {
  if (!ts) return undefined;
  const parsed = Date.parse(ts.replace(":", "-").replace(":", "-"));
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** Best-effort: extract the original capture time of a picked asset, preferring MediaLibrary metadata over EXIF. */
async function extractCreationTime(
  asset: ImagePicker.ImagePickerAsset
): Promise<number | undefined> {
  if (asset.assetId) {
    try {
      const info = await MediaLibrary.getAssetInfoAsync(asset.assetId);
      if (typeof info.creationTime === "number" && info.creationTime > 0) {
        return info.creationTime;
      }
    } catch {
      // Fall through to EXIF fallback
    }
  }
  const exif = (asset.exif ?? {}) as Record<string, unknown>;
  const dt =
    (exif.DateTimeOriginal as string | undefined) ??
    (exif.DateTime as string | undefined);
  return parseExifDate(dt);
}

export function MomentPreview({
  title: initialTitle,
  body: initialBody,
  photoUri,
  photoDate,
  onSave,
  onGoDeeper,
  saving,
  goingDeeper,
  ensureFullPhotoLibraryAccess,
}: MomentPreviewProps) {
  const { colors, theme } = useTheme();
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [attachedPhoto, setAttachedPhoto] = useState<string | undefined>(photoUri);
  const [attachedPhotoTakenAtMs, setAttachedPhotoTakenAtMs] = useState<
    number | undefined
  >(photoDate);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);

  const openGallery = useCallback(async () => {
    if (ensureFullPhotoLibraryAccess) {
      const ok = await ensureFullPhotoLibraryAccess();
      if (!ok) return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: false,
        quality: 0.9,
        exif: true,
      });
      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        const uri = asset.uri;
        console.log("[MomentPreview] Gallery picked:", uri?.substring(0, 80));
        if (uri) {
          setAttachedPhoto(uri);
          setAttachedPhotoTakenAtMs(await extractCreationTime(asset));
        }
      }
    } catch (err) {
      console.error("[MomentPreview] Gallery error:", err);
      Alert.alert("Error", "Could not open photo library.");
    }
  }, [ensureFullPhotoLibraryAccess]);

  const openCamera = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Camera access needed", "Enable camera access in Settings to take photos.");
      return;
    }
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 1,
      });
      if (!result.canceled && result.assets.length > 0) {
        setAttachedPhoto(result.assets[0].uri);
        // Camera photos are taken right now — use the system clock.
        setAttachedPhotoTakenAtMs(Date.now());
      }
    } catch {
      Alert.alert("Error", "Could not open camera.");
    }
  }, []);

  return (
    <View
      style={{
        marginBottom: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceSecondary,
        overflow: "hidden",
      }}
    >
      {attachedPhoto ? (
        <View style={{ position: "relative" }}>
          <Image
            key={attachedPhoto}
            source={{ uri: attachedPhoto }}
            style={{ width: "100%", height: 200 }}
            contentFit="cover"
            recyclingKey={attachedPhoto}
          />
          <Pressable
            onPress={() => {
              setAttachedPhoto(undefined);
              setAttachedPhotoTakenAtMs(undefined);
            }}
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: "rgba(0,0,0,0.6)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="close" size={16} color="#FFFFFF" />
          </Pressable>
          <Pressable
            onPress={() => void openGallery()}
            style={{
              position: "absolute",
              bottom: 8,
              left: 8,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              backgroundColor: "rgba(0,0,0,0.6)",
              borderRadius: 12,
              paddingHorizontal: 10,
              paddingVertical: 5,
            }}
          >
            <Ionicons name="images-outline" size={14} color="#FFFFFF" />
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 12,
                color: "#FFFFFF",
              }}
            >
              Change photo
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={{ padding: 16 }}>
        <TextInput
          value={title}
          onChangeText={setTitle}
          style={{
            fontFamily: "LibreBaskerville-Bold",
            fontSize: 18,
            color: colors.text,
            padding: 0,
            marginBottom: 12,
          }}
          multiline
          placeholder="Title"
          placeholderTextColor={colors.textMuted}
        />
        <TextInput
          value={body}
          onChangeText={setBody}
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 15,
            lineHeight: 24,
            color: colors.text,
            padding: 0,
            minHeight: 80,
          }}
          multiline
          placeholder="Your moment..."
          placeholderTextColor={colors.textMuted}
          textAlignVertical="top"
        />

        {/* Floating gallery/camera button — matches composer pattern */}
        {!attachedPhoto && (
          <View style={{ marginTop: 12, alignSelf: "flex-start" }}>
            {mediaPickerOpen ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  height: 44,
                  borderRadius: 22,
                  borderWidth: 2,
                  borderColor: colors.text,
                  backgroundColor: colors.surface,
                  paddingLeft: 4,
                  paddingRight: 4,
                  gap: 6,
                }}
              >
                <Pressable
                  onPress={() => setMediaPickerOpen(false)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: colors.surface,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="images-outline" size={18} color={colors.text} />
                </Pressable>
                <Pressable
                  onPress={() => {
                    setMediaPickerOpen(false);
                    void openGallery();
                  }}
                  style={{
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: "#3A3A3A",
                    paddingHorizontal: 14,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Roboto-Medium",
                      fontSize: 14,
                      color: "#FFFFFF",
                    }}
                  >
                    Gallery
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setMediaPickerOpen(false);
                    void openCamera();
                  }}
                  style={{
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: "#3A3A3A",
                    paddingHorizontal: 14,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Roboto-Medium",
                      fontSize: 14,
                      color: "#FFFFFF",
                    }}
                  >
                    Camera
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  LayoutAnimation.configureNext(
                    LayoutAnimation.create(200, "easeInEaseOut", "opacity")
                  );
                  setMediaPickerOpen(true);
                }}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: colors.surface,
                  borderWidth: 2,
                  borderColor: colors.text,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="images-outline" size={20} color={colors.text} />
              </Pressable>
            )}
          </View>
        )}
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
        <Pressable
          onPress={() =>
            onSave(title, body, attachedPhoto, attachedPhotoTakenAtMs)
          }
          disabled={saving || !body.trim()}
          style={{
            paddingVertical: 14,
            alignItems: "center",
            backgroundColor: saving ? colors.surfaceSecondary : colors.primary,
            opacity: !body.trim() ? 0.5 : 1,
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 15,
              color: colors.text,
              letterSpacing: 0.5,
              textTransform: "uppercase",
            }}
          >
            {saving ? "Saving..." : "Add Moment"}
          </Text>
        </Pressable>

        {onGoDeeper && (
          <Pressable
            onPress={onGoDeeper}
            disabled={goingDeeper || !body.trim()}
            style={{
              paddingVertical: 12,
              alignItems: "center",
              borderTopWidth: 1,
              borderTopColor: colors.border,
              opacity: goingDeeper ? 0.5 : 1,
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Regular",
                fontSize: 14,
                color: colors.primary,
                letterSpacing: 0.3,
              }}
            >
              {goingDeeper ? "Going deeper..." : "Go Deeper: Ask me one more question"}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
