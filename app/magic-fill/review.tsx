import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Pressable,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { usePostHog } from "posthog-react-native";
import { prefetchNeighborMediaUris } from "@/hooks/useMediaLibrary";
import { useTheme } from "@/hooks/useTheme";
import { formatMagicFillDateShort } from "@/lib/magicFill";
import { collectSelectedVideosFromDrafts } from "@/lib/magicFillYouPick";
import {
  MAGIC_FILL_DATE_PILL,
  magicFillHeadlineStyle,
} from "@/lib/magicFillTypography";
import {
  useMagicFillStore,
  type MagicFillDraft,
  type PickedVideoClip,
  displayPhotoAsset,
  videoClipStartForPhoto,
} from "@/store/magicFillStore";
import { DayAssetPreview } from "@/components/capture/DayAssetPreview";
import { MagicFillScreenHeader } from "@/components/magic-fill/MagicFillScreenHeader";
import { MagicFillPrimaryButton } from "@/components/magic-fill/MagicFillPrimaryButton";

const CARD_HEIGHT = Math.round(Dimensions.get("window").width * 0.72);

const ReviewCard = memo(function ReviewCard({
  draft,
  pickedVideoClips,
  onShuffle,
  onSkip,
  onPhotoIndexChange,
}: {
  draft: MagicFillDraft;
  pickedVideoClips: Record<string, PickedVideoClip>;
  onShuffle: (ymd: string) => void;
  onSkip: (ymd: string) => void;
  onPhotoIndexChange: (ymd: string, index: number) => void;
}) {
  const { colors } = useTheme();
  const photoWidth = Dimensions.get("window").width - 40;
  const listRef = useRef<FlatList>(null);

  /** Page actually on screen — drives which cell is allowed to animate. */
  const [activeIndex, setActiveIndex] = useState(0);
  /** Debounced active index so swiping doesn't spin up players mid-gesture. */
  const [animateIndex, setAnimateIndex] = useState(0);
  /** Lazily resolved (`ph://` → `file://`) URIs for the active page ±1. */
  const [displayUriByAsset, setDisplayUriByAsset] = useState<
    Record<string, string>
  >({});
  const resolvedDisplayUriIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setAnimateIndex(activeIndex), 120);
    return () => clearTimeout(t);
  }, [activeIndex]);

  useEffect(() => {
    if (draft.photos.length === 0) return;
    prefetchNeighborMediaUris(
      draft.photos,
      activeIndex,
      resolvedDisplayUriIdsRef.current,
      (resolved) => {
        setDisplayUriByAsset((prev) => ({
          ...prev,
          [resolved.id]: resolved.uri,
        }));
      }
    );
  }, [draft.photos, activeIndex]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / photoWidth);
      if (idx < 0 || idx >= draft.photos.length) return;
      setActiveIndex(idx);
      if (idx !== draft.selectedIndex) onPhotoIndexChange(draft.ymd, idx);
    },
    [photoWidth, draft.photos.length, draft.selectedIndex, draft.ymd, onPhotoIndexChange]
  );

  return (
    <View style={{ marginBottom: 20 }}>
      <View
        style={{
          height: CARD_HEIGHT,
          borderRadius: 20,
          overflow: "hidden",
          backgroundColor: colors.surfaceSecondary,
        }}
      >
        <FlatList
          ref={listRef}
          data={draft.photos}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          onMomentumScrollEnd={handleScroll}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          windowSize={3}
          removeClippedSubviews
          getItemLayout={(_, index) => ({
            length: photoWidth,
            offset: photoWidth * index,
            index,
          })}
          renderItem={({ item, index }) => {
            const resolvedUri = displayUriByAsset[item.id];
            const base =
              resolvedUri != null ? { ...item, uri: resolvedUri } : item;
            const display = displayPhotoAsset(base, pickedVideoClips);
            return (
              <View style={{ width: photoWidth, height: CARD_HEIGHT }}>
                <DayAssetPreview
                  asset={display}
                  animate={index === animateIndex}
                  forceLivePlayback
                  videoClipStartSec={videoClipStartForPhoto(
                    item,
                    pickedVideoClips
                  )}
                />
              </View>
            );
          }}
        />

        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 9999,
            ...MAGIC_FILL_DATE_PILL,
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 12,
              color: "#1A1A1A",
            }}
          >
            {formatMagicFillDateShort(draft.date)}
          </Text>
        </View>

        <View
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            flexDirection: "row",
            gap: 8,
          }}
        >
          <Pressable
            accessibilityLabel="Shuffle photo"
            onPress={() => onShuffle(draft.ymd)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: "rgba(255,255,255,0.92)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="shuffle" size={18} color="#1A1A1A" />
          </Pressable>
          <Pressable
            accessibilityLabel="Skip day"
            onPress={() => onSkip(draft.ymd)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: "rgba(255,255,255,0.92)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="close" size={20} color="#1A1A1A" />
          </Pressable>
        </View>

        {draft.photos.length > 1 ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              bottom: 12,
              left: 0,
              right: 0,
              flexDirection: "row",
              justifyContent: "center",
              gap: 6,
            }}
          >
            {draft.photos.map((_, i) => (
              <View
                key={i}
                style={{
                  width: i === draft.selectedIndex ? 8 : 6,
                  height: i === draft.selectedIndex ? 8 : 6,
                  borderRadius: 4,
                  backgroundColor:
                    i === draft.selectedIndex
                      ? "#FFFFFF"
                      : "rgba(255,255,255,0.45)",
                }}
              />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
});

export default function MagicFillReviewScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  const drafts = useMagicFillStore((s) => s.drafts);
  const fillMode = useMagicFillStore((s) => s.fillMode);
  const pickedVideoClips = useMagicFillStore((s) => s.pickedVideoClips);
  const skipDay = useMagicFillStore((s) => s.skipDay);
  const shufflePhoto = useMagicFillStore((s) => s.shufflePhoto);
  const setSelectedPhotoIndex = useMagicFillStore((s) => s.setSelectedPhotoIndex);

  const activeDrafts = useMemo(
    () => drafts.filter((d) => !d.skipped),
    [drafts]
  );

  const handleShuffle = useCallback(
    (ymd: string) => {
      posthog.capture("magic_fill_review_shuffle", { ymd });
      shufflePhoto(ymd);
    },
    [posthog, shufflePhoto]
  );

  const handleSkip = useCallback(
    (ymd: string) => {
      posthog.capture("magic_fill_review_skip", { ymd });
      skipDay(ymd);
    },
    [posthog, skipDay]
  );

  const handlePhotoIndexChange = useCallback(
    (ymd: string, index: number) => {
      setSelectedPhotoIndex(ymd, index);
    },
    [setSelectedPhotoIndex]
  );

  const renderDraft = useCallback(
    ({ item }: { item: MagicFillDraft }) => (
      <ReviewCard
        draft={item}
        pickedVideoClips={pickedVideoClips}
        onShuffle={handleShuffle}
        onSkip={handleSkip}
        onPhotoIndexChange={handlePhotoIndexChange}
      />
    ),
    [pickedVideoClips, handleShuffle, handleSkip, handlePhotoIndexChange]
  );

  const handleContinue = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (fillMode === "you_pick" || fillMode === "favorites") {
      const videos = collectSelectedVideosFromDrafts(
        activeDrafts,
        pickedVideoClips
      );
      if (videos.length > 0) {
        router.push("/magic-fill/trim-queue");
        return;
      }
    }
    router.push("/magic-fill/caption-mode");
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <MagicFillScreenHeader />
      <FlatList
        data={activeDrafts}
        keyExtractor={(d) => d.ymd}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={3}
        removeClippedSubviews
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 4,
          paddingBottom: Math.max(insets.bottom, 16) + 80,
        }}
        ListHeaderComponent={
          <View style={{ marginBottom: 20 }}>
            <Text
              style={magicFillHeadlineStyle({
                fontSize: 28,
                lineHeight: 34,
                color: colors.text,
                marginBottom: 6,
              })}
            >
              {activeDrafts.length}{" "}
              {fillMode === "you_pick" || fillMode === "favorites"
                ? "moments queued"
                : "moments found"}
            </Text>
            <Text
              style={{
                fontFamily: "Roboto-Regular",
                fontSize: 15,
                color: colors.textSecondary,
              }}
            >
              {fillMode === "favorites"
                ? "Your favorite moments — one per day. Swap or skip any."
                : fillMode === "you_pick"
                  ? "Your picks, grouped by day. Swap or skip any."
                  : "We picked the best photo per day. Swap or skip any."}
            </Text>
          </View>
        }
        renderItem={renderDraft}
      />
      <View
        style={{
          position: "absolute",
          left: 20,
          right: 20,
          bottom: Math.max(insets.bottom, 16),
        }}
      >
        <MagicFillPrimaryButton
          label="Capture these moments"
          variant="pink"
          onPress={handleContinue}
          disabled={activeDrafts.length === 0}
        />
      </View>
    </View>
  );
}
