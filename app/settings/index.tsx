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
import type { ReminderSlot } from "@/lib/notificationTimeSync";
import { PINK_CTA_INK } from "@/lib/themedShadow";
import { openStoreSubscriptionManagement } from "@/lib/revenuecat";
import { uploadAvatar } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { useSettingsStore } from "@/store/settingsStore";
import { useChapterDevStore } from "@/store/chapterStore";
import { useThreadDevStore } from "@/store/threadDevStore";
import { useTodayNotifDevStore } from "@/store/todayNotifDevStore";
import { useUnseenStore } from "@/store/unseenStore";
import { useFirstPinCelebrationStore } from "@/store/firstPinCelebrationStore";
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
const SHOW_APPEARANCE_SETTINGS = true;
/** Hide accent picker — theme toggle is the only appearance control for now. */
const SHOW_ACCENT_PICKER = false;
/** Hide the rewatchable Philosophy stories card. Flip back on if we want
 *  to surface the marketing rewatch entry from settings again. */
const SHOW_PHILOSOPHY_STORIES = false;

const GOOD_TIMES_APP_STORE_URL =
  "https://apps.apple.com/us/app/good-times-one-group-question/id6755366013";

const PROMO_GOOD_TIMES = require("@/assets/images/promo-good-times.png");
/** Intrinsic size of promo-good-times.png (avoids letterboxing in a fixed-height box). */
const PROMO_GOOD_TIMES_ASPECT = 1242 / 580;

function SettingsDailyPromptTimeSection({
  userId,
  notificationEnabled,
}: {
  userId: string;
  notificationEnabled: boolean;
}) {
  const { colors } = useTheme();
  const { fetchProfile } = useAuth();
  const notificationTime = useSettingsStore((s) => s.notificationTime);
  const setNotificationTime = useSettingsStore((s) => s.setNotificationTime);
  const { selectedSlot, times, selectSlot, changeTimeForSlot } = useReminderScheduleState({
    hour: notificationTime.hour,
    minute: notificationTime.minute,
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef({ times, selectedSlot });
  latestRef.current = { times, selectedSlot };

  const flushPersist = useCallback(async () => {
    const { times: tm, selectedSlot: sl } = latestRef.current;
    const t = tm[sl];
    setNotificationTime(t.hour, t.minute);
    await syncPushRegistration({
      notificationsEnabled: notificationEnabled,
      reminderHour: t.hour,
      reminderMinute: t.minute,
    });
    await fetchProfile();
  }, [
    userId,
    notificationEnabled,
    setNotificationTime,
    fetchProfile,
  ]);

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

  return (
    <View style={{ paddingTop: 4, paddingBottom: 4 }}>
      <Text
        style={{
          fontFamily: "Roboto-Light",
          fontSize: 13,
          color: colors.textMuted,
          lineHeight: 20,
          marginBottom: 12,
        }}
      >
        We&apos;ll notify you when your new photo is ready. Pick a default time (change anytime).
      </Text>
      <DailyPromptReminderSchedule
        selectedSlot={selectedSlot}
        times={times}
        onSelectSlot={selectWrapped}
        onChangeTimeForSlot={changeWrapped}
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
    });
  };

  const handleThemeChoice = (next: "light" | "dark" | "system") => {
    if (next === themePreference) return;
    void Haptics.selectionAsync();
    setTheme(next);
    posthog.capture("theme_changed", {
      preference: next,
      previous: themePreference,
    });
    if (user) {
      supabase
        .from("profiles")
        .update({ color_theme: next })
        .eq("id", user.id);
    }
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
            router.push("/ellie-premium");
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
                  userId={user.id}
                  notificationEnabled={notificationEnabled}
                />
              </View>
            </>
          ) : null}
        </View>

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

        {/* You might also like — cross-promo for our other app, anchored
            below ACCOUNT so it doesn't compete with the user's own settings. */}
        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 11,
            color: colors.textMuted,
            letterSpacing: 1,
            textTransform: "uppercase",
            marginTop: 28,
            marginBottom: 8,
          }}
        >
          YOU MIGHT ALSO LIKE
        </Text>
        <Pressable
          onPress={() => Linking.openURL(GOOD_TIMES_APP_STORE_URL)}
          accessibilityRole="link"
          accessibilityLabel="Good Times: One Group Question on the App Store"
          style={{
            borderRadius: 14,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Image
            source={PROMO_GOOD_TIMES}
            style={{ width: "100%", aspectRatio: PROMO_GOOD_TIMES_ASPECT }}
            contentFit="cover"
          />
        </Pressable>

        <Pressable onPress={() => { posthog.capture("logged_out"); signOut(); }} style={{ marginTop: 24, marginBottom: 48 }}>
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 15,
              color: "#EF4444",
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
 * Manually triggers the "You pinned your first moment" celebration sheet.
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
        Pin
      </Text>
      <Ionicons name="play-circle-outline" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const WORDMARK_PREMIUM = require("@/assets/images/wordmark-premium.png");

function MembershipCard({
  colors,
  subscriptionStatus,
  createdAt,
  onManage,
  onExplore,
}: {
  colors: ThemePalette;
  subscriptionStatus: string;
  createdAt: string | null;
  canManageSubscription: boolean;
  onManage: () => void | Promise<void>;
  onExplore: () => void;
}) {
  const sinceDate = createdAt
    ? new Date(createdAt).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : null;

  const isPremium =
    subscriptionStatus === "active" || subscriptionStatus === "cancelled";
  const isFree =
    subscriptionStatus === "free" || subscriptionStatus === "trial";

  const handlePress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
    if (isFree) {
      onExplore();
    } else {
      void onManage();
    }
  };

  if (isPremium) {
    const premiumSublabel =
      subscriptionStatus === "active"
        ? "You have full access"
        : "Access until the end of your billing period";
    return (
      <View
        style={{
          marginTop: 16,
          backgroundColor: "#202020",
          borderRadius: 14,
          borderWidth: 2,
          borderColor: "#FECFB4",
          paddingHorizontal: 24,
          paddingVertical: 24,
        }}
      >
        <Pressable onPress={handlePress}>
          <Image
            source={WORDMARK_PREMIUM}
            style={{ height: 36, width: "100%", alignSelf: "center" }}
            contentFit="contain"
          />
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 14,
              color: "#FFFFFF",
              textAlign: "center",
              marginTop: 18,
            }}
          >
            {premiumSublabel}
          </Text>
          {sinceDate && (
            <Text
              style={{
                fontFamily: "Roboto-Light",
                fontSize: 13,
                color: "rgba(255,255,255,0.45)",
                textAlign: "center",
                marginTop: 14,
              }}
            >
              Premium member since {sinceDate}
            </Text>
          )}
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={{
        marginTop: 16,
        backgroundColor: "#202020",
        borderRadius: 14,
        borderWidth: 2,
        borderColor: "#FECFB4",
        paddingHorizontal: 24,
        paddingVertical: 24,
      }}
    >
      <Pressable onPress={handlePress}>
        <Image
          source={WORDMARK_PREMIUM}
          style={{ height: 36, width: "100%", alignSelf: "center" }}
          contentFit="contain"
        />
        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 14,
            color: "#FFFFFF",
            textAlign: "center",
            marginTop: 18,
          }}
        >
          See if becoming a Premium member is right for you
        </Text>
        {sinceDate && (
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 13,
              color: "rgba(255,255,255,0.45)",
              textAlign: "center",
              marginTop: 14,
            }}
          >
            Free member since {sinceDate}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

