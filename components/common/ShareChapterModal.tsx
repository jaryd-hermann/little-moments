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
  createChapterShareLink,
  openChapterShareSheet,
} from "@/lib/shareChapter";
import { usePostHog } from "posthog-react-native";
import {
  chapterCardTitle,
  chapterImageSlideToMedia,
  type ChapterRecord,
} from "@/lib/chapters";

const CREAM = "#FFFFEB";

interface ShareChapterModalProps {
  visible: boolean;
  chapter: ChapterRecord | null;
  onDismiss: () => void;
}

export function ShareChapterModal({
  visible,
  chapter,
  onDismiss,
}: ShareChapterModalProps) {
  const posthog = usePostHog();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const [isSharing, setIsSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const hasAutoShared = useRef(false);

  const collageMedia = chapter?.image_slide
    ? chapterImageSlideToMedia(chapter.image_slide)
    : [];
  const firstMedia = collageMedia.length > 0 ? collageMedia[0] : null;
  const blurUri = firstMedia ? getEntryMediaDisplayUri(firstMedia) : null;
  const hasImage = !!blurUri;
  const cardWidth = Math.min(screenWidth - 48, 320);

  useEffect(() => {
    if (visible && chapter) {
      hasAutoShared.current = false;
      setCopied(false);
      setShareUrl(null);
      posthog.capture("share_chapter_opened", { chapter_id: chapter.id });
      void createChapterShareLink(chapter.id)
        .then(setShareUrl)
        .catch(() => {});
    }
  }, [visible, chapter?.id]);

  const handleShare = useCallback(async () => {
    if (!chapter || isSharing) return;
    setIsSharing(true);
    try {
      const url = shareUrl ?? (await createChapterShareLink(chapter.id));
      if (!shareUrl) setShareUrl(url);
      posthog.capture("share_chapter_link_created", { chapter_id: chapter.id });
      await openChapterShareSheet(url, chapterCardTitle(chapter));
      posthog.capture("share_chapter_sheet_opened", { chapter_id: chapter.id });
    } catch (err) {
      console.error("[ShareChapterModal] share failed:", err);
    } finally {
      setIsSharing(false);
    }
  }, [chapter, isSharing, shareUrl, posthog]);

  const handleCopyLink = useCallback(async () => {
    if (!chapter) return;
    try {
      const url = shareUrl ?? (await createChapterShareLink(chapter.id));
      if (!shareUrl) setShareUrl(url);
      await Clipboard.setStringAsync(url);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      posthog.capture("share_chapter_link_copied", { chapter_id: chapter.id });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("[ShareChapterModal] copy failed:", err);
    }
  }, [chapter, shareUrl, posthog]);

  // Auto-trigger native share sheet once chapter + URL are ready.
  useEffect(() => {
    if (visible && chapter && shareUrl && !hasAutoShared.current) {
      hasAutoShared.current = true;
      const timer = setTimeout(() => {
        void handleShare();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [visible, chapter?.id, shareUrl, handleShare]);

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
            if (chapter)
              posthog.capture("share_chapter_dismissed", {
                chapter_id: chapter.id,
              });
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
          {!chapter ? (
            <ActivityIndicator size="large" color="#f0d7ff" />
          ) : (
            <>
              <View style={[styles.card, { width: cardWidth }]}>
                {firstMedia ? (
                  <EntryMediaImage
                    media={firstMedia}
                    style={{ width: cardWidth, height: 160 }}
                  />
                ) : (
                  <View
                    style={{
                      width: cardWidth,
                      height: 160,
                      backgroundColor: "#1f1f1f",
                    }}
                  />
                )}
                <View style={styles.cardBody}>
                  <Text style={styles.cardEyebrow}>
                    Chapter {chapter.chapter_number}
                  </Text>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {chapterCardTitle(chapter)}
                  </Text>
                  <Text style={styles.cardSub}>
                    {chapter.moment_count} moments captured
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
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
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
    fontFamily: "LibreBaskerville-Bold",
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
