import { useEffect, useState, useRef, useCallback } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EntryMediaImage } from "@/components/common/EntryMediaImage";
import { getEntryMediaDisplayUri } from "@/lib/entryMediaUrl";
import {
  createMashupShareLink,
  openMashupShareSheet,
} from "@/lib/shareMashup";
import type { MashupBucket } from "@/lib/mashupBuckets";
import { usePostHog } from "posthog-react-native";

const CREAM = "#FFFFEB";

interface ShareMashupModalProps {
  visible: boolean;
  bucket: MashupBucket | null;
  onDismiss: () => void;
}

export function ShareMashupModal({
  visible,
  bucket,
  onDismiss,
}: ShareMashupModalProps) {
  const posthog = usePostHog();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const [isSharing, setIsSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const hasAutoShared = useRef(false);

  const firstClip = bucket?.clips[0] ?? null;
  const firstMedia = firstClip?.media ?? null;
  const blurUri = firstMedia ? getEntryMediaDisplayUri(firstMedia) : null;
  const hasImage = !!blurUri;
  const cardWidth = Math.min(screenWidth - 48, 320);

  useEffect(() => {
    if (visible && bucket) {
      hasAutoShared.current = false;
      setCopied(false);
      setShareUrl(null);
      posthog.capture("share_mashup_opened", {
        bucket_type: bucket.type,
        bucket_key: bucket.key,
        clip_count: bucket.count,
      });
      void createMashupShareLink(bucket)
        .then(setShareUrl)
        .catch(() => {});
    }
  }, [visible, bucket?.key, bucket?.type]);

  const handleShare = useCallback(async () => {
    if (!bucket || isSharing) return;
    setIsSharing(true);
    try {
      const url = shareUrl ?? (await createMashupShareLink(bucket));
      if (!shareUrl) setShareUrl(url);
      posthog.capture("share_mashup_link_created", {
        bucket_type: bucket.type,
        bucket_key: bucket.key,
      });
      await openMashupShareSheet(url);
      posthog.capture("share_mashup_sheet_opened", {
        bucket_type: bucket.type,
        bucket_key: bucket.key,
      });
    } catch (err) {
      console.error("[ShareMashupModal] share failed:", err);
    } finally {
      setIsSharing(false);
    }
  }, [bucket, isSharing, shareUrl, posthog]);

  const handleCopyLink = useCallback(async () => {
    if (!bucket) return;
    try {
      const url = shareUrl ?? (await createMashupShareLink(bucket));
      if (!shareUrl) setShareUrl(url);
      await Clipboard.setStringAsync(url);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      posthog.capture("share_mashup_link_copied", {
        bucket_type: bucket.type,
        bucket_key: bucket.key,
      });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("[ShareMashupModal] copy failed:", err);
    }
  }, [bucket, shareUrl, posthog]);

  useEffect(() => {
    if (visible && bucket && shareUrl && !hasAutoShared.current) {
      hasAutoShared.current = true;
      const timer = setTimeout(() => {
        void handleShare();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [visible, bucket?.key, shareUrl, handleShare]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.container}>
        {blurUri ? (
          <Image
            source={{ uri: blurUri }}
            style={StyleSheet.absoluteFillObject}
            blurRadius={60}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : null}

        <View
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: hasImage
                ? "rgba(0,0,0,0.82)"
                : "rgba(0,0,0,0.92)",
            },
          ]}
        />

        <Pressable
          onPress={() => {
            if (bucket) {
              posthog.capture("share_mashup_dismissed", {
                bucket_type: bucket.type,
                bucket_key: bucket.key,
              });
            }
            onDismiss();
          }}
          hitSlop={16}
          style={[styles.closeButton, { top: insets.top + 8 }]}
        >
          <View style={styles.closeCircle}>
            <Ionicons name="close" size={20} color="#FFFFFF" />
          </View>
        </Pressable>

        <View style={[styles.cardArea, { paddingTop: insets.top + 52 }]}>
          {!bucket ? (
            <ActivityIndicator size="large" color="#f0d7ff" />
          ) : (
            <>
              <View style={[styles.card, { width: cardWidth }]}>
                {firstMedia ? (
                  <EntryMediaImage
                    media={firstMedia}
                    style={{ width: cardWidth, height: 200 }}
                  />
                ) : (
                  <View
                    style={{
                      width: cardWidth,
                      height: 200,
                      backgroundColor: "#1f1f1f",
                    }}
                  />
                )}
                <View style={styles.cardBody}>
                  <Text style={styles.cardEyebrow}>Snippet movie</Text>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {bucket.label}
                  </Text>
                  <Text style={styles.cardSub}>
                    {bucket.count} moment{bucket.count === 1 ? "" : "s"} stitched
                  </Text>
                </View>
              </View>

              <Pressable onPress={handleCopyLink} style={styles.copyRow}>
                <Ionicons
                  name={copied ? "checkmark" : "link-outline"}
                  size={15}
                  color="rgba(255,255,255,0.6)"
                />
                <Text style={styles.copyText}>
                  {copied ? "Copied!" : "Copy link"}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  closeButton: {
    position: "absolute",
    right: 16,
    zIndex: 10,
  },
  closeCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardArea: {
    alignItems: "center",
    paddingHorizontal: 24,
  },
  card: {
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#000000",
    backgroundColor: CREAM,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 12,
  },
  cardBody: { padding: 14 },
  cardEyebrow: {
    fontFamily: "Roboto-Medium",
    fontSize: 10,
    color: "#8a7a6b",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  cardTitle: {
    fontFamily: "Roboto-Bold",
    fontSize: 16,
    lineHeight: 22,
    color: "#1A1A1A",
    marginBottom: 4,
  },
  cardSub: {
    fontFamily: "Roboto-Regular",
    fontSize: 12,
    color: "#5c5348",
  },
  copyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  copyText: {
    fontFamily: "Roboto-Medium",
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    letterSpacing: 0.2,
  },
});
