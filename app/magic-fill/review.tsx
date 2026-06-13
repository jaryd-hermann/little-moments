import { useMemo, useRef } from "react";
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
import { useTheme } from "@/hooks/useTheme";
import { formatMagicFillDateShort } from "@/lib/magicFill";
import {
  MAGIC_FILL_DATE_PILL,
  magicFillHeadlineStyle,
} from "@/lib/magicFillTypography";
import {
  useMagicFillStore,
  type MagicFillDraft,
} from "@/store/magicFillStore";
import { DayAssetPreview } from "@/components/capture/DayAssetPreview";
import { MagicFillScreenHeader } from "@/components/magic-fill/MagicFillScreenHeader";
import { MagicFillPrimaryButton } from "@/components/magic-fill/MagicFillPrimaryButton";

const CARD_HEIGHT = Math.round(Dimensions.get("window").width * 0.72);

function ReviewCard({
  draft,
  onShuffle,
  onSkip,
  onPhotoIndexChange,
}: {
  draft: MagicFillDraft;
  onShuffle: () => void;
  onSkip: () => void;
  onPhotoIndexChange: (index: number) => void;
}) {
  const { colors } = useTheme();
  const photoWidth = Dimensions.get("window").width - 40;
  const listRef = useRef<FlatList>(null);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / photoWidth);
    if (idx !== draft.selectedIndex && idx >= 0 && idx < draft.photos.length) {
      onPhotoIndexChange(idx);
    }
  };

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
          renderItem={({ item }) => (
            <View style={{ width: photoWidth, height: CARD_HEIGHT }}>
              <DayAssetPreview asset={item} forceLivePlayback />
            </View>
          )}
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
            onPress={onShuffle}
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
            onPress={onSkip}
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
}

export default function MagicFillReviewScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  const drafts = useMagicFillStore((s) => s.drafts);
  const skipDay = useMagicFillStore((s) => s.skipDay);
  const shufflePhoto = useMagicFillStore((s) => s.shufflePhoto);
  const setSelectedPhotoIndex = useMagicFillStore((s) => s.setSelectedPhotoIndex);

  const activeDrafts = useMemo(
    () => drafts.filter((d) => !d.skipped),
    [drafts]
  );

  const handleContinue = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/magic-fill/caption-mode");
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <MagicFillScreenHeader />
      <FlatList
        data={activeDrafts}
        keyExtractor={(d) => d.ymd}
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
              {activeDrafts.length} moments found
            </Text>
            <Text
              style={{
                fontFamily: "Roboto-Regular",
                fontSize: 15,
                color: colors.textSecondary,
              }}
            >
              We picked the best photo per day. Swap or skip any.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <ReviewCard
            draft={item}
            onShuffle={() => {
              posthog.capture("magic_fill_review_shuffle", { ymd: item.ymd });
              shufflePhoto(item.ymd);
            }}
            onSkip={() => {
              posthog.capture("magic_fill_review_skip", { ymd: item.ymd });
              skipDay(item.ymd);
            }}
            onPhotoIndexChange={(index) =>
              setSelectedPhotoIndex(item.ymd, index)
            }
          />
        )}
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
