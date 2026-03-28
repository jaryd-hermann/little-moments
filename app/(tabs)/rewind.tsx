import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  Linking,
  Share,
  Modal,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { SpinWheel } from "@/components/rewind/SpinWheel";
import { DiceButton } from "@/components/rewind/DiceButton";
import { PhotoSlideshow } from "@/components/rewind/PhotoSlideshow";
import { useMediaLibrary, MediaAsset } from "@/hooks/useMediaLibrary";
import { format } from "date-fns";

export default function RewindScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    permissionStatus,
    requestPermission,
    checkPermission,
    fetchAllPhotos,
  } = useMediaLibrary();

  const [allPhotos, setAllPhotos] = useState<MediaAsset[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const playInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentPhoto = allPhotos[currentIndex] ?? null;
  const currentDate = currentPhoto
    ? new Date(currentPhoto.creationTime)
    : new Date();

  useEffect(() => {
    checkPermission();
  }, []);

  useEffect(() => {
    if (permissionStatus === "granted") {
      loadPhotos();
    }
  }, [permissionStatus]);

  const loadPhotos = async () => {
    const photos = await fetchAllPhotos();
    setAllPhotos(photos);
    if (photos.length > 0) {
      setCurrentIndex(Math.floor(Math.random() * photos.length));
    }
  };

  const navigateByDays = useCallback(
    (delta: number) => {
      if (allPhotos.length === 0) return;
      setCurrentIndex((prev) => {
        const next = prev + delta;
        if (next < 0) return allPhotos.length - 1;
        if (next >= allPhotos.length) return 0;
        return next;
      });
    },
    [allPhotos.length]
  );

  const handleDice = async () => {
    if (allPhotos.length === 0) return;
    setCurrentIndex(Math.floor(Math.random() * allPhotos.length));
  };

  const handlePlay = () => {
    if (isPlaying) {
      if (playInterval.current) clearInterval(playInterval.current);
      playInterval.current = null;
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      playInterval.current = setInterval(() => {
        setCurrentIndex((prev) =>
          prev + 1 >= allPhotos.length ? 0 : prev + 1
        );
      }, 400);
    }
  };

  useEffect(() => {
    return () => {
      if (playInterval.current) clearInterval(playInterval.current);
    };
  }, []);

  const handleShare = async () => {
    if (!currentPhoto) return;
    try {
      await Share.share({
        url: currentPhoto.uri,
        message: `A moment from ${format(currentDate, "MMMM d, yyyy")}`,
      });
    } catch {}
  };

  const handleMakeMoment = () => {
    if (!currentPhoto) return;
    router.push({
      pathname: "/composer",
      params: {
        photoUri: currentPhoto.uri,
        date: format(currentDate, "yyyy-MM-dd"),
      },
    });
  };

  const getDateSubtitle = () => {
    const now = new Date();
    const diff = Math.abs(
      Math.floor(
        (now.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
      )
    );
    if (diff < 7) return "This week";
    if (diff < 30) return "This month";
    if (diff < 365) return `${Math.floor(diff / 30)} months ago`;
    const years = Math.floor(diff / 365);
    return `${years} ${years === 1 ? "year" : "years"} ago`;
  };

  if (permissionStatus !== "granted") {
    return (
      <View
        className="flex-1 items-center justify-center bg-black px-8"
        style={{ paddingTop: insets.top }}
      >
        <Text className="text-6xl">📸</Text>
        <Text className="mt-6 text-center text-2xl font-bold text-white">
          Access Your Camera Roll
        </Text>
        <Text className="mt-3 text-center text-base text-gray-400">
          Rewind through your photos to discover moments worth keeping.
        </Text>
        {permissionStatus === "denied" ? (
          <Pressable
            onPress={() => Linking.openSettings()}
            className="mt-6 rounded-full bg-white/20 px-8 py-3"
          >
            <Text className="text-base font-semibold text-white">
              Open Settings
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={requestPermission}
            className="mt-6 rounded-full bg-white/20 px-8 py-3"
          >
            <Text className="text-base font-semibold text-white">
              Grant Access
            </Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      {/* Full-bleed background photo */}
      <PhotoSlideshow uri={currentPhoto?.uri ?? null} />

      {/* Gradient overlays for text readability */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "30%",
          backgroundColor: "rgba(0,0,0,0.35)",
        }}
      />
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "35%",
          backgroundColor: "rgba(0,0,0,0.4)",
        }}
      />

      {/* Date header — top left */}
      <View
        className="absolute left-5 z-10"
        style={{ top: insets.top + 8 }}
      >
        <Text
          style={{
            fontFamily: "LibreBaskerville-Bold",
            fontSize: 28,
            lineHeight: 34,
            color: "#FFFFFF",
          }}
        >
          {format(currentDate, "MMM d, yyyy")}
        </Text>
        <Text
          style={{
            fontFamily: "LibreBaskerville-Regular",
            fontSize: 14,
            color: "rgba(255, 255, 255, 0.7)",
            marginTop: 2,
          }}
        >
          {getDateSubtitle()}
        </Text>
      </View>

      {/* Menu — top right */}
      <View
        className="absolute right-5 z-10 flex-row"
        style={{ top: insets.top + 12, gap: 10 }}
      >
        <Pressable onPress={() => setShowInfo(true)}>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: "rgba(255,255,255,0.15)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="information-outline" size={20} color="rgba(255,255,255,0.85)" />
          </View>
        </Pressable>
        <Pressable onPress={handleMakeMoment}>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: "rgba(255,255,255,0.15)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="add" size={22} color="rgba(255,255,255,0.85)" />
          </View>
        </Pressable>
      </View>

      {/* Bottom controls */}
      <View
        className="absolute bottom-0 left-0 right-0 items-center"
        style={{ paddingBottom: insets.bottom + 100 }}
      >
        <View className="flex-row items-center justify-center" style={{ gap: 28 }}>
          {/* Share button — left */}
          <Pressable onPress={handleShare}>
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                backgroundColor: "rgba(255,255,255,0.15)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name="share-outline"
                size={24}
                color="rgba(255,255,255,0.85)"
              />
            </View>
          </Pressable>

          {/* Spin wheel — center */}
          <SpinWheel
            onRotationChange={navigateByDays}
            onPlay={handlePlay}
            isPlaying={isPlaying}
          />

          {/* Dice button — right */}
          <DiceButton onPress={handleDice} />
        </View>
      </View>

      {/* Info Modal */}
      <Modal
        visible={showInfo}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowInfo(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 20,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <Text
              style={{
                fontFamily: "LibreBaskerville-Bold",
                fontSize: 18,
                color: colors.text,
              }}
            >
              How Rewind Works
            </Text>
            <Pressable onPress={() => setShowInfo(false)}>
              <Ionicons name="close" size={24} color={colors.icon} />
            </Pressable>
          </View>
          <ScrollView style={{ flex: 1, padding: 20 }}>
            <Text
              style={{
                fontFamily: "LibreBaskerville-Regular",
                fontSize: 16,
                color: colors.textSecondary,
                lineHeight: 28,
              }}
            >
              Rewind pulls a random photo from your camera roll. Spin the dial to browse through your photos by date, or tap the dice for a surprise.
            </Text>
            <Text
              style={{
                fontFamily: "LibreBaskerville-Regular",
                fontSize: 16,
                color: colors.textSecondary,
                lineHeight: 28,
                marginTop: 20,
              }}
            >
              When a photo sparks a memory, tap + to write a Little Moment about it. Don't forget the story — the feelings, the sounds, the details that made it matter.
            </Text>
            <Text
              style={{
                fontFamily: "LibreBaskerville-Regular",
                fontSize: 16,
                color: colors.textSecondary,
                lineHeight: 28,
                marginTop: 20,
              }}
            >
              Hit play to start an auto-slideshow. Share your favorite rediscoveries with friends.
            </Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
