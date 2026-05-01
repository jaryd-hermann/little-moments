import { useEntries } from "@/hooks/useEntries";
import { useMediaLibrary } from "@/hooks/useMediaLibrary";
import { useTheme } from "@/hooks/useTheme";
import { useThreads } from "@/hooks/useThreads";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const THROWBACK_DAYS = 90;

type Photo = {
  uri: string;
  creationTime: number;
};

function photoAgeDays(creationTime: number): number {
  return Math.floor((Date.now() - creationTime) / (1000 * 60 * 60 * 24));
}

function photoLabel(creationTime: number): string {
  const days = photoAgeDays(creationTime);
  if (days <= THROWBACK_DAYS) {
    return format(new Date(creationTime), "MMM d, yyyy");
  }
  if (days < 365) return `Throwback · ${Math.floor(days / 30)} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "Throwback · 1 year ago" : `Throwback · ${years} years ago`;
}

export default function CaptureScreen() {
  const { colors, theme } = useTheme();
  const posthog = usePostHog();
  const { entries } = useEntries();
  const { totalConnections } = useThreads();
  const {
    getRandomAsset,
    requestPermission,
    checkPermission,
    permissionStatus,
  } = useMediaLibrary();

  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [statsBeat, setStatsBeat] = useState(false);
  const lastSeenMomentCount = useRef<number | null>(null);

  const momentCount = entries.length;
  const hasPermission =
    permissionStatus === "granted" || (permissionStatus as string) === "limited";

  const loadNextPhoto = useCallback(async () => {
    if (!hasPermission) return;
    setPhotoLoading(true);
    try {
      const asset = await getRandomAsset();
      if (asset) {
        setPhoto({ uri: asset.uri, creationTime: asset.creationTime });
      }
    } finally {
      setPhotoLoading(false);
    }
  }, [getRandomAsset, hasPermission]);

  useFocusEffect(
    useCallback(() => {
      posthog.capture("capture_home_viewed");
      void checkPermission();
    }, [posthog, checkPermission])
  );

  useEffect(() => {
    if (hasPermission && !photo && !photoLoading) {
      void loadNextPhoto();
    }
  }, [hasPermission, photo, photoLoading, loadNextPhoto]);

  // Animate the +1 stats beat when momentCount grows
  useEffect(() => {
    if (lastSeenMomentCount.current == null) {
      lastSeenMomentCount.current = momentCount;
      return;
    }
    if (momentCount > lastSeenMomentCount.current) {
      setStatsBeat(true);
      const t = setTimeout(() => setStatsBeat(false), 1400);
      lastSeenMomentCount.current = momentCount;
      return () => clearTimeout(t);
    }
    lastSeenMomentCount.current = momentCount;
  }, [momentCount]);

  const handleShuffle = useCallback(async () => {
    if (!hasPermission || photoLoading) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    posthog.capture("capture_photo_shuffled", {
      ...(photo
        ? {
            photo_age_days: photoAgeDays(photo.creationTime),
            photo_is_throwback: photoAgeDays(photo.creationTime) > THROWBACK_DAYS,
          }
        : {}),
    });
    await loadNextPhoto();
  }, [hasPermission, photoLoading, photo, posthog, loadNextPhoto]);

  const handleVoice = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
    posthog.capture("capture_voice_tapped", {
      has_photo: !!photo,
    });
    router.push("/(tabs)/add");
  }, [posthog, photo]);

  const handleType = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
    posthog.capture("capture_type_tapped");
    router.push("/(tabs)/add");
  }, [posthog]);

  const handleRequestPermission = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (permissionStatus === "denied") {
      Linking.openSettings();
      return;
    }
    const ok = await requestPermission();
    if (ok) await loadNextPhoto();
  }, [permissionStatus, requestPermission, loadNextPhoto]);

  const handleMoreSheetChoice = useCallback(
    (choice: "word" | "freetext" | "photo_pick") => {
      posthog.capture("capture_more_ways_choice", { choice });
      setMoreSheetOpen(false);
      router.push("/(tabs)/add");
    },
    [posthog]
  );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["top"]}
    >
      <StatsStrip
        moments={momentCount}
        threads={totalConnections}
        colors={colors}
        beat={statsBeat}
      />

      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8 }}>
        {hasPermission ? (
          <PhotoCard
            photo={photo}
            loading={photoLoading}
            onShuffle={handleShuffle}
            colors={colors}
            theme={theme}
          />
        ) : (
          <PermissionFallback
            colors={colors}
            permissionStatus={permissionStatus}
            onAllow={handleRequestPermission}
            onUseWord={handleType}
          />
        )}

        <CaptureCTAs
          colors={colors}
          theme={theme}
          onVoice={handleVoice}
          onType={handleType}
          onMore={() => {
            posthog.capture("capture_more_ways_opened");
            setMoreSheetOpen(true);
          }}
        />
      </View>

      <MoreWaysSheet
        visible={moreSheetOpen}
        onClose={() => setMoreSheetOpen(false)}
        onChoose={handleMoreSheetChoice}
        colors={colors}
        theme={theme}
      />
    </SafeAreaView>
  );
}

function StatsStrip({
  moments,
  threads,
  colors,
  beat,
}: {
  moments: number;
  threads: number;
  colors: ReturnType<typeof useTheme>["colors"];
  beat: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 12,
        gap: 16,
      }}
    >
      <Pressable
        onPress={() => router.push("/(tabs)/memories")}
        style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
      >
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 14,
            color: beat ? colors.primary : colors.text,
            fontWeight: beat ? "700" : "400",
          }}
        >
          {moments}
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 12,
            color: colors.textSecondary,
            letterSpacing: 0.4,
          }}
        >
          moments
        </Text>
        {beat ? (
          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 11,
              color: colors.primary,
              marginLeft: 2,
            }}
          >
            +1
          </Text>
        ) : null}
      </Pressable>
      <View
        style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: colors.textMuted }}
      />
      <Pressable
        onPress={() => router.push("/(tabs)/brain")}
        style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
      >
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 14,
            color: colors.text,
          }}
        >
          {threads}
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 12,
            color: colors.textSecondary,
            letterSpacing: 0.4,
          }}
        >
          threads
        </Text>
      </Pressable>
    </View>
  );
}

function PhotoCard({
  photo,
  loading,
  onShuffle,
  colors,
  theme,
}: {
  photo: Photo | null;
  loading: boolean;
  onShuffle: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
  theme: "light" | "dark";
}) {
  const isThrowback = !!photo && photoAgeDays(photo.creationTime) > THROWBACK_DAYS;

  return (
    <View
      style={{
        flex: 1,
        marginBottom: 16,
        borderRadius: 18,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {photo ? (
        <Image
          source={{ uri: photo.uri }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          {loading ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text
              style={{
                fontFamily: "Roboto-Light",
                fontSize: 13,
                color: colors.textMuted,
              }}
            >
              No photo loaded
            </Text>
          )}
        </View>
      )}

      {/* Date / throwback chip — bottom-left */}
      {photo ? (
        <View
          style={{
            position: "absolute",
            left: 12,
            bottom: 12,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 9999,
            backgroundColor: isThrowback
              ? colors.primary
              : theme === "dark"
                ? "rgba(0,0,0,0.55)"
                : "rgba(255,255,255,0.85)",
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 11,
              letterSpacing: 0.4,
              color: isThrowback
                ? "#1A1A1A"
                : theme === "dark"
                  ? "#FFFFFF"
                  : "#1A1A1A",
            }}
          >
            {photoLabel(photo.creationTime)}
          </Text>
        </View>
      ) : null}

      {/* Shuffle — top-right */}
      <Pressable
        onPress={onShuffle}
        disabled={loading}
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          width: 40,
          height: 40,
          borderRadius: 9999,
          backgroundColor:
            theme === "dark" ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.85)",
          alignItems: "center",
          justifyContent: "center",
        }}
        hitSlop={6}
      >
        <Ionicons
          name="shuffle"
          size={20}
          color={theme === "dark" ? "#FFFFFF" : "#1A1A1A"}
        />
      </Pressable>
    </View>
  );
}

function PermissionFallback({
  colors,
  permissionStatus,
  onAllow,
  onUseWord,
}: {
  colors: ReturnType<typeof useTheme>["colors"];
  permissionStatus: string | null;
  onAllow: () => void;
  onUseWord: () => void;
}) {
  const denied = permissionStatus === "denied";
  return (
    <View
      style={{
        flex: 1,
        marginBottom: 16,
        borderRadius: 18,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: colors.border,
        padding: 28,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name="images-outline" size={56} color={colors.textSecondary} />
      <Text
        style={{
          marginTop: 18,
          fontFamily: "Roboto-Regular",
          fontSize: 18,
          color: colors.text,
          textAlign: "center",
          fontWeight: "600",
          maxWidth: 260,
        }}
      >
        Grant photo access to start
      </Text>
      <Text
        style={{
          marginTop: 10,
          fontFamily: "Roboto-Light",
          fontSize: 13,
          color: colors.textSecondary,
          textAlign: "center",
          maxWidth: 280,
          lineHeight: 19,
        }}
      >
        We&apos;ll surface one photo at a time. Nothing leaves your device until
        you save.
      </Text>
      <Pressable
        onPress={onAllow}
        style={{
          marginTop: 22,
          paddingHorizontal: 22,
          paddingVertical: 11,
          borderRadius: 9999,
          backgroundColor: colors.primary,
        }}
      >
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 13,
            color: "#1A1A1A",
            letterSpacing: 0.4,
            textTransform: "uppercase",
            fontWeight: "600",
          }}
        >
          {denied ? "Open Settings" : "Allow photos"}
        </Text>
      </Pressable>
      <Pressable onPress={onUseWord} style={{ marginTop: 18 }}>
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 13,
            color: colors.textSecondary,
            textDecorationLine: "underline",
          }}
        >
          Start with a word instead
        </Text>
      </Pressable>
    </View>
  );
}

function CaptureCTAs({
  colors,
  theme,
  onVoice,
  onType,
  onMore,
}: {
  colors: ReturnType<typeof useTheme>["colors"];
  theme: "light" | "dark";
  onVoice: () => void;
  onType: () => void;
  onMore: () => void;
}) {
  return (
    <View style={{ paddingBottom: 90 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 22,
        }}
      >
        <Pressable
          onPress={onVoice}
          style={{
            width: 76,
            height: 76,
            borderRadius: 9999,
            backgroundColor: colors.primary,
            borderWidth: 2,
            borderColor: theme === "dark" ? "#FFFFFF" : "#1A1A1A",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="mic" size={32} color="#1A1A1A" />
        </Pressable>

        <Pressable
          onPress={onMore}
          style={{
            width: 48,
            height: 48,
            borderRadius: 9999,
            borderWidth: 1.5,
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
          }}
          hitSlop={6}
        >
          <Ionicons
            name="ellipsis-horizontal"
            size={20}
            color={colors.textSecondary}
          />
        </Pressable>
      </View>

      <Pressable onPress={onType} style={{ marginTop: 14, alignItems: "center" }}>
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 13,
            color: colors.textSecondary,
            textDecorationLine: "underline",
          }}
        >
          Type instead
        </Text>
      </Pressable>
    </View>
  );
}

function MoreWaysSheet({
  visible,
  onClose,
  onChoose,
  colors,
  theme,
}: {
  visible: boolean;
  onClose: () => void;
  onChoose: (choice: "word" | "freetext" | "photo_pick") => void;
  colors: ReturnType<typeof useTheme>["colors"];
  theme: "light" | "dark";
}) {
  const rows: Array<{
    key: "word" | "freetext" | "photo_pick";
    title: string;
    sub: string;
    icon: keyof typeof Ionicons.glyphMap;
  }> = [
    {
      key: "word",
      title: "Give me a word",
      sub: "A single word, like \"kitchen\" or \"ache\".",
      icon: "text-outline",
    },
    {
      key: "freetext",
      title: "Just write",
      sub: "Open freetext. Ellie won't prompt unless you ask.",
      icon: "create-outline",
    },
    {
      key: "photo_pick",
      title: "Use a different photo",
      sub: "Pick from your camera roll.",
      icon: "images-outline",
    },
  ];

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      transparent
      animationType="slide"
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor:
            theme === "dark" ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.35)",
          justifyContent: "flex-end",
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: colors.background,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingHorizontal: 18,
            paddingTop: 12,
            paddingBottom: 32,
          }}
        >
          <View style={{ alignItems: "center", marginBottom: 12 }}>
            <View
              style={{
                width: 38,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.border,
              }}
            />
          </View>
          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 17,
              color: colors.text,
              fontWeight: "600",
              marginBottom: 4,
            }}
          >
            More ways to capture
          </Text>
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 12,
              color: colors.textMuted,
              marginBottom: 16,
            }}
          >
            For when you don&apos;t want to react to a photo.
          </Text>
          {rows.map((row, i) => (
            <Pressable
              key={row.key}
              onPress={() => onChoose(row.key)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                paddingVertical: 14,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.borderLight,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  borderWidth: 1.5,
                  borderColor: colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name={row.icon} size={18} color={colors.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: "Roboto-Regular",
                    fontSize: 15,
                    color: colors.text,
                    fontWeight: "600",
                  }}
                >
                  {row.title}
                </Text>
                <Text
                  style={{
                    fontFamily: "Roboto-Light",
                    fontSize: 12,
                    color: colors.textMuted,
                    marginTop: 2,
                  }}
                >
                  {row.sub}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textMuted}
              />
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
