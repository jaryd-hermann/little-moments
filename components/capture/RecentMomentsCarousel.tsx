import { CaptureDatePill } from "@/components/capture/CaptureDatePill";
import { CaptureVideoPreview } from "@/components/capture/CaptureVideoPreview";
import { DayAssetPreview } from "@/components/capture/DayAssetPreview";
import {
  prefetchNeighborMediaUris,
  type MediaAsset,
} from "@/hooks/useMediaLibrary";
import { useTheme } from "@/hooks/useTheme";
import { bevelShadow, PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

/** A swipeable slide: either a real camera-roll item or the "capture today" card. */
export type RecentFeedItem =
  | { type: "today-empty"; key: string }
  | { type: "media"; key: string; asset: MediaAsset };

/** Local calendar day (midnight) for a timestamp. */
function dayForTime(ms: number): Date {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isSameYmd(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

interface RecentMomentsCarouselProps {
  items: RecentFeedItem[];
  loading: boolean;
  /** Index to centre on first mount (e.g. onboarding → most recent media). */
  initialIndex?: number;
  /** Fired live as the centred slide crosses into a new day (drives the ticker header). */
  onActiveDayChange?: (day: Date) => void;
  /** Fired once the swipe settles — re-target the per-day content below. */
  onSettleDay?: (day: Date) => void;
  /** Pick the active media item for capture. */
  onChoose: (asset: MediaAsset, day: Date) => void;
  /** Launch the native camera (today-empty slide / "take a photo" CTA). */
  onCaptureWithCamera?: () => void;
  /** Near the end of the loaded feed — ask the parent to load more. */
  onEndReached?: () => void;
}

export interface RecentMomentsCarouselHandle {
  /** Snap the carousel to the first loaded slide for the given day. */
  scrollToDay: (day: Date) => void;
}

const RecentMomentsCarouselInner = forwardRef<
  RecentMomentsCarouselHandle,
  RecentMomentsCarouselProps
>(function RecentMomentsCarousel(
  {
    items,
    loading,
    initialIndex = 0,
    onActiveDayChange,
    onSettleDay,
    onChoose,
    onCaptureWithCamera,
    onEndReached,
  }: RecentMomentsCarouselProps,
  ref
) {
  const { colors, theme } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const PAGE_WIDTH = screenWidth;
  const MAIN_CARD_WIDTH = Math.max(260, screenWidth - 52);
  const MAIN_CARD_HEIGHT = MAIN_CARD_WIDTH;
  const PEEK_W = MAIN_CARD_WIDTH - 36;
  const PEEK_H = MAIN_CARD_HEIGHT - 28;

  const listRef = useRef<FlatList<RecentFeedItem>>(null);
  // Continuous scroll position (in px) — drives the carousel-style dot strip.
  const scrollX = useRef(new Animated.Value(initialIndex * PAGE_WIDTH)).current;
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  // Mirrors `activeIndex` synchronously so scroll callbacks can read the
  // current page without depending on (and re-subscribing to) render state.
  const activeIndexRef = useRef(initialIndex);
  const lastHapticIdx = useRef(initialIndex);
  const lastReportedDayRef = useRef<string | null>(null);
  const [displayUriByAsset, setDisplayUriByAsset] = useState<
    Record<string, string>
  >({});
  const resolvedUriIdsRef = useRef<Set<string>>(new Set());

  const todayDate = useMemo(() => dayForTime(Date.now()), []);

  const dayForItem = useCallback(
    (item: RecentFeedItem | undefined): Date => {
      if (!item) return todayDate;
      if (item.type === "today-empty") return todayDate;
      return dayForTime(item.asset.creationTime);
    },
    [todayDate]
  );

  // Jump to the requested initial slide once the feed is populated.
  const didInitialScroll = useRef(false);
  useEffect(() => {
    if (didInitialScroll.current) return;
    if (loading || items.length === 0) return;
    didInitialScroll.current = true;
    const target = Math.min(Math.max(initialIndex, 0), items.length - 1);
    scrollX.setValue(target * PAGE_WIDTH);
    if (target > 0) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          listRef.current?.scrollToOffset({
            offset: target * PAGE_WIDTH,
            animated: false,
          });
        });
      });
    }
    setActiveIndex(target);
    activeIndexRef.current = target;
    lastHapticIdx.current = target;
    const d = dayForItem(items[target]);
    lastReportedDayRef.current = format(d, "yyyy-MM-dd");
    onActiveDayChange?.(d);
    onSettleDay?.(d);
  }, [
    loading,
    items,
    initialIndex,
    PAGE_WIDTH,
    dayForItem,
    onActiveDayChange,
    onSettleDay,
  ]);

  // Lazily resolve display URIs for the active card and its neighbours.
  useEffect(() => {
    if (items.length === 0) return;
    const mediaAssets = items
      .map((it) => (it.type === "media" ? it.asset : null))
      .filter((a): a is MediaAsset => a != null);
    if (mediaAssets.length === 0) return;
    // Map the active feed index onto the media-only array for neighbour prefetch.
    const activeAsset =
      items[activeIndex]?.type === "media"
        ? (items[activeIndex] as { asset: MediaAsset }).asset
        : null;
    const center = activeAsset
      ? mediaAssets.findIndex((a) => a.id === activeAsset.id)
      : 0;
    prefetchNeighborMediaUris(
      mediaAssets,
      Math.max(0, center),
      resolvedUriIdsRef.current,
      (resolved) => {
        setDisplayUriByAsset((prev) => ({
          ...prev,
          [resolved.id]: resolved.uri,
        }));
      }
    );
  }, [items, activeIndex]);

  const reportActiveDay = useCallback(
    (idx: number) => {
      const d = dayForItem(items[idx]);
      const ymd = format(d, "yyyy-MM-dd");
      if (ymd !== lastReportedDayRef.current) {
        lastReportedDayRef.current = ymd;
        onActiveDayChange?.(d);
      }
    },
    [items, dayForItem, onActiveDayChange]
  );

  // While the finger is dragging we only update the lightweight bits: the
  // animated dot strip (`scrollX`), a haptic tick, and the live header day.
  // The expensive `activeIndex` state (which decides which slide spins up a
  // Live Photo / video player) is deferred to `onMomentumScrollEnd` so the
  // list doesn't re-render — and tear players up and down — on every page
  // crossed mid-swipe. That churn was the source of the scroll jank.
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      scrollX.setValue(x);
      const page = Math.min(
        Math.max(Math.round(x / PAGE_WIDTH), 0),
        Math.max(0, items.length - 1)
      );
      if (page !== lastHapticIdx.current) {
        lastHapticIdx.current = page;
        void Haptics.selectionAsync();
        reportActiveDay(page);
      }
    },
    [PAGE_WIDTH, items.length, reportActiveDay, scrollX]
  );

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const page = Math.min(
        Math.max(Math.round(x / PAGE_WIDTH), 0),
        Math.max(0, items.length - 1)
      );
      if (page !== activeIndexRef.current) {
        activeIndexRef.current = page;
        setActiveIndex(page);
      }
      reportActiveDay(page);
      onSettleDay?.(dayForItem(items[page]));
      if (page >= items.length - 3) onEndReached?.();
    },
    [PAGE_WIDTH, items, dayForItem, reportActiveDay, onSettleDay, onEndReached]
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollToDay: (day: Date) => {
        let idx = items.findIndex(
          (it) =>
            it.type === "media" &&
            isSameYmd(dayForTime(it.asset.creationTime), day)
        );
        if (
          idx < 0 &&
          isSameYmd(day, todayDate) &&
          items[0]?.type === "today-empty"
        ) {
          idx = 0;
        }
        if (idx < 0) return;
        listRef.current?.scrollToOffset({
          offset: idx * PAGE_WIDTH,
          animated: false,
        });
        scrollX.setValue(idx * PAGE_WIDTH);
        setActiveIndex(idx);
        activeIndexRef.current = idx;
        lastHapticIdx.current = idx;
        const d = dayForItem(items[idx]);
        lastReportedDayRef.current = format(d, "yyyy-MM-dd");
        onActiveDayChange?.(d);
        onSettleDay?.(d);
      },
    }),
    [
      items,
      todayDate,
      PAGE_WIDTH,
      scrollX,
      dayForItem,
      onActiveDayChange,
      onSettleDay,
    ]
  );

  const activeItem = items[activeIndex];
  const activeDay = dayForItem(activeItem);
  const activeIsToday = isSameYmd(activeDay, todayDate);

  const renderItem = useCallback(
    ({ item, index }: { item: RecentFeedItem; index: number }) => {
      const isActive = index === activeIndex;

      if (item.type === "today-empty") {
        const nextEmpty = items[index + 1];
        const nextEmptyUri =
          nextEmpty?.type === "media"
            ? displayUriByAsset[nextEmpty.asset.id] ?? nextEmpty.asset.uri
            : null;
        return (
          <View
            style={{
              width: PAGE_WIDTH,
              alignItems: "center",
              paddingTop: 0,
            }}
          >
            <View
              style={{
                width: MAIN_CARD_WIDTH + 40,
                height: MAIN_CARD_HEIGHT,
                justifyContent: "flex-start",
                alignItems: "center",
              }}
            >
              {nextEmptyUri ? (
                <View
                  style={{
                    position: "absolute",
                    right: 4,
                    top: 8,
                    width: PEEK_W,
                    height: PEEK_H,
                    borderRadius: 14,
                    overflow: "hidden",
                    opacity: 0.5,
                    zIndex: 0,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.surfaceSecondary,
                  }}
                >
                  <Image
                    source={{ uri: nextEmptyUri }}
                    style={{ width: "100%", height: "100%" }}
                    contentFit="cover"
                  />
                </View>
              ) : null}
              <View
                style={{
                  width: MAIN_CARD_WIDTH,
                  height: MAIN_CARD_HEIGHT,
                  borderRadius: 16,
                  borderWidth: 2,
                  borderColor: colors.text,
                  backgroundColor:
                    theme === "dark" ? colors.surfaceSecondary : "#FFFFFF",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 28,
                  zIndex: 1,
                  ...bevelShadow(theme),
                }}
              >
              <Image
                source={require("@/assets/images/no-pic.png")}
                style={{ width: 148, height: 148, marginBottom: 6 }}
                contentFit="contain"
                // Black line work on transparency, so it needs inverting to stay
                // visible once the card goes dark.
                tintColor={theme === "dark" ? "#FFFFFF" : undefined}
              />
              <Text
                style={{
                  fontFamily: "PMGothicLudington-Text110",
                  fontSize: 24,
                  lineHeight: 30,
                  color: colors.text,
                  textAlign: "center",
                }}
              >
                Nothing captured today yet
              </Text>
              <Text
                style={{
                  fontFamily: "Roboto-Regular",
                  fontSize: 14,
                  lineHeight: 21,
                  color: colors.textSecondary,
                  textAlign: "center",
                  marginTop: 10,
                }}
              >
                Take a photo now, or swipe to pick a recent moment from your
                camera roll.
              </Text>
              </View>
            </View>
          </View>
        );
      }

      const asset = item.asset;
      const resolvedUri = displayUriByAsset[asset.id];
      const displayAsset =
        resolvedUri != null ? { ...asset, uri: resolvedUri } : asset;
      const prev = items[index - 1];
      const next = items[index + 1];
      const prevUri =
        prev?.type === "media"
          ? displayUriByAsset[prev.asset.id] ?? prev.asset.uri
          : null;
      const nextUri =
        next?.type === "media"
          ? displayUriByAsset[next.asset.id] ?? next.asset.uri
          : null;
      const day = dayForTime(asset.creationTime);

      return (
        <View
          style={{
            width: PAGE_WIDTH,
            alignItems: "center",
            paddingTop: 0,
          }}
        >
          <View
            style={{
              width: MAIN_CARD_WIDTH + 40,
              height: MAIN_CARD_HEIGHT,
              justifyContent: "flex-start",
              alignItems: "center",
            }}
          >
            {prevUri ? (
              <View
                style={{
                  position: "absolute",
                  left: 4,
                  top: 8,
                  width: PEEK_W,
                  height: PEEK_H,
                  borderRadius: 14,
                  overflow: "hidden",
                  opacity: 0.5,
                  zIndex: 0,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surfaceSecondary,
                }}
              >
                <Image
                  source={{ uri: prevUri }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="cover"
                />
              </View>
            ) : null}
            {nextUri ? (
              <View
                style={{
                  position: "absolute",
                  right: 4,
                  top: 8,
                  width: PEEK_W,
                  height: PEEK_H,
                  borderRadius: 14,
                  overflow: "hidden",
                  opacity: 0.5,
                  zIndex: 0,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surfaceSecondary,
                }}
              >
                <Image
                  source={{ uri: nextUri }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="cover"
                />
              </View>
            ) : null}
            <View
              style={{
                width: MAIN_CARD_WIDTH,
                height: MAIN_CARD_HEIGHT,
                borderRadius: 16,
                overflow: "hidden",
                zIndex: 1,
                borderWidth: 2,
                borderColor: colors.text,
                backgroundColor: colors.surfaceSecondary,
              }}
            >
              {asset.mediaType === "video" ? (
                <CaptureVideoPreview
                  asset={displayAsset}
                  resolvedUri={resolvedUri}
                  isActive={isActive}
                />
              ) : (
                <DayAssetPreview asset={displayAsset} animate={isActive} />
              )}
              <View
                style={{
                  position: "absolute",
                  bottom: 12,
                  left: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {asset.mediaType === "video" ? (
                  <View
                    style={{
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
                <CaptureDatePill label={format(day, "EEE, MMM d")} />
              </View>
            </View>
          </View>
        </View>
      );
    },
    [
      activeIndex,
      colors,
      theme,
      displayUriByAsset,
      items,
      PAGE_WIDTH,
      MAIN_CARD_WIDTH,
      MAIN_CARD_HEIGHT,
      PEEK_W,
      PEEK_H,
    ]
  );

  if (loading && !items.some((it) => it.type === "media")) {
    return (
      <View
        style={{
          height: MAIN_CARD_HEIGHT + 24,
          marginHorizontal: 20,
          borderRadius: 16,
          backgroundColor: colors.surfaceSecondary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontFamily: "Roboto-Regular", color: colors.textMuted }}>
          Loading recent moments…
        </Text>
      </View>
    );
  }

  return (
    <View>
      <FlatList
        ref={listRef}
        data={items}
        horizontal
        pagingEnabled
        decelerationRate="fast"
        snapToInterval={PAGE_WIDTH}
        snapToAlignment="start"
        disableIntervalMomentum
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.key}
        onScroll={onScroll}
        onMomentumScrollEnd={onMomentumScrollEnd}
        scrollEventThrottle={16}
        style={{ height: MAIN_CARD_HEIGHT }}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={3}
        removeClippedSubviews
        getItemLayout={(_, index) => ({
          length: PAGE_WIDTH,
          offset: PAGE_WIDTH * index,
          index,
        })}
        renderItem={renderItem}
      />

      <WindowedDots
        total={items.length}
        activeIndex={activeIndex}
        scrollX={scrollX}
        pageWidth={PAGE_WIDTH}
        activeColor={theme === "dark" ? "#FFFFFF" : "#000000"}
        mutedColor={
          theme === "dark" ? "rgba(255,255,255,0.32)" : "rgba(0,0,0,0.28)"
        }
      />

      <View
        style={{
          paddingHorizontal: 20,
          marginTop: 18,
        }}
      >
        {activeItem?.type === "today-empty" ? (
          <Pressable
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onCaptureWithCamera?.();
            }}
            style={{
              height: 56,
              borderRadius: 9999,
              backgroundColor: colors.primary,
              borderWidth: 2,
              borderColor: PINK_CTA_BORDER,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              ...bevelShadow(theme),
            }}
          >
            <Ionicons name="camera" size={20} color={PINK_CTA_INK} />
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                color: PINK_CTA_INK,
                letterSpacing: 0.8,
                textTransform: "uppercase",
              }}
            >
              Take a photo/video
            </Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                if (activeItem?.type === "media") {
                  onChoose(activeItem.asset, activeDay);
                }
              }}
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
                Choose this moment
              </Text>
            </Pressable>
            {activeIsToday && onCaptureWithCamera ? (
              <View style={{ alignItems: "center", marginTop: 14 }}>
                <Pressable
                  onPress={() => {
                    void Haptics.impactAsync(
                      Haptics.ImpactFeedbackStyle.Medium
                    );
                    onCaptureWithCamera();
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 9999,
                    borderWidth: 1.5,
                    borderColor: colors.border,
                  }}
                >
                  <Ionicons
                    name="camera-outline"
                    size={20}
                    color={colors.text}
                    style={{ marginRight: 8 }}
                  />
                  <Text
                    style={{
                      fontFamily: "Roboto-Medium",
                      fontSize: 14,
                      color: colors.text,
                    }}
                  >
                    Take a photo/video
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
});

/**
 * Memoised so the parent Capture screen's frequent re-renders (the 1s year
 * ticker, live header day) don't cascade into the carousel. Relies on the
 * parent passing referentially-stable props (memoised `items` + `useCallback`
 * handlers).
 */
export const RecentMomentsCarousel = memo(RecentMomentsCarouselInner);

const DOT_SLOT = 18;
const DOT_VISIBLE = 7;
const DOT_VIEWPORT = DOT_SLOT * DOT_VISIBLE;
/** How many dots to render each side of the active one (rest are off-screen). */
const DOT_RENDER_RADIUS = 5;

/**
 * Carousel-style progress dots for the effectively-infinite feed. The whole
 * strip slides continuously with the scroll position (so motion is visible
 * even though the focused dot stays centred), the centred dot grows, and the
 * outer dots shrink + fade so there's always a sense of "more" on each side.
 */
function WindowedDots({
  total,
  activeIndex,
  scrollX,
  pageWidth,
  activeColor,
  mutedColor,
}: {
  total: number;
  activeIndex: number;
  scrollX: Animated.Value;
  pageWidth: number;
  activeColor: string;
  mutedColor: string;
}) {
  // Fractional index (e.g. 3.4 mid-swipe) drives a smooth slide.
  const progress = Animated.divide(scrollX, pageWidth);
  const lo = Math.max(0, activeIndex - DOT_RENDER_RADIUS);
  const hi = Math.min(total - 1, activeIndex + DOT_RENDER_RADIUS);
  const indices: number[] = [];
  for (let i = lo; i <= hi; i++) indices.push(i);

  return (
    <View
      style={{
        height: 8,
        width: DOT_VIEWPORT,
        alignSelf: "center",
        marginTop: 14,
        overflow: "hidden",
      }}
    >
      {indices.map((i) => {
        const offset = Animated.subtract(i, progress); // <0 left, >0 right
        const translateX = Animated.multiply(offset, DOT_SLOT);
        const width = offset.interpolate({
          inputRange: [-3, -1, 0, 1, 3],
          outputRange: [4, 6, 16, 6, 4],
          extrapolate: "clamp",
        });
        const opacity = offset.interpolate({
          inputRange: [-4, -3, 0, 3, 4],
          outputRange: [0, 0.4, 1, 0.4, 0],
          extrapolate: "clamp",
        });
        return (
          <Animated.View
            key={i}
            style={{
              position: "absolute",
              left: DOT_VIEWPORT / 2 - DOT_SLOT / 2,
              top: 1,
              width: DOT_SLOT,
              height: 6,
              alignItems: "center",
              justifyContent: "center",
              opacity,
              transform: [{ translateX }],
            }}
          >
            <Animated.View
              style={{
                width,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === activeIndex ? activeColor : mutedColor,
              }}
            />
          </Animated.View>
        );
      })}
    </View>
  );
}
