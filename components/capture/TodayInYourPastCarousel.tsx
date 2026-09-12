import { CaptureSectionHeading } from "@/components/capture/CaptureSectionHeading";
import { CaptureDatePill } from "@/components/capture/CaptureDatePill";
import { CaptureVideoPreview } from "@/components/capture/CaptureVideoPreview";
import { DayAssetPreview } from "@/components/capture/DayAssetPreview";
import { LocationTag } from "@/components/common/LocationTag";
import {
  getAssetGeoLocation,
  hasFullPhotoLibraryAccess,
  prefetchNeighborMediaUris,
  querySameDateInPastCatalog,
  type MediaAsset,
  type PhotoLibraryAccessPrivileges,
} from "@/hooks/useMediaLibrary";
import { useTheme } from "@/hooks/useTheme";
import { reverseGeocode } from "@/lib/reverseGeocode";
import { bevelShadow, PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";
import { photoCardBorder } from "@/lib/momentTypography";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import * as Haptics from "expo-haptics";
import type * as MediaLibrary from "expo-media-library";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

const GUTTER = 20;
const INITIAL_BATCH = 5;
const SCROLL_BATCH = 5;
const MAX_YEARS_BACK = 10;
const MAX_DOT_INDICATORS = 10;

export interface TodayInYourPastCarouselProps {
  /** The section date — month/day used for the lookup. */
  date: Date;
  /** When false, the section title reads "This Day In Your Past". */
  isToday?: boolean;
  permissionStatus: MediaLibrary.PermissionStatus | null;
  accessPrivileges: PhotoLibraryAccessPrivileges;
  /**
   * Tap "+ Log Moment". Receives the original asset (with `creationTime`) so
   * the parent can route the resulting moment to the photo's original year.
   */
  onLogMoment: (asset: MediaAsset) => void;
  /** Tap a card without the CTA — opens the photo full-screen. Optional. */
  onPressPhoto?: (asset: MediaAsset) => void;
}

export function TodayInYourPastCarousel({
  date,
  isToday = true,
  permissionStatus,
  accessPrivileges,
  onLogMoment,
}: TodayInYourPastCarouselProps) {
  const { colors, theme } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const CARD_WIDTH = screenWidth - GUTTER * 2;
  const CARD_HEIGHT = Math.round(CARD_WIDTH * 1.1);
  const PAGE_WIDTH = screenWidth;

  /** Full lightweight catalog (metadata only) — slice into `photos` on demand. */
  const catalogRef = useRef<MediaAsset[]>([]);
  const [photos, setPhotos] = useState<MediaAsset[] | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const [index, setIndex] = useState(0);
  const [animateIndex, setAnimateIndex] = useState(0);
  const [locationByAsset, setLocationByAsset] = useState<
    Record<string, string | null>
  >({});
  const [displayUriByAsset, setDisplayUriByAsset] = useState<
    Record<string, string>
  >({});
  const resolvedAssetIdsRef = useRef<Set<string>>(new Set());
  const resolvedDisplayUriIdsRef = useRef<Set<string>>(new Set());
  const listRef = useRef<FlatList<MediaAsset>>(null);

  const dayParts = useMemo(() => {
    const month = date.getMonth();
    const day = date.getDate();
    return { month, day, dayKey: format(date, "yyyy-MM-dd") };
  }, [date]);

  useEffect(() => {
    let cancelled = false;
    catalogRef.current = [];
    setPhotos(null);
    setTotalCount(0);
    setLoadedCount(0);
    setIndex(0);
    setAnimateIndex(0);
    setLocationByAsset({});
    setDisplayUriByAsset({});
    resolvedAssetIdsRef.current = new Set();
    resolvedDisplayUriIdsRef.current = new Set();

    void (async () => {
      try {
        const can = hasFullPhotoLibraryAccess(
          permissionStatus,
          accessPrivileges
        );
        if (!can) {
          if (!cancelled) setPhotos([]);
          return;
        }

        const catalog = await querySameDateInPastCatalog(
          dayParts.month,
          dayParts.day,
          { maxYearsBack: MAX_YEARS_BACK, lightweight: true }
        );
        if (cancelled) return;

        catalogRef.current = catalog;
        const initial = Math.min(INITIAL_BATCH, catalog.length);
        setTotalCount(catalog.length);
        setLoadedCount(initial);
        setPhotos(catalog.slice(0, initial));
      } catch {
        if (!cancelled) setPhotos([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dayParts.dayKey, dayParts.month, dayParts.day, permissionStatus, accessPrivileges]);

  const appendMoreMedia = useCallback(() => {
    if (loadedCount >= totalCount) return;
    const next = Math.min(totalCount, loadedCount + SCROLL_BATCH);
    setLoadedCount(next);
    setPhotos(catalogRef.current.slice(0, next));
  }, [loadedCount, totalCount]);

  useEffect(() => {
    const t = setTimeout(() => setAnimateIndex(index), 120);
    return () => clearTimeout(t);
  }, [index]);

  useEffect(() => {
    if (!photos || photos.length === 0) return;
    const asset = photos[index];
    if (!asset || resolvedAssetIdsRef.current.has(asset.id)) return;

    let cancelled = false;
    resolvedAssetIdsRef.current.add(asset.id);
    void (async () => {
      try {
        const geo = await getAssetGeoLocation(asset.id);
        if (!geo) {
          if (!cancelled) {
            setLocationByAsset((prev) => ({ ...prev, [asset.id]: null }));
          }
          return;
        }
        const name = await reverseGeocode(geo.latitude, geo.longitude);
        if (!cancelled) {
          setLocationByAsset((prev) => ({ ...prev, [asset.id]: name }));
        }
      } catch {
        if (!cancelled) {
          setLocationByAsset((prev) => ({ ...prev, [asset.id]: null }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [photos, index]);

  const sectionTitle = isToday ? "Today In Your Past" : "This Day In Your Past";

  useEffect(() => {
    if (!photos || photos.length === 0) return;

    prefetchNeighborMediaUris(
      photos,
      index,
      resolvedDisplayUriIdsRef.current,
      (resolved) => {
        setDisplayUriByAsset((prev) => ({
          ...prev,
          [resolved.id]: resolved.uri,
        }));
      }
    );
  }, [photos, index]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const page = Math.round(e.nativeEvent.contentOffset.x / PAGE_WIDTH);
      if (page !== index && page >= 0) {
        setIndex(page);
        void Haptics.selectionAsync();
      }
      if (
        photos &&
        page >= photos.length - 2 &&
        loadedCount < totalCount
      ) {
        appendMoreMedia();
      }
    },
    [PAGE_WIDTH, index, photos, loadedCount, totalCount, appendMoreMedia]
  );

  if (photos == null) {
    return (
      <View style={{ marginTop: 28 }}>
        <CaptureSectionHeading
          title={sectionTitle}
          description={
            "Quickly add moments from your past on this date.\n\nDon't just create the story of your year, fill up your Capsule and create a movie of your life!"
          }
          gutter={GUTTER}
        />
        <View style={{ paddingHorizontal: GUTTER, paddingBottom: 8 }}>
          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 14,
              color: colors.textMuted,
            }}
          >
            Looking for memories from this day…
          </Text>
        </View>
      </View>
    );
  }
  if (photos.length === 0) return null;

  const dotActive = theme === "dark" ? "#FFFFFF" : "#000000";
  const dotMuted =
    theme === "dark" ? "rgba(255,255,255,0.32)" : "rgba(0,0,0,0.28)";

  return (
    <View style={{ marginTop: 28 }}>
      <CaptureSectionHeading
        title={sectionTitle}
        description={
          "Quickly add moments from your past on this date.\n\nDon't just create the story of your year, fill up your Capsule and create a movie of your life!"
        }
        gutter={GUTTER}
      />
      <FlatList
        ref={listRef}
        data={photos}
        keyExtractor={(item, i) => `${item.id}-${i}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        snapToInterval={PAGE_WIDTH}
        decelerationRate="fast"
        style={{ height: CARD_HEIGHT }}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={3}
        removeClippedSubviews
        renderItem={({ item, index: itemIndex }) => {
          const taken = new Date(item.creationTime);
          const year = format(taken, "yyyy");
          const time = format(taken, "HH:mm:ss");
          const locationName = locationByAsset[item.id] ?? null;
          const resolvedUri = displayUriByAsset[item.id];
          const displayAsset =
            resolvedUri != null ? { ...item, uri: resolvedUri } : item;
          const shouldAnimate = itemIndex === animateIndex;
          return (
            <View
              style={{
                width: PAGE_WIDTH,
                height: CARD_HEIGHT,
                paddingHorizontal: GUTTER,
              }}
            >
              <View
                style={[
                  {
                    width: CARD_WIDTH,
                    height: CARD_HEIGHT,
                    borderRadius: 16,
                    ...photoCardBorder(colors.text),
                    overflow: "hidden",
                    backgroundColor: colors.surfaceSecondary,
                  },
                  bevelShadow(theme),
                ]}
              >
                <View style={{ flex: 1, overflow: "hidden" }}>
                  <View
                    style={StyleSheet.absoluteFillObject}
                    pointerEvents={item.mediaType === "video" ? "box-none" : "none"}
                  >
                    {item.mediaType === "video" ? (
                      <CaptureVideoPreview
                        asset={displayAsset}
                        resolvedUri={resolvedUri}
                        isActive={shouldAnimate}
                      />
                    ) : (
                      <DayAssetPreview
                        asset={displayAsset}
                        animate={shouldAnimate}
                        forceLivePlayback
                      />
                    )}
                  </View>

                  <View
                    style={[StyleSheet.absoluteFillObject, { zIndex: 2 }]}
                    pointerEvents="box-none"
                  >
                    <View
                      style={{
                        position: "absolute",
                        top: 14,
                        left: 14,
                        gap: 6,
                      }}
                      pointerEvents="none"
                    >
                      <CaptureDatePill label={year} />
                      <CaptureDatePill label={time} compact />
                      {item.mediaType === "video" ? (
                        <View
                          style={{
                            alignSelf: "flex-start",
                            paddingHorizontal: 8,
                            paddingVertical: 6,
                            borderRadius: 9999,
                            backgroundColor: "#FFC100",
                            borderWidth: 2,
                            borderColor: "#000000",
                          }}
                        >
                          <Ionicons name="videocam" size={12} color="#1A1A1A" />
                        </View>
                      ) : null}
                      {locationName ? (
                        <LocationTag name={locationName} variant="overlay" />
                      ) : null}
                    </View>

                    <View
                      style={{
                        position: "absolute",
                        bottom: 16,
                        left: 16,
                      }}
                    >
                      <Pressable
                        onPress={() => {
                          void Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Medium
                          );
                          onLogMoment(item);
                        }}
                        style={({ pressed }) => ({
                          opacity: pressed ? 0.85 : 1,
                        })}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                            paddingHorizontal: 16,
                            paddingVertical: 11,
                            borderRadius: 9999,
                            backgroundColor: colors.primary,
                            borderWidth: 2,
                            borderColor: PINK_CTA_BORDER,
                            ...bevelShadow(theme),
                          }}
                        >
                          <Ionicons name="add" size={18} color={PINK_CTA_INK} />
                          <Text
                            style={{
                              fontFamily: "Roboto-Medium",
                              fontSize: 14,
                              letterSpacing: 0.4,
                              color: PINK_CTA_INK,
                            }}
                          >
                            Log Memory
                          </Text>
                        </View>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          );
        }}
      />

      {totalCount > 1 ? (
        totalCount > MAX_DOT_INDICATORS ? (
          <Text
            style={{
              marginTop: 10,
              textAlign: "center",
              fontFamily: "Roboto-Medium",
              fontSize: 12,
              letterSpacing: 0.4,
              color: colors.textMuted,
            }}
          >
            {index + 1}/{totalCount}
          </Text>
        ) : (
          <View
            style={{
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
              gap: 6,
              marginTop: 10,
            }}
          >
            {Array.from({ length: totalCount }, (_, i) => (
              <View
                key={i}
                style={{
                  width: i === index ? 16 : 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: i === index ? dotActive : dotMuted,
                  opacity: i < loadedCount ? 1 : 0.35,
                }}
              />
            ))}
          </View>
        )
      ) : null}
    </View>
  );
}
