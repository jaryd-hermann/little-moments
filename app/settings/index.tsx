import { MembershipCard } from "@/components/common/MembershipCard";
import { MarketingStoryCard } from "@/components/today/MarketingStoryCard";
import { StoryViewer } from "@/components/today/StoryViewer";
import { ACCENT_PALETTES, Colors } from "@/constants/Colors";
import { useAuth } from "@/hooks/useAuth";
import { useFullPhotoAccessExplainer } from "@/hooks/useFullPhotoAccessExplainer";
import { useMarketingStories } from "@/hooks/useMarketingStories";
import { useMediaLibrary } from "@/hooks/useMediaLibrary";
import { useSubscription } from "@/hooks/useSubscription";
import { useTheme } from "@/hooks/useTheme";
import { shareInvite } from "@/lib/inviteShare";
import {
    resolveStoryProgress,
    resumeSlideIndexFromProgress,
    toMarketingStoryListItems,
} from "@/lib/marketingStories";
import { requestNotificationPermissions } from "@/lib/notifications";
import { syncPushRegistration } from "@/lib/pushRegistration";
import {
  DailyPromptReminderSchedule,
  useReminderScheduleState,
} from "@/components/settings/DailyPromptReminderSchedule";
import {
  inferMorningEveningSlotFromTime,
  type ReminderSlot,
} from "@/lib/notificationTimeSync";
import { syncStreaksEnabledToProfile } from "@/lib/streakSettingsSync";
import { PINK_CTA_INK } from "@/lib/themedShadow";
import { openStoreSubscriptionManagement } from "@/lib/revenuecat";
import { uploadAvatar } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { useSettingsStore } from "@/store/settingsStore";
import { useChapterDevStore } from "@/store/chapterStore";
import { useThreadDevStore } from "@/store/threadDevStore";
import { useTodayNotifDevStore } from "@/store/todayNotifDevStore";
import { useMagicFillDevStore } from "@/store/magicFillDevStore";
import { useUnseenStore } from "@/store/unseenStore";
import {
  inspectWidgetSnapshot,
  syncWidgetSnapshot,
} from "@/lib/widgetSnapshot";
import { useFirstPinCelebrationStore } from "@/store/firstPinCelebrationStore";
import { useFirstMomentChatStore } from "@/store/firstMomentChatStore";
import { useEntryStore } from "@/store/entryStore";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Linking,
    Pressable,
    ScrollView,
    Switch,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
let RevenueCatUI: any = null;
try {
  const mod = require("react-native-purchases-ui");
  const ui = mod?.default ?? mod;
  if (ui?.CustomerCenter && typeof ui.CustomerCenter === "function") {
    RevenueCatUI = ui;
  }
} catch {
  // Native module not available
}

type ThemePalette = (typeof Colors)["light"];

/** Set true to show theme / accent UI again. */
/** Only this account sees the widget diagnostics row in release builds. */
const WIDGET_DEBUG_EMAIL = "hermannjaryd@gmail.com";

const SHOW_APPEARANCE_SETTINGS = true;
/** Hide accent picker — theme toggle is the only appearance control for now. */
const SHOW_ACCENT_PICKER = false;
/** Hide the rewatchable Philosophy stories card. Flip back on if we want
 *  to surface the marketing rewatch entry from settings again. */
const SHOW_PHILOSOPHY_STORIES = false;

const SETTINGS_REMINDER_VISIBLE: ReminderSlot[] = ["morning", "evening"];
const SETTINGS_RHYTHM_TOGGLE_BG = "#FEEEB1";
const SETTINGS_RHYTHM_TOGGLE_FG = "#000000";
const SETTINGS_RHYTHM_TOGGLE_BORDER = "rgba(0,0,0,0.14)";

function SettingsDailyPromptTimeSection({
  notificationEnabled,
  captureRhythm,
}: {
  notificationEnabled: boolean;
  captureRhythm?: "morning" | "evening" | null;
}) {
  const { colors } = useTheme();
  const { fetchProfile } = useAuth();
  const posthog = usePostHog();
  const notificationTime = useSettingsStore((s) => s.notificationTime);
  const setNotificationTime = useSettingsStore((s) => s.setNotificationTime);
  const { selectedSlot, times, selectSlot, changeTimeForSlot } =
    useReminderScheduleState(
      { hour: notificationTime.hour, minute: notificationTime.minute },
      { captureRhythm }
    );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef({ times, selectedSlot });
  latestRef.current = { times, selectedSlot };

  const flushPersist = useCallback(async () => {
    const { times: tm, selectedSlot: sl } = latestRef.current;
    const t = tm[sl];
    const rhythmForProfile =
      sl === "morning" || sl === "evening"
        ? sl
        : inferMorningEveningSlotFromTime(t.hour, t.minute);
    setNotificationTime(t.hour, t.minute);
    await syncPushRegistration({
      notificationsEnabled: notificationEnabled,
      reminderHour: t.hour,
      reminderMinute: t.minute,
      // Moments always default to "today" now (recent-moments carousel lets
      // users scroll back to earlier days).
      reflectionTargetDefault: "today",
      captureRhythm: rhythmForProfile,
    });
    await fetchProfile();
  }, [notificationEnabled, setNotificationTime, fetchProfile]);

  const schedulePersist = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void flushPersist();
    }, 400);
  }, [flushPersist]);

  const selectWrapped = useCallback(
    (slot: ReminderSlot) => {
      selectSlot(slot);
      schedulePersist();
    },
    [selectSlot, schedulePersist]
  );

  const changeWrapped = useCallback(
    (slot: ReminderSlot, h: number, m: number) => {
      changeTimeForSlot(slot, h, m);
      schedulePersist();
    },
    [changeTimeForSlot, schedulePersist]
  );

  const rhythm: "morning" | "evening" =
    selectedSlot === "evening" ? "evening" : "morning";

  return (
    <View style={{ paddingTop: 4, paddingBottom: 4 }}>
      <Text
        style={{
          fontFamily: "Roboto-Light",
          fontSize: 11,
          color: colors.textMuted,
          letterSpacing: 1,
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        When you reflect
      </Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {(
          [
            {
              id: "morning" as const,
              label: "Morning",
              sub: "around 8:00 am",
              icon: "sunny-outline" as const,
            },
            {
              id: "evening" as const,
              label: "Evening",
              sub: "around 9:00 pm",
              icon: "moon-outline" as const,
            },
          ] as const
        ).map((opt) => {
          const selected = rhythm === opt.id;
          return (
            <Pressable
              key={opt.id}
              onPress={() => {
                void Haptics.selectionAsync();
                selectWrapped(opt.id);
                posthog.capture("settings_capture_rhythm_selected", {
                  rhythm: opt.id,
                });
              }}
              style={{
                flex: 1,
                paddingVertical: 14,
                paddingHorizontal: 10,
                borderRadius: 16,
                backgroundColor: selected
                  ? SETTINGS_RHYTHM_TOGGLE_BG
                  : "transparent",
                borderWidth: 1.5,
                borderColor: selected
                  ? SETTINGS_RHYTHM_TOGGLE_BORDER
                  : colors.border,
                alignItems: "center",
                gap: 6,
              }}
            >
              <Ionicons
                name={opt.icon}
                size={24}
                color={
                  selected ? SETTINGS_RHYTHM_TOGGLE_FG : colors.textSecondary
                }
              />
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 15,
                  color: selected
                    ? SETTINGS_RHYTHM_TOGGLE_FG
                    : colors.textSecondary,
                }}
              >
                {opt.label}
              </Text>
              <Text
                style={{
                  fontFamily: "Roboto-Regular",
                  fontSize: 11,
                  color: selected
                    ? SETTINGS_RHYTHM_TOGGLE_FG
                    : colors.textMuted,
                }}
              >
                {opt.sub}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text
        style={{
          fontFamily: "Roboto-Light",
          fontSize: 13,
          color: colors.textMuted,
          lineHeight: 20,
          marginTop: 20,
          marginBottom: 12,
        }}
      >
        We’ll nudge you when it’s time to capture your moment. Pick a
        default time (change anytime).
      </Text>
      <DailyPromptReminderSchedule
        selectedSlot={selectedSlot}
        times={times}
        onSelectSlot={selectWrapped}
        onChangeTimeForSlot={changeWrapped}
        visibleSlots={SETTINGS_REMINDER_VISIBLE}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const { profile, signOut, deleteAccount, user, fetchProfile } = useAuth();
  const {
    subscriptionStatus,
    canManageSubscriptionInStore,
    refreshStoreEntitlement,
    syncAfterSubscriptionManagement,
  } = useSubscription();
  const posthog = usePostHog();
  const [showCustomerCenter, setShowCustomerCenter] = useState(false);
  const { checkPermission, requestPermission } = useMediaLibrary();
  const {
    showPhotoAccessExplainerForTesting,
    showLimitedPhotoAccessForTesting,
    fullPhotoAccessModal,
  } = useFullPhotoAccessExplainer({ checkPermission, requestPermission });

  useEffect(() => {
    posthog.capture("viewed_settings");
  }, []);
  const { colors, theme, themePreference, setTheme, accentColor, setAccentColor } = useTheme();

  const [avatarUploading, setAvatarUploading] = useState(false);
  const nameIsEmail =
    profile?.display_name?.trim() === profile?.email;
  const [displayName, setDisplayName] = useState(
    nameIsEmail ? "" : (profile?.display_name ?? "")
  );
  const nameInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (profile?.display_name != null) {
      const isEmail = profile.display_name.trim() === profile.email;
      setDisplayName(isEmail ? "" : profile.display_name);
    }
  }, [profile?.display_name, profile?.email]);

  const handlePickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (result.canceled || !result.assets?.[0]?.uri || !user) return;

    setAvatarUploading(true);
    try {
      const publicUrl = await uploadAvatar(user.id, result.assets[0].uri);
      await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", user.id);
      await fetchProfile();
    } catch (e: any) {
      Alert.alert("Upload failed", e.message ?? "Please try again.");
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSaveDisplayName = async () => {
    const trimmed = displayName.trim();
    const currentName = profile?.display_name?.trim() ?? "";
    const isEmail = currentName === profile?.email;
    const effectiveCurrent = isEmail ? "" : currentName;
    if (!user || trimmed === effectiveCurrent) return;
    await supabase
      .from("profiles")
      .update({ display_name: trimmed || null })
      .eq("id", user.id);
    await fetchProfile();
  };
  const notificationEnabled = useSettingsStore(
    (s) => s.notificationEnabled
  );
  const setNotificationEnabled = useSettingsStore(
    (s) => s.setNotificationEnabled
  );
  const notificationTime = useSettingsStore(
    (s) => s.notificationTime
  );
  const streaksEnabled = useSettingsStore((s) => s.streaksEnabled);
  const setStreaksEnabled = useSettingsStore((s) => s.setStreaksEnabled);
  const storyProgress = useSettingsStore((s) => s.storyProgress);
  const setStoryProgress = useSettingsStore((s) => s.setStoryProgress);
  const { philosophyStories, bySlug } = useMarketingStories();
  const philosophyListItems = useMemo(
    () => toMarketingStoryListItems(philosophyStories),
    [philosophyStories]
  );

  const [storyViewerSlug, setStoryViewerSlug] = useState<string | null>(null);
  const activeStorySlides = storyViewerSlug
    ? bySlug.get(storyViewerSlug)?.slides
    : undefined;
  const storyResumeSlideIndex = useMemo(() => {
    if (!storyViewerSlug || !activeStorySlides?.length) return 0;
    const p = resolveStoryProgress(storyViewerSlug, storyProgress);
    return resumeSlideIndexFromProgress(p, activeStorySlides.length);
  }, [storyViewerSlug, activeStorySlides, storyProgress]);

  const handleToggleNotifications = async (val: boolean) => {
    setNotificationEnabled(val);
    if (user) {
      await supabase
        .from("profiles")
        .update({ notification_enabled: val })
        .eq("id", user.id);
    }
    if (val) {
      const granted = await requestNotificationPermissions();
      if (!granted) {
        setNotificationEnabled(false);
        if (user) {
          await supabase
            .from("profiles")
            .update({ notification_enabled: false })
            .eq("id", user.id);
        }
        Alert.alert(
          "Notifications are off",
          "You can enable them later in your phone’s Settings when you’re ready."
        );
        return;
      }
    }
    await syncPushRegistration({
      notificationsEnabled: val,
      reminderHour: notificationTime.hour,
      reminderMinute: notificationTime.minute,
      reflectionTargetDefault: profile?.reflection_target_default ?? undefined,
      captureRhythm:
        profile?.capture_rhythm === "morning" ||
        profile?.capture_rhythm === "evening"
          ? profile.capture_rhythm
          : undefined,
    });
  };

  const handleToggleStreaks = async (val: boolean) => {
    setStreaksEnabled(val);
    posthog.capture("streaks_toggled", { enabled: val });
    if (user) {
      await syncStreaksEnabledToProfile(val);
    }
  };

  const handleThemeChoice = async (next: "light" | "dark" | "system") => {
    if (next === themePreference) return;
    void Haptics.selectionAsync();
    setTheme(next);
    posthog.capture("theme_changed", {
      preference: next,
      previous: themePreference,
    });
    if (!user) return;
    /*
      Awaited, because a Postgrest query only issues its request once something
      consumes the promise. Left dangling this never reached the server, so
      `color_theme` kept its old value — and every launch re-reads that column
      and applies it over the local preference, which looked like the choice
      reverting on its own.
    */
    const { error } = await supabase
      .from("profiles")
      .update({ color_theme: next })
      .eq("id", user.id);
    if (error) {
      Alert.alert(
        "Couldn't save appearance",
        "Your choice applies now but may not follow you to your other devices."
      );
      return;
    }
    await fetchProfile();
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This cannot be undone. All your moments will be permanently deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Everything",
          style: "destructive",
          onPress: deleteAccount,
        },
      ]
    );
  };

  const handleOpenStory = (slug: string) => {
    setStoryViewerSlug(slug);
  };

  const handleCloseStory = (highestSlide: number) => {
    if (storyViewerSlug) {
      setStoryProgress(storyViewerSlug, highestSlide);
    }
    setStoryViewerSlug(null);
  };

  const handleManageSubscription = useCallback(async () => {
    if (!canManageSubscriptionInStore) {
      router.push("/paywall");
      return;
    }
    if (RevenueCatUI) {
      setShowCustomerCenter(true);
      return;
    }
    await openStoreSubscriptionManagement();
  }, [canManageSubscriptionInStore]);

  const handleCustomerCenterDismiss = useCallback(async () => {
    setShowCustomerCenter(false);
    await syncAfterSubscriptionManagement();
    await refreshStoreEntitlement();
  }, [refreshStoreEntitlement, syncAfterSubscriptionManagement]);

  if (showCustomerCenter && RevenueCatUI) {
    return (
      <RevenueCatUI.CustomerCenter onDismiss={handleCustomerCenterDismiss} />
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          paddingHorizontal: 20,
          paddingVertical: 12,
          gap: 12,
        }}
      >
        <Text
          style={{
            flex: 1,
            textAlign: "left",
            fontFamily: "PMGothicLudington-Text110",
            fontSize: 26,
            color: colors.text,
          }}
        >
          Settings
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={{
            width: 40,
            height: 32,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="close" size={24} color={colors.icon} />
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
        {/* Profile header */}
        <View style={{ marginTop: 24, marginBottom: 16, alignItems: "center" }}>
          <Pressable
            onPress={handlePickAvatar}
            style={{
              width: 88,
              height: 88,
              borderRadius: 44,
              backgroundColor: colors.surfaceSecondary,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 14,
              overflow: "hidden",
            }}
          >
            {avatarUploading ? (
              <ActivityIndicator color={colors.primary} />
            ) : profile?.avatar_url ? (
              <Image
                source={{ uri: profile.avatar_url }}
                style={{ width: 88, height: 88, borderRadius: 44 }}
                contentFit="cover"
              />
            ) : (
              <Ionicons name="person" size={36} color={colors.textMuted} />
            )}
            <View
              style={{
                position: "absolute",
                bottom: 0,
                right: 0,
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: colors.primary,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 2,
                borderColor: colors.background,
              }}
            >
              <Ionicons name="camera" size={14} color="#FFFFFF" />
            </View>
          </Pressable>

          <TextInput
            ref={nameInputRef}
            value={displayName}
            onChangeText={setDisplayName}
            onSubmitEditing={handleSaveDisplayName}
            onBlur={handleSaveDisplayName}
            placeholder="Add a name and pic for shared moments"
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
            maxLength={50}
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 16,
              color: colors.text,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              paddingVertical: 10,
              paddingHorizontal: 16,
              width: "100%",
              textAlign: "center",
              backgroundColor: colors.surface,
            }}
          />

          {profile?.email ? (
            <Text
              style={{
                fontFamily: "Roboto-Light",
                fontSize: 14,
                color: colors.textMuted,
                marginTop: 6,
              }}
            >
              {profile.email}
            </Text>
          ) : null}
        </View>

        <MembershipCard
          colors={colors}
          subscriptionStatus={subscriptionStatus}
          createdAt={profile?.created_at ?? null}
          canManageSubscription={canManageSubscriptionInStore}
          onManage={handleManageSubscription}
          onExplore={() => {
            posthog.capture("premium_card_tapped", { source: "settings" });
            router.push("/paywall");
          }}
        />

        {SHOW_APPEARANCE_SETTINGS ? (
          <>
            {/* Appearance */}
            <Text
              style={{
                fontFamily: "Roboto-Light",
                fontSize: 11,
                color: colors.textMuted,
                letterSpacing: 1,
                textTransform: "uppercase",
                marginTop: 32,
                marginBottom: 8,
              }}
            >
              APPEARANCE
            </Text>
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                paddingHorizontal: 16,
                paddingVertical: 14,
              }}
            >
              <Text
                style={{
                  fontFamily: "Roboto-Regular",
                  fontSize: 15,
                  color: colors.text,
                  marginBottom: 10,
                }}
              >
                Theme
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  borderRadius: 9999,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: 3,
                  backgroundColor: colors.surfaceSecondary,
                }}
              >
                {(
                  [
                    { id: "light", label: "Light" },
                    { id: "dark", label: "Dark" },
                    { id: "system", label: "System" },
                  ] as const
                ).map((opt) => {
                  const selected = themePreference === opt.id;
                  return (
                    <Pressable
                      key={opt.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => handleThemeChoice(opt.id)}
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        borderRadius: 9999,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: selected ? colors.primary : "transparent",
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: selected ? "Roboto-Medium" : "Roboto-Regular",
                          fontSize: 13,
                          color: selected ? PINK_CTA_INK : colors.textSecondary,
                        }}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text
                style={{
                  fontFamily: "Roboto-Light",
                  fontSize: 12,
                  color: colors.textMuted,
                  marginTop: 8,
                }}
              >
                {themePreference === "system"
                  ? `Following your device — currently ${theme === "dark" ? "Dark" : "Light"}.`
                  : "Override the device theme."}
              </Text>
              {SHOW_ACCENT_PICKER ? (
                <>
                  <SettingDivider colors={colors} />
                  {/* Accent color */}
                  <View
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Roboto-Regular",
                        fontSize: 15,
                        color: colors.text,
                        marginBottom: 12,
                      }}
                    >
                      App Color
                    </Text>
                    <View style={{ flexDirection: "row", gap: 12 }}>
                      {(Object.keys(ACCENT_PALETTES) as Array<keyof typeof ACCENT_PALETTES>).map(
                        (key) => {
                          const palette = ACCENT_PALETTES[key];
                          const isSelected = accentColor === key;
                          return (
                            <Pressable
                              key={key}
                              onPress={() => setAccentColor(key)}
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 8,
                                paddingHorizontal: 14,
                                paddingVertical: 8,
                                borderRadius: 9999,
                                borderWidth: 2,
                                borderColor: isSelected ? palette.primary : colors.border,
                                backgroundColor: isSelected
                                  ? palette.primary + "18"
                                  : "transparent",
                              }}
                            >
                              <View
                                style={{
                                  width: 18,
                                  height: 18,
                                  borderRadius: 9,
                                  backgroundColor: palette.primary,
                                  borderWidth: 1,
                                  borderColor: "rgba(0,0,0,0.1)",
                                }}
                              />
                              <Text
                                style={{
                                  fontFamily: "Roboto-Regular",
                                  fontSize: 14,
                                  color: colors.text,
                                  textTransform: "capitalize",
                                }}
                              >
                                {key}
                              </Text>
                              {isSelected && (
                                <Ionicons
                                  name="checkmark"
                                  size={16}
                                  color={colors.text}
                                />
                              )}
                            </Pressable>
                          );
                        }
                      )}
                    </View>
                  </View>
                </>
              ) : null}
            </View>
          </>
        ) : null}

        {/* Notifications */}
        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 11,
            color: colors.textMuted,
            letterSpacing: 1,
            textTransform: "uppercase",
            marginTop: SHOW_APPEARANCE_SETTINGS ? 24 : 32,
            marginBottom: 8,
          }}
        >
          NOTIFICATIONS
        </Text>
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
              paddingVertical: 14,
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Regular",
                fontSize: 15,
                color: colors.text,
              }}
            >
              Daily Reminder
            </Text>
            <Switch
              value={notificationEnabled}
              onValueChange={handleToggleNotifications}
              trackColor={{
                true: colors.primary,
                false: colors.surfaceSecondary,
              }}
              thumbColor="#FFFFFF"
              style={{
                shadowColor: "#000000",
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.3,
                shadowRadius: 1,
              }}
            />
          </View>
          {notificationEnabled && user ? (
            <>
              <SettingDivider colors={colors} />
              <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                <SettingsDailyPromptTimeSection
                  notificationEnabled={notificationEnabled}
                  captureRhythm={profile?.capture_rhythm ?? null}
                />
              </View>
            </>
          ) : null}
        </View>

        <StreaksSettingRow
          colors={colors}
          enabled={streaksEnabled}
          onToggle={handleToggleStreaks}
        />

        <LivePhotoSettingRow colors={colors} />

        {/* THE PHILOSOPHY — always rewatchable. Hidden behind a flag at the
            top of the file so we can flip it back on without restoring the JSX. */}
        {SHOW_PHILOSOPHY_STORIES ? (
          <View style={{ marginTop: 24 }}>
            <MarketingStoryCard
              stories={philosophyListItems}
              onPressStory={handleOpenStory}
              storyProgress={storyProgress}
              hideCompleted={false}
            />
          </View>
        ) : null}

        {__DEV__ && (
          <>
            <Text
              style={{
                fontFamily: "Roboto-Light",
                fontSize: 11,
                color: colors.textMuted,
                letterSpacing: 1,
                textTransform: "uppercase",
                marginTop: 24,
                marginBottom: 8,
              }}
            >
              DEV TOOLS
            </Text>
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <DummyChapterToggle colors={colors} />
              <SettingDivider colors={colors} />
              <DummyNotificationsToggle colors={colors} />
              <SettingDivider colors={colors} />
              <DummyThreadToggle colors={colors} />
              <SettingDivider colors={colors} />
              <ForceUnseenChapterToggle colors={colors} />
              <SettingDivider colors={colors} />
              <ForceUnseenConnectionToggle colors={colors} />
              <SettingDivider colors={colors} />
              <SettingDivider colors={colors} />
              <DummyPhotoAccessFlowTester
                colors={colors}
                onPress={() => {
                  showPhotoAccessExplainerForTesting();
                }}
              />
              <SettingDivider colors={colors} />
              <DummyLimitedPhotoAccessTester
                colors={colors}
                onPress={() => {
                  showLimitedPhotoAccessForTesting();
                }}
              />
              <SettingDivider colors={colors} />
              <DummyFirstPinTester colors={colors} />
              <SettingDivider colors={colors} />
              <DevFirstMomentChatTester colors={colors} />
              <SettingDivider colors={colors} />
              <DevOnboardingChatCaptureTester colors={colors} />
              <SettingDivider colors={colors} />
              <SettingDivider colors={colors} />
              <MagicFillOnboardingBannerDevToggle colors={colors} />
              <SettingDivider colors={colors} />
              <MagicFillOnboardingVariantDevPicker colors={colors} />
              <SettingDivider colors={colors} />
              <MagicFillIgnoreCompletedDevToggle colors={colors} />
              <SettingDivider colors={colors} />
              <MagicFillResetCompletedDevButton colors={colors} />
            </View>
          </>
        )}

        {/* Account */}
        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 11,
            color: colors.textMuted,
            letterSpacing: 1,
            textTransform: "uppercase",
            marginTop: 24,
            marginBottom: 8,
          }}
        >
          ACCOUNT
        </Text>
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <SettingRow
            colors={colors}
            label="Manage Subscription"
            sublabel={
              subscriptionStatus === "active"
                ? "Active"
                : subscriptionStatus === "cancelled"
                  ? "Cancelled"
                  : "Free"
            }
            onPress={() => {
              if (subscriptionStatus === "free" || subscriptionStatus === "trial") {
                router.push("/paywall/upgrade");
              } else {
                void handleManageSubscription();
              }
            }}
          />
          <SettingDivider colors={colors} />
          <SettingRow
            colors={colors}
            label="Rate the App"
            onPress={() => Linking.openURL("https://apps.apple.com")}
          />
          <SettingDivider colors={colors} />
          <SettingRow
            colors={colors}
            label="Share with a Friend"
            onPress={() => void shareInvite()}
          />
          <SettingDivider colors={colors} />
          <SettingRow
            colors={colors}
            label="Give Feedback"
            onPress={() => {
              console.log("[PostHog] feedback_button_pressed fired");
              router.back();
              setTimeout(() => {
                posthog.capture("feedback_button_pressed", { source: "settings" });
              }, 500);
            }}
          />
          <SettingDivider colors={colors} />
          <SettingRow
            colors={colors}
            label="Report a Bug"
            onPress={() => {
              console.log("[PostHog] report_bug_pressed fired");
              router.back();
              setTimeout(() => {
                posthog.capture("report_bug_pressed", { source: "settings" });
              }, 500);
            }}
          />
          <SettingDivider colors={colors} />
          <SettingRow
            colors={colors}
            label="Delete Account"
            destructive
            onPress={handleDeleteAccount}
          />
        </View>

        {/*
          Widget plumbing check. Outside the `__DEV__` block on purpose: the
          widget only exists in release builds, so a dev-only row can't be used
          to diagnose it. Limited to the owner's account rather than shipped to
          everyone.
        */}
        {__DEV__ || profile?.email === WIDGET_DEBUG_EMAIL ? (
          <View
            style={{
              marginTop: 24,
              backgroundColor: colors.surface,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <DevWidgetSnapshotTester colors={colors} />
          </View>
        ) : null}

        {/*
          An outlined pill in grey, not red text: logging out is reversible and
          shouldn't carry the same warning as Delete Account sitting just above
          it. Keeping red for the one that can't be undone is what makes it
          mean anything.
        */}
        <Pressable
          onPress={() => {
            posthog.capture("logged_out");
            signOut();
          }}
          style={{
            alignSelf: "center",
            marginTop: 48,
            marginBottom: 56,
            paddingHorizontal: 32,
            paddingVertical: 12,
            borderRadius: 9999,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 15,
              color: colors.textSecondary,
              textAlign: "center",
            }}
          >
            Log Out
          </Text>
        </Pressable>
      </ScrollView>

      <StoryViewer
        visible={Boolean(activeStorySlides)}
        viewerKey={storyViewerSlug ?? ""}
        slides={activeStorySlides}
        initialSlide={storyResumeSlideIndex}
        onClose={handleCloseStory}
      />
      {fullPhotoAccessModal}
    </SafeAreaView>
  );
}

function SettingRow({
  colors,
  label,
  sublabel,
  onPress,
  destructive,
}: {
  colors: ThemePalette;
  label: string;
  sublabel?: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 14,
      }}
    >
      <Text
        style={{
          fontFamily: "Roboto-Regular",
          fontSize: 15,
          color: destructive ? "#EF4444" : colors.text,
        }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {sublabel && (
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 13,
              color: colors.textMuted,
            }}
          >
            {sublabel}
          </Text>
        )}
        <Ionicons
          name="chevron-forward"
          size={16}
          color={colors.textMuted}
        />
      </View>
    </Pressable>
  );
}

function SettingDivider({ colors }: { colors: ThemePalette }) {
  return (
    <View
      style={{
        height: 1,
        backgroundColor: colors.borderLight,
        marginHorizontal: 16,
      }}
    />
  );
}

/**
 * Toggle for streak count in the app and streak-related push reminders.
 */
function StreaksSettingRow({
  colors,
  enabled,
  onToggle,
}: {
  colors: ThemePalette;
  enabled: boolean;
  onToggle: (val: boolean) => void;
}) {
  return (
    <View
      style={{
        marginTop: 16,
        backgroundColor: colors.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingVertical: 14,
        }}
      >
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 15,
              color: colors.text,
            }}
          >
            Streaks
          </Text>
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 12,
              color: colors.textMuted,
              marginTop: 2,
            }}
          >
            Show streak count and get streak reminders. Your moments are always
            saved either way.
          </Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          trackColor={{
            true: colors.primary,
            false: colors.surfaceSecondary,
          }}
          thumbColor="#FFFFFF"
        />
      </View>
    </View>
  );
}

/**
 * Toggle for Live Photo looping. iOS-only feature — surface it on Android
 * too so the user's preference roams with them, but the value has no effect
 * until they pin an iOS Live Photo.
 */
function LivePhotoSettingRow({ colors }: { colors: ThemePalette }) {
  const enabled = useSettingsStore((s) => s.livePhotoPlaybackEnabled);
  const setEnabled = useSettingsStore((s) => s.setLivePhotoPlaybackEnabled);
  return (
    <View
      style={{
        marginTop: 16,
        backgroundColor: colors.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingVertical: 14,
        }}
      >
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 15,
              color: colors.text,
            }}
          >
            Live Photos
          </Text>
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 12,
              color: colors.textMuted,
              marginTop: 2,
            }}
          >
            Loop iOS Live Photos as short videos wherever they appear.
          </Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={setEnabled}
          trackColor={{
            true: colors.primary,
            false: colors.surfaceSecondary,
          }}
          thumbColor="#FFFFFF"
        />
      </View>
    </View>
  );
}

function DummyChapterToggle({ colors }: { colors: ThemePalette }) {
  const enabled = useChapterDevStore((s) => s.dummyChapterEnabled);
  const toggle = useChapterDevStore((s) => s.toggleDummyChapter);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 14,
      }}
    >
      <Text
        style={{
          fontFamily: "Roboto-Regular",
          fontSize: 15,
          color: colors.text,
        }}
      >
        Dummy Chapter
      </Text>
      <Switch
        value={enabled}
        onValueChange={toggle}
        trackColor={{ true: colors.primary, false: colors.surfaceSecondary }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

function DummyNotificationsToggle({ colors }: { colors: ThemePalette }) {
  const enabled = useTodayNotifDevStore((s) => s.dummyNotificationNudgeEnabled);
  const toggle = useTodayNotifDevStore((s) => s.toggleDummyNotificationNudge);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 14,
      }}
    >
      <Text
        style={{
          fontFamily: "Roboto-Regular",
          fontSize: 15,
          color: colors.text,
        }}
      >
        Dummy Notifications
      </Text>
      <Switch
        value={enabled}
        onValueChange={toggle}
        trackColor={{ true: colors.primary, false: colors.surfaceSecondary }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

function DummyThreadToggle({ colors }: { colors: ThemePalette }) {
  const enabled = useThreadDevStore((s) => s.dummyThreadEnabled);
  const toggle = useThreadDevStore((s) => s.toggleDummyThread);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 14,
      }}
    >
      <Text
        style={{
          fontFamily: "Roboto-Regular",
          fontSize: 15,
          color: colors.text,
        }}
      >
        Dummy Thread
      </Text>
      <Switch
        value={enabled}
        onValueChange={toggle}
        trackColor={{ true: colors.primary, false: colors.surfaceSecondary }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

/**
 * Force the Chapters tab icon into its "unseen" attention loop without
 * needing a real unviewed chapter in the database. Useful for previewing the
 * shimmer + slow rotate effect on the triangle.
 */
function ForceUnseenChapterToggle({ colors }: { colors: ThemePalette }) {
  const enabled = useUnseenStore((s) => s.forceUnseenChapterAttention);
  const toggle = useUnseenStore((s) => s.toggleForceUnseenChapterAttention);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 14,
      }}
    >
      <Text
        style={{
          fontFamily: "Roboto-Regular",
          fontSize: 15,
          color: colors.text,
        }}
      >
        Unseen Chapter
      </Text>
      <Switch
        value={enabled}
        onValueChange={toggle}
        trackColor={{ true: colors.primary, false: colors.surfaceSecondary }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

/** Same as `ForceUnseenChapterToggle`, but for the Connect (diamond) tab icon. */
function ForceUnseenConnectionToggle({ colors }: { colors: ThemePalette }) {
  const enabled = useUnseenStore((s) => s.forceUnseenThreadAttention);
  const toggle = useUnseenStore((s) => s.toggleForceUnseenThreadAttention);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 14,
      }}
    >
      <Text
        style={{
          fontFamily: "Roboto-Regular",
          fontSize: 15,
          color: colors.text,
        }}
      >
        Unseen Connection
      </Text>
      <Switch
        value={enabled}
        onValueChange={toggle}
        trackColor={{ true: colors.primary, false: colors.surfaceSecondary }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

function DummyPhotoAccessFlowTester({
  colors,
  onPress,
}: {
  colors: ThemePalette;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 14,
      }}
    >
      <Text
        style={{
          fontFamily: "Roboto-Regular",
          fontSize: 15,
          color: colors.text,
        }}
      >
        Test Photo Access Flow
      </Text>
      <Ionicons name="play-circle-outline" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function DummyLimitedPhotoAccessTester({
  colors,
  onPress,
}: {
  colors: ThemePalette;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 14,
      }}
    >
      <Text
        style={{
          fontFamily: "Roboto-Regular",
          fontSize: 15,
          color: colors.text,
        }}
      >
        Test limmited photo
      </Text>
      <Ionicons name="play-circle-outline" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

/**
 * Manually triggers the "You saved your first core memory" celebration sheet.
 * Resets the persisted `hasSeenFirstPinCelebration` flag first so the sheet
 * can be re-previewed even on accounts that have already seen it.
 */
function DummyFirstPinTester({ colors }: { colors: ThemePalette }) {
  return (
    <Pressable
      onPress={() => {
        const { resetSeen, show } = useFirstPinCelebrationStore.getState();
        resetSeen();
        show();
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 14,
      }}
    >
      <Text
        style={{
          fontFamily: "Roboto-Regular",
          fontSize: 15,
          color: colors.text,
        }}
      >
        Core memory
      </Text>
      <Ionicons name="play-circle-outline" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

/**
 * Writes the widget payload and reports what actually landed in the shared
 * container. Every failure in that path is deliberately silent — a widget that
 * shows stale numbers beats a save path that throws — so this is the only way
 * to see which end is broken from the device.
 */
function DevWidgetSnapshotTester({ colors }: { colors: ThemePalette }) {
  return (
    <Pressable
      onPress={() => {
        syncWidgetSnapshot();
        const info = inspectWidgetSnapshot();
        Alert.alert(
          "Widget snapshot",
          [
            `App Group: ${info.appGroup ?? "MISSING"}`,
            `Native module: ${info.nativeModuleAvailable ? "yes" : "NO"}`,
            `Error: ${info.error ?? "none"}`,
            `Stored: ${info.stored ?? "NOTHING"}`,
          ].join("\n")
        );
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 14,
      }}
    >
      <Text
        style={{
          fontFamily: "Roboto-Regular",
          fontSize: 15,
          color: colors.text,
        }}
      >
        Widget snapshot
      </Text>
      <Ionicons name="play-circle-outline" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function DevFirstMomentChatTester({ colors }: { colors: ThemePalette }) {
  return (
    <Pressable
      onPress={() => {
        const list = useEntryStore
          .getState()
          .entries.filter((e) => e.entry_type === "moment");
        const e = list[0];
        if (!e) {
          Alert.alert(
            "No moments yet",
            "Save a moment first, then run this preview.",
          );
          return;
        }
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.dismiss();
        // Only once Settings is actually gone. The chat is a `Modal` presented
        // by the tabs layout, and iOS silently drops a presentation from a
        // view controller that's still covered by another modal — which is
        // exactly what Settings is.
        setTimeout(() => {
          // The chat is once-per-account, so clear the completion flag first.
          useFirstMomentChatStore.getState().resetForNewAccount();
          useFirstMomentChatStore.getState().start(e.id);
        }, 450);
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 14,
      }}
    >
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 15,
            color: colors.text,
          }}
        >
          First moment onboarding chat
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 12,
            color: colors.textMuted,
            marginTop: 2,
          }}
        >
          Replay the post-first-capture chat with Jaryd.
        </Text>
      </View>
      <Ionicons name="play-circle-outline" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

/**
 * Opens the chat at the pre-capture picker, as a brand-new user sees it. Needs
 * no moments — the point is QAing the favorites picking flow itself.
 */
function DevOnboardingChatCaptureTester({ colors }: { colors: ThemePalette }) {
  return (
    <Pressable
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.dismiss();
        // See the note in `DevFirstMomentChatTester`: the chat can't present
        // until Settings has finished dismissing.
        setTimeout(() => {
          // The chat is once-per-account, so clear the completion flag first.
          useFirstMomentChatStore.getState().resetForNewAccount();
          useFirstMomentChatStore.getState().startBeforeCapture();
        }, 450);
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 14,
      }}
    >
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 15,
            color: colors.text,
          }}
        >
          Launch onboarding chat
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 12,
            color: colors.textMuted,
            marginTop: 2,
          }}
        >
          Start at the favorites picker, as a first-time user.
        </Text>
      </View>
      <Ionicons name="play-circle-outline" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function MagicFillOnboardingBannerDevToggle({
  colors,
}: {
  colors: ThemePalette;
}) {
  const enabled = useMagicFillDevStore((s) => s.forceOnboardingBanner);
  const toggle = useMagicFillDevStore((s) => s.toggleForceOnboardingBanner);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 14,
      }}
    >
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 15,
            color: colors.text,
          }}
        >
          MF onboarding banner
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 12,
            color: colors.textMuted,
            marginTop: 2,
          }}
        >
          Force the post-capture Magic Fill banner on Capture (view a day with a
          moment).
        </Text>
      </View>
      <Switch
        value={enabled}
        onValueChange={toggle}
        trackColor={{ true: colors.primary, false: colors.surfaceSecondary }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

function MagicFillOnboardingVariantDevPicker({
  colors,
}: {
  colors: ThemePalette;
}) {
  const variant = useMagicFillDevStore((s) => s.forceOnboardingVariant);
  const setVariant = useMagicFillDevStore((s) => s.setForceOnboardingVariant);

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
      <Text
        style={{
          fontFamily: "Roboto-Regular",
          fontSize: 15,
          color: colors.text,
          marginBottom: 10,
        }}
      >
        MF banner variant
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(
          [
            ["first_moment", "1st moment"],
            ["second_moment", "2nd moment"],
          ] as const
        ).map(([id, label]) => {
          const selected = variant === id;
          return (
            <Pressable
              key={id}
              onPress={() => setVariant(id)}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 10,
                borderWidth: 1.5,
                borderColor: selected ? colors.primary : colors.border,
                backgroundColor: selected
                  ? `${colors.primary}33`
                  : colors.surfaceSecondary,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 13,
                  color: colors.text,
                }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function MagicFillIgnoreCompletedDevToggle({
  colors,
}: {
  colors: ThemePalette;
}) {
  const enabled = useMagicFillDevStore((s) => s.ignoreMagicFillCompleted);
  const toggle = useMagicFillDevStore((s) => s.toggleIgnoreMagicFillCompleted);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 14,
      }}
    >
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 15,
            color: colors.text,
          }}
        >
          Ignore MF completed
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 12,
            color: colors.textMuted,
            marginTop: 2,
          }}
        >
          Treat Magic Fill as not done so the real banner rules can show again.
        </Text>
      </View>
      <Switch
        value={enabled}
        onValueChange={toggle}
        trackColor={{ true: colors.primary, false: colors.surfaceSecondary }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

function MagicFillResetCompletedDevButton({
  colors,
}: {
  colors: ThemePalette;
}) {
  return (
    <Pressable
      onPress={() => {
        useSettingsStore.getState().setHasCompletedMagicFill(false);
        Alert.alert(
          "Reset",
          "Local Magic Fill completed flag cleared. Open Capture on a day with 1–2 moments to preview the real banner."
        );
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 14,
      }}
    >
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 15,
            color: colors.text,
          }}
        >
          Reset MF completed flag
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 12,
            color: colors.textMuted,
            marginTop: 2,
          }}
        >
          Clears hasCompletedMagicFill in local settings.
        </Text>
      </View>
      <Ionicons name="refresh-outline" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

