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
import { useTheme } from "@/hooks/useTheme";
import { EntryMediaImage } from "@/components/common/EntryMediaImage";
import { getEntryMediaDisplayUri } from "@/lib/entryMediaUrl";
import { createShareLink, openShareSheet } from "@/lib/shareMoment";
import { usePostHog } from "posthog-react-native";
import type { Entry } from "@/store/entryStore";

const CREAM = "#FFFFEB";

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

interface ShareMomentModalProps {
  visible: boolean;
  entry: Entry | null;
  onDismiss: () => void;
}

export function ShareMomentModal({
  visible,
  entry,
  onDismiss,
}: ShareMomentModalProps) {
  const { colors } = useTheme();
  const posthog = usePostHog();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const [isSharing, setIsSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const hasAutoShared = useRef(false);

  const firstMedia = entry?.media && entry.media.length > 0 ? entry.media[0] : null;
  const blurUri = firstMedia ? getEntryMediaDisplayUri(firstMedia) : null;
  const hasImage = !!blurUri;
  const bodyPreview = entry ? stripHtml(entry.body) : "";
  const cardWidth = Math.min(screenWidth - 48, 320);

  useEffect(() => {
    if (visible && entry) {
      hasAutoShared.current = false;
      setCopied(false);
      setShareUrl(null);
      posthog.capture("share_moment_opened", { entry_id: entry.id });
      void createShareLink(entry.id).then(setShareUrl).catch(() => {});
    }
  }, [visible, entry?.id]);

  const handleShare = useCallback(async () => {
    if (!entry || isSharing) return;
    setIsSharing(true);
    try {
      const url = shareUrl ?? (await createShareLink(entry.id));
      if (!shareUrl) setShareUrl(url);
      posthog.capture("share_link_created", { entry_id: entry.id });
      await openShareSheet(url, entry.title ?? undefined);
      posthog.capture("share_sheet_opened", { entry_id: entry.id });
    } catch (err) {
      console.error("[ShareMomentModal] share failed:", err);
    } finally {
      setIsSharing(false);
    }
  }, [entry, isSharing, shareUrl, posthog]);

  const handleCopyLink = useCallback(async () => {
    if (!entry) return;
    try {
      const url = shareUrl ?? (await createShareLink(entry.id));
      if (!shareUrl) setShareUrl(url);
      await Clipboard.setStringAsync(url);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      posthog.capture("share_link_copied", { entry_id: entry.id });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("[ShareMomentModal] copy failed:", err);
    }
  }, [entry, shareUrl, posthog]);

  // Auto-trigger native share sheet once entry + URL are ready
  useEffect(() => {
    if (visible && entry && shareUrl && !hasAutoShared.current) {
      hasAutoShared.current = true;
      const timer = setTimeout(() => {
        void handleShare();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [visible, entry?.id, shareUrl, handleShare]);

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
            { backgroundColor: hasImage ? "rgba(0,0,0,0.82)" : "rgba(0,0,0,0.92)" },
          ]}
        />

        {/* Close button */}
        <Pressable
          onPress={() => {
            if (entry) posthog.capture("share_moment_dismissed", { entry_id: entry.id });
            onDismiss();
          }}
          hitSlop={16}
          style={[styles.closeButton, { top: insets.top + 8 }]}
        >
          <View style={styles.closeCircle}>
            <Ionicons name="close" size={20} color="#FFFFFF" />
          </View>
        </Pressable>

        {/* Card pinned near the top so native share sheet doesn't cover it */}
        <View style={[styles.cardArea, { paddingTop: insets.top + 52 }]}>
          {!entry ? (
            <ActivityIndicator size="large" color="#f0d7ff" />
          ) : (
            <>
              <View style={[styles.card, { width: cardWidth }]}>
                {firstMedia && (
                  <EntryMediaImage
                    media={firstMedia}
                    style={{ width: cardWidth, height: 160 }}
                  />
                )}
                <View style={styles.cardBody}>
                  {entry.title && (
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {entry.title}
                    </Text>
                  )}
                  <Text style={styles.cardText} numberOfLines={2}>
                    {bodyPreview}
                  </Text>
                  {entry.word_of_day && (
                    <View style={styles.wordPill}>
                      <Text style={styles.wordPillText}>{entry.word_of_day}</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Copy link — always visible below card */}
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
  container: {
    flex: 1,
  },
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
  cardBody: {
    padding: 14,
  },
  cardTitle: {
    fontFamily: "LibreBaskerville-Bold",
    fontSize: 15,
    color: "#1A1A1A",
    marginBottom: 4,
  },
  cardText: {
    fontFamily: "Roboto-Regular",
    fontSize: 13,
    lineHeight: 20,
    color: "#333333",
  },
  wordPill: {
    marginTop: 8,
    alignSelf: "flex-start",
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.06)",
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  wordPillText: {
    fontFamily: "Roboto-Medium",
    fontSize: 11,
    color: "#555555",
    textTransform: "lowercase",
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
