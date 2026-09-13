import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  MagicFillFavoriteIcon,
  MagicFillMonthIcon,
  MagicFillPickIcon,
} from "@/components/magic-fill/MagicFillModeIcons";
import * as Haptics from "expo-haptics";
import { usePostHog } from "posthog-react-native";
import { useTheme } from "@/hooks/useTheme";
import { useEntries } from "@/hooks/useEntries";
import { useMediaLibrary, hasFullPhotoLibraryAccess } from "@/hooks/useMediaLibrary";
import { useFullPhotoAccessExplainer } from "@/hooks/useFullPhotoAccessExplainer";
import { magicFillHeadlineStyle } from "@/lib/magicFillTypography";
import {
  buildCapturedTakenAtMsSet,
  buildDraftsFromMediaAssets,
  buildDraftsFromPickerAssets,
  launchMagicFillPhotoPicker,
  queryRecentUncapturedFavorites,
  MAGIC_FILL_FAVORITES_MAX,
} from "@/lib/magicFillYouPick";
import {
  useMagicFillStore,
  type MagicFillGapTarget,
} from "@/store/magicFillStore";
import { MagicFillScreenHeader } from "@/components/magic-fill/MagicFillScreenHeader";
import { MagicFillPrimaryButton } from "@/components/magic-fill/MagicFillPrimaryButton";
import { MagicFillMonthPickerSheet } from "@/components/magic-fill/MagicFillMonthPickerSheet";
import { MagicFillYouPickSheet } from "@/components/magic-fill/MagicFillYouPickSheet";
import { PhotoAccessNudgeCard } from "@/components/common/PhotoAccessNudgeCard";

const GAP_OPTIONS: MagicFillGapTarget[] = [5, 10];

/** Grace period between dismissing the You-pick sheet and presenting the picker. */
const YOU_PICK_SETTLE_MS = 350;

export default function MagicFillIndexScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  const { entries } = useEntries();
  const { source, empty, mode } = useLocalSearchParams<{
    source?: string;
    empty?: string;
    /** `favorites` — skip the gap chooser and go straight to Favorites. */
    mode?: string;
  }>();
  const gapTarget = useMagicFillStore((s) => s.gapTarget);
  const setGapTarget = useMagicFillStore((s) => s.setGapTarget);
  const setFillMode = useMagicFillStore((s) => s.setFillMode);
  const setTargetMonthKey = useMagicFillStore((s) => s.setTargetMonthKey);
  const setDrafts = useMagicFillStore((s) => s.setDrafts);
  const clearPickedVideoClips = useMagicFillStore((s) => s.clearPickedVideoClips);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [youPickSheetOpen, setYouPickSheetOpen] = useState(false);
  const [youPickLoading, setYouPickLoading] = useState(false);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const {
    requestPermission,
    checkPermission,
    permissionStatus,
    accessPrivileges,
  } = useMediaLibrary();
  const { ensureFullPhotoAccess, fullPhotoAccessModal } = useFullPhotoAccessExplainer({
    checkPermission,
    requestPermission,
  });
  const hasFullAccess = hasFullPhotoLibraryAccess(
    permissionStatus,
    accessPrivileges
  );

  useFocusEffect(
    useCallback(() => {
      void checkPermission();
    }, [checkPermission])
  );

  const goSearching = async (mode: "recent_gaps" | "month", monthKey?: string) => {
    if (!hasFullAccess) {
      const ok = await ensureFullPhotoAccess();
      if (!ok) return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    clearPickedVideoClips();
    setFillMode(mode);
    setTargetMonthKey(mode === "month" ? (monthKey ?? null) : null);
    posthog.capture("magic_fill_range_selected", {
      gap_target: gapTarget,
      fill_mode: mode,
      month_key: monthKey ?? null,
      source: source ?? "unknown",
    });
    router.push("/magic-fill/searching");
  };

  const handleFindMoments = () => void goSearching("recent_gaps");

  // The picker must be launched only *after* the You-pick bottom sheet has
  // finished animating away — presenting the native photo picker while a JS
  // Modal is still on screen silently fails on iOS (endless spinner, gallery
  // never opens). We close the sheet, then run the flow from its `onDismiss`
  // (with a timeout fallback for Android, which has no `onDismiss`).
  const pendingYouPickRef = useRef(false);

  // Plain (non-memoised) so it always closes over the current render's state
  // (e.g. `hasFullAccess` after a just-granted permission).
  const runYouPickFlowOnce = () => {
    if (!pendingYouPickRef.current) return;
    pendingYouPickRef.current = false;
    // `onDismiss` can fire while the modal's view is still being torn down.
    // Presenting the picker at that moment leaves its promise unsettled, so
    // wait for interactions to drain and give the run loop one more beat.
    InteractionManager.runAfterInteractions(() => {
      setTimeout(() => void runYouPickFlow(), YOU_PICK_SETTLE_MS);
    });
  };

  const handleYouPickChoose = () => {
    pendingYouPickRef.current = true;
    setYouPickLoading(true);
    setYouPickSheetOpen(false);
    // Fallback for platforms/paths where the Modal `onDismiss` never fires.
    setTimeout(runYouPickFlowOnce, 600);
  };

  const runYouPickFlow = async () => {
    try {
      if (!hasFullAccess) {
        const ok = await ensureFullPhotoAccess();
        if (!ok) return;
      }

      clearPickedVideoClips();
      setFillMode("you_pick");
      setTargetMonthKey(null);

      // The picker is full-screen native UI, so the tile spinner adds nothing
      // from here on — and dropping it now means a picker that fails to
      // present can't leave the tile spinning forever.
      setYouPickLoading(false);
      const picked = await launchMagicFillPhotoPicker();
      if (!picked || picked.length === 0) return;

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      posthog.capture("magic_fill_range_selected", {
        gap_target: gapTarget,
        fill_mode: "you_pick",
        picked_count: picked.length,
        source: source ?? "unknown",
      });

      const drafts = await buildDraftsFromPickerAssets(picked);
      if (drafts.length === 0) {
        Alert.alert(
          "Couldn't load those photos",
          "We had trouble reading the photos you picked. Please try selecting them again."
        );
        return;
      }

      setDrafts(drafts);
      router.push("/magic-fill/review");
    } catch {
      Alert.alert(
        "Something went wrong",
        "We couldn't open your photos. Please try again."
      );
    } finally {
      setYouPickLoading(false);
    }
  };

  const handleFavoritesChoose = async () => {
    if (favoritesLoading) return;
    if (!hasFullAccess) {
      const ok = await ensureFullPhotoAccess();
      if (!ok) return;
    }

    setFavoritesLoading(true);
    clearPickedVideoClips();
    setFillMode("favorites");
    setTargetMonthKey(null);

    try {
      const capturedTakenAtMs = buildCapturedTakenAtMsSet(entries);
      const favorites = await queryRecentUncapturedFavorites({
        capturedTakenAtMs,
      });

      if (favorites.length === 0) {
        Alert.alert(
          "No new favorites",
          "We couldn't find any favorited photos you haven't already captured. Heart a few moments in your Photos app and try again."
        );
        return;
      }

      const drafts = buildDraftsFromMediaAssets(favorites);
      if (drafts.length === 0) return;

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setDrafts(drafts);
      posthog.capture("magic_fill_range_selected", {
        gap_target: gapTarget,
        fill_mode: "favorites",
        picked_count: drafts.length,
        asset_count: favorites.length,
        source: source ?? "unknown",
      });

      router.push("/magic-fill/review");
    } finally {
      setFavoritesLoading(false);
    }
  };

  // `?mode=favorites` skips this screen entirely — the first-moment chat has
  // already promised to pull from the user's favourites, so asking them to
  // pick a mode again would be a step backwards.
  const autoFavoritesRef = useRef(false);
  useEffect(() => {
    if (mode !== "favorites" || autoFavoritesRef.current) return;
    autoFavoritesRef.current = true;
    void handleFavoritesChoose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {fullPhotoAccessModal}
      <MagicFillScreenHeader />
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 24,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom + 16, 40),
        }}
      >
        <Text
          style={magicFillHeadlineStyle({
            fontSize: 28,
            lineHeight: 34,
            color: colors.text,
            textAlign: "center",
            marginBottom: 8,
          })}
        >
          How many moments should we fill?
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 15,
            lineHeight: 22,
            color: colors.textSecondary,
            textAlign: "center",
            marginBottom: 28,
          }}
        >
          We&apos;ll find the most recent days with photos but no moment yet — as
          far back as your camera roll goes.
        </Text>

        {!hasFullAccess ? (
          <PhotoAccessNudgeCard
            headline="Grant photo access to Magic fill"
            subtitle="We need full gallery access to find days with photos waiting to become moments."
            primaryLabel="CONTINUE"
            onPrimaryPress={() => void ensureFullPhotoAccess()}
            onWordFallbackPress={undefined}
          />
        ) : (
          <View style={{ gap: 12, marginBottom: 24 }}>
            {GAP_OPTIONS.map((opt) => {
              const selected = gapTarget === opt;
              return (
                <Pressable
                  key={opt}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setGapTarget(opt);
                  }}
                  style={{
                    borderRadius: 18,
                    borderWidth: 2,
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected
                      ? `${colors.primary}22`
                      : colors.surface,
                    paddingVertical: 14,
                    paddingHorizontal: 24,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text
                    style={magicFillHeadlineStyle({
                      fontSize: 30,
                      lineHeight: 34,
                      color: colors.text,
                    })}
                  >
                    {opt}
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Roboto-Medium",
                      fontSize: 16,
                      color: colors.textSecondary,
                    }}
                  >
                    most recent missing days
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {hasFullAccess ? (
          <View style={{ alignItems: "center", marginBottom: 20, gap: 10 }}>
            <Text
              style={{
                fontFamily: "Roboto-Regular",
                fontSize: 14,
                color: colors.textMuted,
              }}
            >
              or…
            </Text>

            <Pressable
              onPress={() => {
                void Haptics.selectionAsync();
                void handleFavoritesChoose();
              }}
              disabled={favoritesLoading}
              style={{
                width: "100%",
                borderRadius: 14,
                borderWidth: 1.5,
                borderColor: colors.border,
                paddingVertical: 16,
                paddingHorizontal: 16,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                opacity: favoritesLoading ? 0.6 : 1,
              }}
            >
              {favoritesLoading ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <MagicFillFavoriteIcon size={34} color={colors.text} />
              )}
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 15,
                    lineHeight: 20,
                    color: colors.text,
                  }}
                >
                  Log your favorite moments
                </Text>
                <Text
                  style={{
                    fontFamily: "Roboto-Regular",
                    fontSize: 12,
                    lineHeight: 16,
                    color: colors.textMuted,
                    marginTop: 2,
                  }}
                >
                  Up to {MAGIC_FILL_FAVORITES_MAX} days of favorites you
                  haven&apos;t logged yet
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.textMuted}
              />
            </Pressable>

            <View style={{ flexDirection: "row", gap: 10, width: "100%" }}>
              <Pressable
                onPress={() => {
                  void Haptics.selectionAsync();
                  setMonthPickerOpen(true);
                }}
                style={{
                  flex: 1,
                  borderRadius: 14,
                  borderWidth: 1.5,
                  borderColor: colors.border,
                  paddingVertical: 16,
                  paddingHorizontal: 12,
                  alignItems: "center",
                }}
              >
                <View style={{ marginBottom: 8 }}>
                  <MagicFillMonthIcon size={34} color={colors.text} />
                </View>
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 13,
                    lineHeight: 18,
                    color: colors.text,
                    textAlign: "center",
                  }}
                >
                  Months
                </Text>
                <Text
                  style={{
                    fontFamily: "Roboto-Regular",
                    fontSize: 11,
                    lineHeight: 15,
                    color: colors.textMuted,
                    textAlign: "center",
                    marginTop: 4,
                  }}
                >
                  Capture specific months you don&apos;t want to forget
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  void Haptics.selectionAsync();
                  setYouPickSheetOpen(true);
                }}
                disabled={youPickLoading}
                style={{
                  flex: 1,
                  borderRadius: 14,
                  borderWidth: 1.5,
                  borderColor: colors.border,
                  paddingVertical: 16,
                  paddingHorizontal: 12,
                  alignItems: "center",
                  opacity: youPickLoading ? 0.6 : 1,
                }}
              >
                {youPickLoading ? (
                  <ActivityIndicator
                    color={colors.text}
                    style={{ marginBottom: 8 }}
                  />
                ) : (
                  <View style={{ marginBottom: 8 }}>
                    <MagicFillPickIcon size={34} color={colors.text} />
                  </View>
                )}
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 13,
                    lineHeight: 18,
                    color: colors.text,
                    textAlign: "center",
                  }}
                >
                  You pick
                </Text>
                <Text
                  style={{
                    fontFamily: "Roboto-Regular",
                    fontSize: 11,
                    lineHeight: 15,
                    color: colors.textMuted,
                    textAlign: "center",
                    marginTop: 4,
                  }}
                >
                  Select people, places, albums to capture
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={{ marginTop: "auto" }}>
          {empty === "1" ? (
            <Text
              style={{
                fontFamily: "Roboto-Regular",
                fontSize: 14,
                color: colors.textSecondary,
                textAlign: "center",
                marginBottom: 16,
              }}
            >
              No missing days with photos waiting. Try a higher number or capture
              a new moment today.
            </Text>
          ) : null}
          <MagicFillPrimaryButton
            label="Find my moments"
            variant="pink"
            onPress={() => void handleFindMoments()}
            disabled={!hasFullAccess || youPickLoading || favoritesLoading}
          />
        </View>
      </ScrollView>

      <MagicFillMonthPickerSheet
        visible={monthPickerOpen}
        entries={entries}
        onClose={() => setMonthPickerOpen(false)}
        onSelectMonth={(monthKey) => {
          setMonthPickerOpen(false);
          void goSearching("month", monthKey);
        }}
      />

      <MagicFillYouPickSheet
        visible={youPickSheetOpen}
        onClose={() => setYouPickSheetOpen(false)}
        onChoosePhotos={handleYouPickChoose}
        onDismiss={runYouPickFlowOnce}
      />
    </View>
  );
}
