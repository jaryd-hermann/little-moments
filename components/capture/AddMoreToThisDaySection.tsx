import { CaptureSectionHeading } from "@/components/capture/CaptureSectionHeading";
import { DayAssetPreview } from "@/components/capture/DayAssetPreview";
import {
  prefetchNeighborMediaUris,
  type MediaAsset,
} from "@/hooks/useMediaLibrary";
import { useTheme } from "@/hooks/useTheme";
import { bevelShadow, PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";
import { photoCardBorder } from "@/lib/momentTypography";
import type { Entry } from "@/store/entryStore";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

const INITIAL_PHOTOS = 9;
const PHOTOS_STEP = 9;
const COLUMNS = 3;
const CARD_PAD = 16;
const GRID_GAP = 8;
const HORIZONTAL_GUTTER = 20;

function usedPhotoTimesMs(entries: Entry[]): number[] {
  const out: number[] = [];
  for (const entry of entries) {
    const takenAt = entry.media?.find((m) => m.taken_at)?.taken_at;
    if (!takenAt) continue;
    const ms = new Date(takenAt).getTime();
    if (Number.isFinite(ms)) out.push(ms);
  }
  return out;
}

function isPhotoAlreadyUsed(asset: MediaAsset, usedTimes: number[]): boolean {
  return usedTimes.some((t) => Math.abs(t - asset.creationTime) < 2000);
}

function PhotoRadioIndicator({
  selected,
  fillColor,
}: {
  selected: boolean;
  fillColor: string;
}) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 7,
        right: 7,
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: "#FFFFFF",
        backgroundColor: selected ? fillColor : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {selected ? (
        <Ionicons name="checkmark" size={12} color={PINK_CTA_INK} />
      ) : null}
    </View>
  );
}

export interface AddMoreToThisDaySectionProps {
  entriesForDay: Entry[];
  dayPhotos: MediaAsset[];
  onCapturePhoto: (asset: MediaAsset) => void;
}

export function AddMoreToThisDaySection({
  entriesForDay,
  dayPhotos,
  onCapturePhoto,
}: AddMoreToThisDaySectionProps) {
  const { colors, theme } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_PHOTOS);
  const [displayUriByAsset, setDisplayUriByAsset] = useState<
    Record<string, string>
  >({});
  const resolvedDisplayUriIdsRef = useRef<Set<string>>(new Set());

  const availablePhotos = useMemo(() => {
    const usedTimes = usedPhotoTimesMs(entriesForDay);
    return dayPhotos.filter((p) => !isPhotoAlreadyUsed(p, usedTimes));
  }, [dayPhotos, entriesForDay]);

  const displayPhotos = useMemo(
    () => availablePhotos.slice(0, visibleCount),
    [availablePhotos, visibleCount]
  );

  const remainingCount = Math.max(0, availablePhotos.length - displayPhotos.length);
  const revealStep = Math.min(PHOTOS_STEP, remainingCount);

  const photoRows = useMemo(() => {
    const rows: MediaAsset[][] = [];
    for (let i = 0; i < displayPhotos.length; i += COLUMNS) {
      rows.push(displayPhotos.slice(i, i + COLUMNS));
    }
    return rows;
  }, [displayPhotos]);

  const innerWidth = screenWidth - HORIZONTAL_GUTTER * 2 - CARD_PAD * 2;
  const cellSize = Math.floor(
    (innerWidth - GRID_GAP * (COLUMNS - 1)) / COLUMNS
  );

  const selectedAsset = useMemo(
    () => displayPhotos.find((p) => p.id === selectedId) ?? null,
    [displayPhotos, selectedId]
  );

  useEffect(() => {
    setDisplayUriByAsset({});
    resolvedDisplayUriIdsRef.current = new Set();
    setSelectedId(null);
    setVisibleCount(INITIAL_PHOTOS);
  }, [availablePhotos]);

  useEffect(() => {
    if (displayPhotos.length === 0) return;
    const centerIndex = selectedId
      ? Math.max(0, displayPhotos.findIndex((p) => p.id === selectedId))
      : 0;
    prefetchNeighborMediaUris(
      displayPhotos,
      centerIndex,
      resolvedDisplayUriIdsRef.current,
      (resolved) => {
        setDisplayUriByAsset((prev) => ({
          ...prev,
          [resolved.id]: resolved.uri,
        }));
      }
    );
  }, [displayPhotos, selectedId]);

  if (displayPhotos.length === 0) return null;

  return (
    <View style={{ marginTop: 24 }}>
      <View
        style={[
          {
            borderRadius: 16,
            ...photoCardBorder(colors.text),
            backgroundColor: colors.surface,
            padding: CARD_PAD,
          },
          bevelShadow(theme),
        ]}
      >
      <CaptureSectionHeading
        title="Add more to this day"
        description="After adding your main moment, you can always add another moment from the day you want to remember"
        gutter={0}
        style={{ marginBottom: 14 }}
      />

        <View style={{ marginBottom: 4 }}>
          {photoRows.map((row, rowIndex) => (
            <View
              key={row.map((a) => a.id).join("-")}
              style={{
                flexDirection: "row",
                gap: GRID_GAP,
                marginBottom: rowIndex < photoRows.length - 1 ? GRID_GAP : 0,
              }}
            >
              {row.map((asset) => {
                const selected = asset.id === selectedId;
                const resolvedUri = displayUriByAsset[asset.id];
                const displayAsset =
                  resolvedUri != null ? { ...asset, uri: resolvedUri } : asset;
                const shouldAnimate = selected && asset.mediaType !== "video";
                return (
                  <Pressable
                    key={asset.id}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setSelectedId((prev) =>
                        prev === asset.id ? null : asset.id
                      );
                    }}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      borderRadius: 10,
                      overflow: "hidden",
                      borderWidth: selected ? 2.5 : 2,
                      borderColor: selected ? colors.primary : colors.text,
                    }}
                  >
                    <DayAssetPreview asset={displayAsset} animate={shouldAnimate} />
                    {asset.mediaType === "video" ? (
                      <View
                        pointerEvents="none"
                        style={{
                          position: "absolute",
                          bottom: 4,
                          left: 4,
                          paddingHorizontal: 5,
                          paddingVertical: 3,
                          borderRadius: 9999,
                          backgroundColor: "#FFC100",
                          borderWidth: 1.5,
                          borderColor: "#000000",
                        }}
                      >
                        <Ionicons name="videocam" size={10} color="#1A1A1A" />
                      </View>
                    ) : null}
                    <PhotoRadioIndicator
                      selected={selected}
                      fillColor={colors.primary}
                    />
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>

        {remainingCount > 0 ? (
          <Pressable
            onPress={() => {
              void Haptics.selectionAsync();
              setVisibleCount((c) => c + PHOTOS_STEP);
            }}
            accessibilityRole="button"
            style={({ pressed }) => ({
              marginTop: 12,
              alignSelf: "center",
              opacity: pressed ? 0.7 : 1,
            })}
            hitSlop={8}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 16,
                paddingVertical: 9,
                borderRadius: 9999,
                borderWidth: 1.5,
                borderColor: colors.border,
              }}
            >
              <Ionicons name="add" size={16} color={colors.text} />
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 13,
                  color: colors.text,
                  letterSpacing: 0.3,
                }}
              >
                See +{revealStep} more
              </Text>
            </View>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => {
            if (!selectedAsset) return;
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onCapturePhoto(selectedAsset);
          }}
          disabled={!selectedAsset}
          accessibilityRole="button"
          accessibilityState={{ disabled: !selectedAsset }}
          style={({ pressed }) => ({
            marginTop: remainingCount > 0 ? 20 : 48,
            marginBottom: 12,
            opacity: !selectedAsset ? 0.55 : pressed ? 0.92 : 1,
          })}
        >
          <View
            style={{
              height: 56,
              borderRadius: 9999,
              backgroundColor: colors.primary,
              borderWidth: 2,
              borderColor: PINK_CTA_BORDER,
              alignItems: "center",
              justifyContent: "center",
              ...bevelShadow(theme),
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                color: PINK_CTA_INK,
                letterSpacing: 0.8,
                textTransform: "uppercase",
              }}
            >
              {selectedAsset ? "Capture this moment too" : "Tap another moment"}
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}
