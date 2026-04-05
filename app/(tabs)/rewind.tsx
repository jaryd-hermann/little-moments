import { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, Pressable, Linking, ImageBackground } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { SpinWheel } from "@/components/rewind/SpinWheel";
import { DiceButton } from "@/components/rewind/DiceButton";
import { PhotoSlideshow } from "@/components/rewind/PhotoSlideshow";
import {
  useMediaLibrary,
  MediaAsset,
  pickRandomPhotoFromLibrary,
  mergePhotoIntoSortedDesc,
} from "@/hooks/useMediaLibrary";
import { format } from "date-fns";
import * as Haptics from "expo-haptics";
import { useRewindComposeStore } from "@/store/rewindComposeStore";
import { InfoTipModal } from "@/components/common/InfoTipModal";

const REWIND_BG = require("@/assets/images/rewind.png");

export default function RewindScreen() {
  const { colors } = useTheme();
  const posthog = usePostHog();
  const insets = useSafeAreaInsets();
  const setRewindComposeContext = useRewindComposeStore(
    (s) => s.setRewindComposeContext
  );
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
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPlayingRef = useRef(false);
  const allPhotosRef = useRef<MediaAsset[]>([]);

  const applyPickedAsset = useCallback((asset: MediaAsset) => {
    const prev = allPhotosRef.current;
    const { photos, index } = mergePhotoIntoSortedDesc(prev, asset);
    allPhotosRef.current = photos;
    setAllPhotos(photos);
    setCurrentIndex(index);
  }, []);

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

  useEffect(() => {
    allPhotosRef.current = allPhotos;
  }, [allPhotos]);

  const loadPhotos = async () => {
    const photos = await fetchAllPhotos();
    allPhotosRef.current = photos;
    setAllPhotos(photos);
    const asset = await pickRandomPhotoFromLibrary();
    if (asset) {
      const { photos: merged, index } = mergePhotoIntoSortedDesc(photos, asset);
      allPhotosRef.current = merged;
      setAllPhotos(merged);
      setCurrentIndex(index);
    } else if (photos.length > 0) {
      setCurrentIndex(Math.floor(Math.random() * photos.length));
    }
  };

  const navigateByDays = useCallback(
    (delta: number) => {
      if (allPhotos.length === 0 || delta === 0) return;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
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
    const asset = await pickRandomPhotoFromLibrary();
    if (!asset) return;
    applyPickedAsset(asset);
  };

  const schedulePlayTick = useCallback(() => {
    if (!isPlayingRef.current) return;
    void pickRandomPhotoFromLibrary().then((asset) => {
      if (!isPlayingRef.current) return;
      if (asset) {
        applyPickedAsset(asset);
      }
      if (isPlayingRef.current) {
        playTimerRef.current = setTimeout(schedulePlayTick, 400);
      }
    });
  }, [applyPickedAsset]);

  const handlePlay = () => {
    if (isPlaying) {
      isPlayingRef.current = false;
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
      playTimerRef.current = null;
      setIsPlaying(false);
    } else {
      isPlayingRef.current = true;
      setIsPlaying(true);
      schedulePlayTick();
    }
  };

  useEffect(() => {
    return () => {
      isPlayingRef.current = false;
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (permissionStatus === "granted") {
        void pickRandomPhotoFromLibrary().then((asset) => {
          if (cancelled || !asset) {
            if (!cancelled) setRewindComposeContext(null, null);
            return;
          }
          const prev = allPhotosRef.current;
          const { photos, index } = mergePhotoIntoSortedDesc(prev, asset);
          allPhotosRef.current = photos;
          setAllPhotos(photos);
          setCurrentIndex(index);
          const photo = photos[index];
          setRewindComposeContext(
            photo.uri,
            format(new Date(photo.creationTime), "yyyy-MM-dd")
          );
        });
      } else {
        setRewindComposeContext(null, null);
      }
      return () => {
        cancelled = true;
        setRewindComposeContext(null, null);
      };
    }, [permissionStatus, posthog, setRewindComposeContext])
  );

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

  /** Reserve space for floating CustomTabBar (~72px) + safe area so CTAs stay visible */
  const permissionGateBottomPad = insets.bottom + 108;

  if (permissionStatus !== "granted") {
    return (
      <View style={{ flex: 1, backgroundColor: "#000000" }}>
        <ImageBackground
          source={REWIND_BG}
          style={{
            flex: 1,
            width: "100%",
          }}
          resizeMode="cover"
        >
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              paddingHorizontal: 28,
              paddingBottom: permissionGateBottomPad,
              paddingTop: 16,
              alignItems: "center",
              zIndex: 2,
            }}
          >
          {permissionStatus === "denied" ? (
            <Pressable
              onPress={() => Linking.openSettings()}
              style={{
                marginTop: 16,
                borderRadius: 9999,
                backgroundColor: colors.primary,
                borderWidth: 2,
                borderColor: "#000000",
                paddingHorizontal: 28,
                paddingVertical: 14,
              }}
            >
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 15,
                  color: "#000000",
                  letterSpacing: 0.5,
                }}
              >
                Open Settings
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={requestPermission}
              style={{
                marginTop: 16,
                borderRadius: 9999,
                backgroundColor: colors.primary,
                borderWidth: 2,
                borderColor: "#000000",
                paddingHorizontal: 28,
                paddingVertical: 14,
              }}
            >
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 15,
                  color: "#000000",
                  letterSpacing: 0.5,
                }}
              >
                Grant Access
              </Text>
            </Pressable>
          )}
          </View>
        </ImageBackground>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      {/* Full-bleed background photo */}
      <PhotoSlideshow uri={currentPhoto?.uri ?? null} />

      <LinearGradient
        pointerEvents="none"
        colors={[
          "rgba(0,0,0,0.78)",
          "rgba(0,0,0,0.38)",
          "rgba(0,0,0,0)",
        ]}
        locations={[0, 0.45, 1]}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "48%",
        }}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[
          "rgba(0,0,0,0)",
          "rgba(0,0,0,0.28)",
          "rgba(0,0,0,0.68)",
        ]}
        locations={[0, 0.5, 1]}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "50%",
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
            fontFamily: "Roboto-Light",
            fontSize: 15,
            color: "rgba(255, 255, 255, 0.7)",
            marginTop: 4,
          }}
        >
          What was this day&apos;s moment?
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
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="add" size={24} color="#000000" />
          </View>
        </Pressable>
      </View>

      {/* Bottom controls */}
      <View
        className="absolute bottom-0 left-0 right-0 items-center"
        style={{ paddingBottom: insets.bottom + 100 }}
      >
        <View className="flex-row items-center justify-center" style={{ gap: 28 }}>
          {/* Add moment — same as top-right + */}
          <Pressable onPress={handleMakeMoment}>
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                backgroundColor: colors.primary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="add" size={28} color="#000000" />
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

      <InfoTipModal
        visible={showInfo}
        onClose={() => setShowInfo(false)}
        title="How Rewind Works"
        scrollable
      >
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 15,
            color: "#333333",
            lineHeight: 22,
          }}
        >
          Rewind pulls a random photo from your camera roll. Spin the dial to browse through your photos by date, or tap the dice for a surprise.
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 15,
            color: "#333333",
            lineHeight: 22,
            marginTop: 16,
          }}
        >
          When a photo sparks a memory, tap + to write a Little Moment about it. Don&apos;t forget the story — the feelings, the sounds, the details that made it matter.
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 15,
            color: "#333333",
            lineHeight: 22,
            marginTop: 16,
          }}
        >
          Hit play to start an auto-slideshow. Share your favorite rediscoveries with friends.
        </Text>
      </InfoTipModal>
    </View>
  );
}
