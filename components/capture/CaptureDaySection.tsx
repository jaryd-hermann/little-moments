import { AddMoreToThisDaySection } from "@/components/capture/AddMoreToThisDaySection";
import { CaptureMonthWipSection } from "@/components/capture/CaptureMonthWipSection";
import { CuratorBrowsePanel } from "@/components/capture/CuratorBrowsePanel";
import { TodayInYourPastCarousel } from "@/components/capture/TodayInYourPastCarousel";
import { EntryMediaImage } from "@/components/common/EntryMediaImage";
import { EntryPinToggle } from "@/components/common/EntryPinToggle";
import { LocationTag } from "@/components/common/LocationTag";
import {
  hasFullPhotoLibraryAccess,
  queryCameraPhotosForLocalDay,
  type MediaAsset,
} from "@/hooks/useMediaLibrary";
import { useTheme } from "@/hooks/useTheme";
import type { ReflectionQuestionItem } from "@/lib/captureReflectionQuestions";
import { bevelShadow, PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";
import { momentTitleStyle, photoCardBorder } from "@/lib/momentTypography";
import type { Entry } from "@/store/entryStore";
import type { MashupBucket } from "@/lib/mashupBuckets";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import { Image } from "expo-image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useCaptureFirstMomentCoachmarkStore } from "@/store/captureFirstMomentCoachmarkStore";
import {
  NOTHING_TODAY_MAGIC_FILL,
  PAST_DAY_EMPTY_MAGIC_FILL,
  CaptureMagicFillOnboardingBanner,
  type CaptureMagicFillBannerVariant,
} from "@/components/magic-fill/CaptureMagicFillOnboardingBanner";
import { MagicFillBanner } from "@/components/magic-fill/MagicFillBanner";

export interface CaptureDaySectionProps {
  date: Date;
  ymd: string;
  entriesForDay: Entry[];
  /** Inform parent which day the user is acting on, then pin a photo. */
  onPinPhoto: (asset: MediaAsset, dayDate: Date) => void;
  /** Inform parent which day the user is acting on, then start a question. */
  onStartQuestion: (
    q: ReflectionQuestionItem,
    method: "speaking" | "typing",
    dayDate: Date
  ) => void;
  /**
   * "+ Log Moment" from Today In Your Past. The resulting moment lands on the
   * photo's original date (so it's archived under that prior year's chapter).
   */
  onLogPastMoment: (asset: MediaAsset) => void;
  /** Tap a saved moment row → entry detail. */
  onOpenEntry: (entry: Entry) => void;
  /** Tap "share" on a captured moment card. */
  onShareEntry: (entry: Entry) => void;
  /** Dig Deeper for the visible carousel moment. */
  onDigDeeper: (entry: Entry) => void;
  /** Media access state — bubbled down so the panel can show the right copy. */
  permissionStatus: MediaLibrary.PermissionStatus | null;
  accessPrivileges: "all" | "limited" | "none" | null;
  surface?: string;
  monthWipBucket?: MashupBucket | null;
  onOpenMonthWip?: (bucket: MashupBucket) => void;
  reportCoachmarkTarget?: (
    key: "pin" | "digDeeper",
    layout: { x: number; y: number; width: number; height: number }
  ) => void;
  magicFillOnboardingVariant?: CaptureMagicFillBannerVariant | null;
}

/**
 * Per-day content for the Capture feed. Two render modes:
 *
 *  1. **Captured day** (`entriesForDay.length > 0`): full-bleed swipeable
 *     carousel of the day's moments with core-memory / share / title / body,
 *     then (when the camera roll has unused photos) an "Add more to this day"
 *     grid to capture another moment from the same day.
 *
 *  2. **Empty day** (no moments yet): the existing `CuratorBrowsePanel` —
 *     pick a photo or pick a question.
 *
 *  Both modes append `TodayInYourPastCarousel` underneath so the user can
 *  reach a past-year photo from any day.
 */
export function CaptureDaySection({
  date,
  ymd,
  entriesForDay,
  onPinPhoto,
  onStartQuestion,
  onLogPastMoment,
  onOpenEntry,
  onShareEntry,
  onDigDeeper,
  permissionStatus,
  accessPrivileges,
  surface = "today_feed",
  monthWipBucket,
  onOpenMonthWip,
  reportCoachmarkTarget,
  magicFillOnboardingVariant = null,
}: CaptureDaySectionProps) {
  const { colors, theme } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const CARD_WIDTH = screenWidth - 40;
  const hasMoments = entriesForDay.length > 0;

  const [dayPhotos, setDayPhotos] = useState<MediaAsset[]>([]);
  const [loadingDayPhotos, setLoadingDayPhotos] = useState(false);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const showBrowse = !hasMoments;
  const hasPhotoAccess = hasFullPhotoLibraryAccess(
    permissionStatus,
    accessPrivileges
  );
  const pinRef = useRef<View>(null);
  const digDeeperRef = useRef<View>(null);
  const remeasureTick = useCaptureFirstMomentCoachmarkStore(
    (s) => s.remeasureTick
  );
  const coachmarksVisible = useCaptureFirstMomentCoachmarkStore(
    (s) => s.visible
  );

  const reportCoachmarkTargets = useCallback(() => {
    if (!reportCoachmarkTarget) return;
    pinRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        reportCoachmarkTarget("pin", { x, y, width, height });
      }
    });
    digDeeperRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        reportCoachmarkTarget("digDeeper", { x, y, width, height });
      }
    });
  }, [reportCoachmarkTarget]);

  useEffect(() => {
    if (!reportCoachmarkTarget || !coachmarksVisible || !hasMoments) return;
    const timer = setTimeout(reportCoachmarkTargets, 60);
    return () => clearTimeout(timer);
  }, [
    reportCoachmarkTarget,
    coachmarksVisible,
    hasMoments,
    activeCardIndex,
    remeasureTick,
    reportCoachmarkTargets,
  ]);

  // "Today" check — we only offer the live camera CTA for the current
  // local day. Past days can't be re-shot, so we leave the existing
  // question fallback there.
  const todayDate = new Date();
  const isToday =
    ymd === `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, "0")}-${String(todayDate.getDate()).padStart(2, "0")}`;

  /**
   * Launch the native camera in "all media" mode so the user can flick
   * between photo and short-video modes inside the native camera UI.
   * Persist the captured asset to the photo library (so Live Photo
   * lookup / EXIF / the day-photos query all see it like any other
   * camera roll item), then pin it as the active capture target.
   */
  const handleCameraCapture = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        quality: 0.9,
        videoMaxDuration: 2,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }
      const first = result.assets[0];
      const uri = first.uri;
      const isVideo =
        first.type === "video" || /\.(mov|mp4|m4v)$/i.test(uri ?? "");
      let savedId: string | null = null;
      try {
        const saved = await MediaLibrary.createAssetAsync(uri);
        savedId = saved.id;
      } catch {
        // Library save can fail (e.g. limited access) — fall back to a
        // synthetic id so we still surface the pin in the UI.
      }
      const asset: MediaAsset = {
        id: savedId ?? `cam-${Date.now()}`,
        uri,
        creationTime: Date.now(),
        mediaType: isVideo ? "video" : "photo",
        width: first.width ?? 0,
        height: first.height ?? 0,
      };
      onPinPhoto(asset, date);
    } catch {
      // Swallow — user can retry; surfacing a modal here would be
      // disruptive mid-flow.
    }
  }, [date, onPinPhoto]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const can = hasFullPhotoLibraryAccess(permissionStatus, accessPrivileges);
      if (!can) {
        if (!cancelled) {
          setDayPhotos([]);
          setLoadingDayPhotos(false);
        }
        return;
      }
      setLoadingDayPhotos(true);
      try {
        const list = await queryCameraPhotosForLocalDay(date);
        if (!cancelled) setDayPhotos(list);
      } finally {
        if (!cancelled) setLoadingDayPhotos(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ymd, permissionStatus, accessPrivileges, date]);

  return (
    <View>
      {hasMoments ? (
        <View style={{ paddingHorizontal: 20 }}>
          {magicFillOnboardingVariant ? (
            <View style={{ marginBottom: 12 }}>
              <CaptureMagicFillOnboardingBanner
                variant={magicFillOnboardingVariant}
              />
            </View>
          ) : null}
          {/* Moments carousel — same shape as the legacy "you captured" view. */}
          <View style={{ marginHorizontal: -20, marginBottom: 12 }}>
            <FlatList
              data={entriesForDay}
              keyExtractor={(item) => item.id}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20 }}
              snapToInterval={CARD_WIDTH + 12}
              decelerationRate="fast"
              onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
                const idx = Math.round(
                  e.nativeEvent.contentOffset.x / (CARD_WIDTH + 12)
                );
                setActiveCardIndex(idx);
              }}
              scrollEventThrottle={16}
              renderItem={({ item, index }) => {
                const media =
                  item.media && item.media.length > 0 ? item.media[0] : null;
                return (
                  <View
                    style={{
                      width: CARD_WIDTH,
                      marginRight: index < entriesForDay.length - 1 ? 12 : 0,
                      position: "relative",
                    }}
                  >
                    <Pressable
                      onPress={() => {
                        void Haptics.impactAsync(
                          Haptics.ImpactFeedbackStyle.Light
                        );
                        onOpenEntry(item);
                      }}
                      style={{
                        borderRadius: 16,
                        ...photoCardBorder(colors.text),
                        backgroundColor: colors.surface,
                        overflow: "hidden",
                      }}
                    >
                      {media ? (
                        <View style={{ position: "relative" }}>
                          <EntryMediaImage
                            media={media}
                            enableLivePhoto={index === activeCardIndex}
                            showLoadingShimmer
                            style={{
                              width: "100%",
                              aspectRatio: 1,
                            }}
                          />
                          {media.location_name ? (
                            <View
                              style={{
                                position: "absolute",
                                left: 12,
                                bottom: 12,
                              }}
                            >
                              <LocationTag
                                name={media.location_name}
                                variant="overlay"
                              />
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                      <View style={{ padding: 16, paddingBottom: 12 }}>
                        {item.title ? (
                          <Text
                            style={momentTitleStyle({
                              fontSize: 16,
                              color: colors.text,
                              marginBottom: 6,
                            })}
                          >
                            {item.title}
                          </Text>
                        ) : null}
                        <Text
                          style={{
                            fontFamily: "Roboto-Regular",
                            fontSize: 14,
                            lineHeight: 22,
                            color: colors.textSecondary,
                          }}
                          numberOfLines={media ? 2 : 4}
                          ellipsizeMode="tail"
                        >
                          {item.body}
                        </Text>
                        <View
                          ref={index === activeCardIndex ? digDeeperRef : undefined}
                          collapsable={false}
                        >
                          <Pressable
                            onPress={() => {
                              void Haptics.impactAsync(
                                Haptics.ImpactFeedbackStyle.Light
                              );
                              onDigDeeper(item);
                            }}
                            style={{
                              marginTop: 14,
                              height: 48,
                              borderRadius: 9999,
                              borderWidth: 1.5,
                              borderColor: colors.text,
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 10,
                            }}
                          >
                            <Image
                              source={
                                theme === "dark"
                                  ? require("@/assets/images/white-icon.png")
                                  : require("@/assets/images/icon.png")
                              }
                              style={{ width: 20, height: 20, borderRadius: 5 }}
                            />
                            <Text
                              style={{
                                fontFamily: "Roboto-Medium",
                                fontSize: 13,
                                color: colors.text,
                                letterSpacing: 0.5,
                                textTransform: "uppercase",
                              }}
                            >
                              Dig deeper
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    </Pressable>
                    <View
                      style={{
                        position: "absolute",
                        top: 12,
                        right: 12,
                        zIndex: 2,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <View
                        ref={index === activeCardIndex ? pinRef : undefined}
                        collapsable={false}
                      >
                        <EntryPinToggle entryId={item.id} size={24} />
                      </View>
                      <Pressable
                        onPress={() => {
                          void Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light
                          );
                          onShareEntry(item);
                        }}
                        hitSlop={10}
                        accessibilityLabel="Share moment"
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: "rgba(0,0,0,0.14)",
                          backgroundColor: "#FFFFFF",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons name="share-outline" size={14} color="#1A1A1A" />
                      </Pressable>
                    </View>
                  </View>
                );
              }}
            />
            {entriesForDay.length > 1 ? (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 6,
                  marginTop: 10,
                }}
              >
                {entriesForDay.map((_, i) => (
                  <View
                    key={i}
                    style={{
                      width: i === activeCardIndex ? 20 : 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor:
                        i === activeCardIndex
                          ? colors.primary
                          : colors.textMuted,
                    }}
                  />
                ))}
              </View>
            ) : null}
          </View>

          {!loadingDayPhotos ? (
            <AddMoreToThisDaySection
              entriesForDay={entriesForDay}
              dayPhotos={dayPhotos}
              onCapturePhoto={(asset) => onPinPhoto(asset, date)}
            />
          ) : null}
        </View>
      ) : null}

      {showBrowse && isToday && !loadingDayPhotos && dayPhotos.length === 0 ? (
        <View style={{ paddingTop: 28, paddingHorizontal: 20, marginBottom: 16 }}>
          {hasPhotoAccess && entriesForDay.length === 0 ? (
            <MagicFillBanner
              source="capture_banner"
              embedded
              prominent
              title={NOTHING_TODAY_MAGIC_FILL.title}
              subtitle={NOTHING_TODAY_MAGIC_FILL.subtitle}
            />
          ) : null}
          {/* Mega-button card — the entire surface is the tap target.
              The inner View carries the violet fill, black 2-px stroke,
              and bevel shadow so it renders independently of Pressable's
              style pipeline (which was previously dropping the chrome
              when style was passed as a function returning an array). */}
          <Pressable
            onPress={() => void handleCameraCapture()}
            accessibilityLabel="Take today's photo or video with the camera"
            android_ripple={{ color: "rgba(0,0,0,0.08)", borderless: false }}
          >
            {({ pressed }) => (
              <View
                style={{
                  borderRadius: 16,
                  borderWidth: 2,
                  borderColor: PINK_CTA_BORDER,
                  backgroundColor: colors.primary,
                  paddingHorizontal: 28,
                  paddingTop: 48,
                  paddingBottom: 44,
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 280,
                  opacity: pressed ? 0.92 : 1,
                  ...bevelShadow(theme),
                }}
              >
                <Text
                  style={{
                    fontFamily: "PMGothicLudington-Text110",
                    fontSize: 32,
                    lineHeight: 38,
                    color: PINK_CTA_INK,
                    textAlign: "center",
                  }}
                >
                  No photos or videos{"\n"}from today yet
                </Text>
                <Text
                  style={{
                    fontFamily: "Roboto-Regular",
                    fontSize: 17,
                    lineHeight: 26,
                    color: PINK_CTA_INK,
                    textAlign: "center",
                    marginTop: 28,
                  }}
                >
                  Tap here to take{"\n"}today's photo or video
                </Text>
                <Ionicons
                  name="arrow-forward"
                  size={28}
                  color={PINK_CTA_INK}
                  style={{ marginTop: 18 }}
                />
              </View>
            )}
          </Pressable>
        </View>
      ) : null}

      {/* Browse panel: hidden entirely on today-no-photos (we already
          render the camera card above). When the day's library is non-empty
          the carousel renders with a "Take a photo/video" secondary CTA
          underneath the primary "Choose this moment" button so the user
          can always reach the camera from photo-mode. */}
      {showBrowse && !isToday && !loadingDayPhotos && dayPhotos.length === 0 ? (
        <View style={{ paddingTop: 28, paddingHorizontal: 20, marginBottom: 16 }}>
          <View
            style={{
              borderRadius: 16,
              borderWidth: 2,
              borderColor: colors.text,
              backgroundColor: theme === "dark" ? colors.surfaceSecondary : "#FFFFFF",
              paddingHorizontal: 28,
              paddingTop: 48,
              paddingBottom: 44,
              alignItems: "center",
              justifyContent: "center",
              minHeight: 240,
              ...bevelShadow(theme),
            }}
          >
            <Text
              style={{
                fontFamily: "PMGothicLudington-Text110",
                fontSize: 28,
                lineHeight: 34,
                color: colors.text,
                textAlign: "center",
              }}
            >
              You didn&apos;t take any photos or videos on this day
            </Text>
            <Text
              style={{
                fontFamily: "Roboto-Regular",
                fontSize: 16,
                lineHeight: 24,
                color: colors.textSecondary,
                textAlign: "center",
                marginTop: 20,
              }}
            >
              Don&apos;t forget to capture 1 photo or video a day to capture
              your little moments
            </Text>
          </View>
          {hasPhotoAccess ? (
            <View style={{ marginTop: 20 }}>
              <MagicFillBanner
                source="capture_banner"
                embedded
                prominent
                title={PAST_DAY_EMPTY_MAGIC_FILL.title}
                subtitle={PAST_DAY_EMPTY_MAGIC_FILL.subtitle}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Browse panel: hidden entirely on today-no-photos (we already
          render the camera card above). When the day's library is non-empty
          the carousel renders with a "Take a photo/video" secondary CTA
          underneath the primary "Choose this moment" button — today only. */}
      {showBrowse && !(isToday && dayPhotos.length === 0 && !loadingDayPhotos) ? (
        <CuratorBrowsePanel
          key={ymd}
          headingTitle=""
          hideHeading
          onPressChangeDay={() => undefined}
          dayPhotos={dayPhotos}
          loadingPhotos={loadingDayPhotos}
          onChoosePhoto={(asset) => onPinPhoto(asset, date)}
          onStartQuestionCapture={(q, method) =>
            onStartQuestion(q, method, date)
          }
          onCaptureWithCamera={
            isToday ? () => void handleCameraCapture() : undefined
          }
          suppressNoPhotosBanner={!isToday && dayPhotos.length === 0}
          analyticsContext={{ target_ymd: ymd, surface }}
        />
      ) : null}

      <View style={{ marginTop: hasMoments || showBrowse ? 28 : 0 }}>
        <TodayInYourPastCarousel
          date={date}
          isToday={isToday}
          permissionStatus={permissionStatus}
          accessPrivileges={accessPrivileges}
          onLogMoment={onLogPastMoment}
        />
      </View>

      {monthWipBucket && onOpenMonthWip ? (
        <CaptureMonthWipSection
          bucket={monthWipBucket}
          onOpen={onOpenMonthWip}
        />
      ) : null}
    </View>
  );
}
