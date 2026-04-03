import { InfoTipModal } from "@/components/common/InfoTipModal";
import { MarketingStoryCard } from "@/components/today/MarketingStoryCard";
import { StoryViewer } from "@/components/today/StoryViewer";
import { ACCENT_PALETTES, Colors } from "@/constants/Colors";
import { useAuth } from "@/hooks/useAuth";
import { useMarketingStories } from "@/hooks/useMarketingStories";
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
import { openStoreSubscriptionManagement } from "@/lib/revenuecat";
import { supabase } from "@/lib/supabase";
import { useSettingsStore } from "@/store/settingsStore";
import { useChapterDevStore } from "@/store/chapterStore";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Alert,
    Linking,
    Pressable,
    ScrollView,
    Switch,
    Text,
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
const SHOW_APPEARANCE_SETTINGS = false;

const GOOD_TIMES_APP_STORE_URL =
  "https://apps.apple.com/us/app/good-times-one-group-question/id6755366013";

const PROMO_GOOD_TIMES = require("@/assets/images/promo-good-times.png");
/** Intrinsic size of promo-good-times.png (avoids letterboxing in a fixed-height box). */
const PROMO_GOOD_TIMES_ASPECT = 1242 / 580;

export default function SettingsScreen() {
  const { profile, signOut, deleteAccount, user } = useAuth();
  const {
    subscriptionStatus,
    canManageSubscriptionInStore,
    refreshStoreEntitlement,
    syncAfterSubscriptionManagement,
  } = useSubscription();
  const posthog = usePostHog();
  const [showCustomerCenter, setShowCustomerCenter] = useState(false);
  const { colors, theme, setTheme, accentColor, setAccentColor } = useTheme();
  const notificationEnabled = useSettingsStore(
    (s) => s.notificationEnabled
  );
  const setNotificationEnabled = useSettingsStore(
    (s) => s.setNotificationEnabled
  );
  const notificationTime = useSettingsStore(
    (s) => s.notificationTime
  );
  const streakAtRiskEnabled = useSettingsStore(
    (s) => s.streakAtRiskEnabled
  );
  const setStreakAtRiskEnabled = useSettingsStore(
    (s) => s.setStreakAtRiskEnabled
  );
  const storyProgress = useSettingsStore((s) => s.storyProgress);
  const setStoryProgress = useSettingsStore((s) => s.setStoryProgress);
  const { philosophyStories, bySlug } = useMarketingStories();
  const philosophyListItems = useMemo(
    () => toMarketingStoryListItems(philosophyStories),
    [philosophyStories]
  );

  const [storyViewerSlug, setStoryViewerSlug] = useState<string | null>(null);
  const [showICloudComingSoon, setShowICloudComingSoon] = useState(false);
  const [donationCauseName, setDonationCauseName] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.donation_cause_id) return;
    (async () => {
      const { data } = await supabase
        .from("donation_causes")
        .select("title")
        .eq("id", profile.donation_cause_id!)
        .single();
      if (data) setDonationCauseName(data.title);
    })();
  }, [profile?.donation_cause_id]);
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

  const handleThemeSwitch = (dark: boolean) => {
    const newTheme = dark ? "dark" : "light";
    setTheme(newTheme);
    if (user) {
      supabase
        .from("profiles")
        .update({ color_theme: newTheme })
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
            fontFamily: "LibreBaskerville-Bold",
            fontSize: 18,
            color: colors.text,
          }}
        >
          Settings and stuff
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
        {/* Profile header — avoid repeating the same email as name + subtitle */}
        <View style={{ marginTop: 24, marginBottom: 16, alignItems: "center" }}>
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 18,
              color: colors.text,
            }}
          >
            {profile?.display_name?.trim() || profile?.email || "User"}
          </Text>
          {profile?.email &&
          profile?.display_name?.trim() &&
          profile.display_name.trim() !== profile.email ? (
            <Text
              style={{
                fontFamily: "Roboto-Light",
                fontSize: 14,
                color: colors.textMuted,
                marginTop: 2,
              }}
            >
              {profile.email}
            </Text>
          ) : null}
        </View>

        <TrialCard
          colors={colors}
          subscriptionStatus={subscriptionStatus}
          trialStartDate={profile?.trial_start_date ?? null}
          canManageSubscription={canManageSubscriptionInStore}
          onPress={handleManageSubscription}
        />

        {donationCauseName && (
          <View
            style={{
              marginTop: 10,
              backgroundColor: colors.surface,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: 18,
              paddingVertical: 14,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Text style={{ fontSize: 16 }}>💜</Text>
            <Text
              style={{
                flex: 1,
                fontFamily: "Roboto-Light",
                fontSize: 13,
                color: colors.textSecondary,
                lineHeight: 18,
              }}
            >
              {subscriptionStatus === "active"
                ? `Your membership supports ${donationCauseName}`
                : `Your membership will start supporting ${donationCauseName}`}
            </Text>
          </View>
        )}

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
                  Dark Mode
                </Text>
                <Switch
                  value={theme === "dark"}
                  onValueChange={handleThemeSwitch}
                  trackColor={{
                    true: colors.primary,
                    false: colors.surfaceSecondary,
                  }}
                />
              </View>
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
          <SettingDivider colors={colors} />
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
              Streak at Risk Alerts
            </Text>
            <Switch
              value={streakAtRiskEnabled}
              onValueChange={(val) => {
                setStreakAtRiskEnabled(val);
                if (user) {
                  supabase
                    .from("profiles")
                    .update({ streak_at_risk_enabled: val })
                    .eq("id", user.id);
                }
              }}
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
        </View>

        {/* Story Coach */}
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
          STORY COACH
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
            label="Manage Story Coach"
            sublabel={profile?.story_coach_enabled ? "On" : "Off"}
            onPress={() => router.push("/settings/story-coach")}
          />
        </View>

        {/* THE PHILOSOPHY — always rewatchable */}
        <View style={{ marginTop: 24 }}>
          <MarketingStoryCard
            stories={philosophyListItems}
            onPressStory={handleOpenStory}
            storyProgress={storyProgress}
            hideCompleted={false}
          />
        </View>

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
                  : subscriptionStatus === "trial"
                    ? "Free Trial"
                    : "Expired"
            }
            onPress={() => void handleManageSubscription()}
          />
          <SettingDivider colors={colors} />
          <SettingRow
            colors={colors}
            label="Manage your donation"
            sublabel={donationCauseName ?? undefined}
            onPress={() => router.push("/settings/manage-donation")}
          />
          <SettingDivider colors={colors} />
          <SettingRow
            colors={colors}
            label="Backup to iCloud"
            onPress={() => setShowICloudComingSoon(true)}
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

        <Pressable onPress={signOut} style={{ marginTop: 24, marginBottom: 48 }}>
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

      <InfoTipModal
        visible={showICloudComingSoon}
        onClose={() => setShowICloudComingSoon(false)}
        title="Coming soon"
      >
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 15,
            color: "#333333",
            lineHeight: 22,
          }}
        >
          iCloud backup isn&apos;t available yet. We&apos;ll let you know when
          you can save your moments there.
        </Text>
      </InfoTipModal>
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

const TRIAL_DAYS = 14;

function TrialCard({
  colors,
  subscriptionStatus,
  trialStartDate,
  canManageSubscription,
  onPress,
}: {
  colors: ThemePalette;
  subscriptionStatus: string;
  trialStartDate: string | null;
  canManageSubscription: boolean;
  onPress: () => void | Promise<void>;
}) {
  const daysLeft = (() => {
    if (subscriptionStatus !== "trial" || !trialStartDate) return 0;
    const end =
      new Date(trialStartDate).getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000;
    return Math.max(0, Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000)));
  })();

  const label =
    subscriptionStatus === "active" || subscriptionStatus === "cancelled"
      ? "Premium"
      : subscriptionStatus === "trial"
        ? "Free Trial"
        : "Expired";

  const sublabel =
    subscriptionStatus === "active"
      ? "You have full access"
      : subscriptionStatus === "cancelled"
        ? "Won’t renew — you keep access until the period ends"
        : subscriptionStatus === "trial"
          ? `${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining`
          : "Your trial has ended";

  const barProgress =
    subscriptionStatus === "trial" && trialStartDate
      ? Math.min(1, Math.max(1 / TRIAL_DAYS, 1 - daysLeft / TRIAL_DAYS))
      : 1;

  return (
    <Pressable
      onPress={() => void onPress()}
      style={({ pressed }) => ({
        marginTop: 16,
        backgroundColor: colors.surface,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: 18,
        paddingVertical: 16,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontFamily: "Roboto-Medium",
            fontSize: 15,
            color: colors.text,
          }}
        >
          {label}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 13,
              color: colors.textMuted,
            }}
          >
            {canManageSubscription ? "Manage" : "Upgrade"}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </View>
      </View>

      {subscriptionStatus === "trial" ? (
        <>
          <View
            style={{
              marginTop: 12,
              height: 6,
              borderRadius: 3,
              backgroundColor: colors.borderLight,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${barProgress * 100}%`,
                height: "100%",
                borderRadius: 3,
                backgroundColor:
                  daysLeft <= 3 ? "#EF4444" : "#FFA946",
              }}
            />
          </View>
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 12,
              color: daysLeft <= 3 && subscriptionStatus === "trial"
                ? "#EF4444"
                : colors.textMuted,
              marginTop: 6,
            }}
          >
            {sublabel}
          </Text>
        </>
      ) : subscriptionStatus === "active" ||
        subscriptionStatus === "cancelled" ? (
        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 12,
            color: colors.textMuted,
            marginTop: 6,
          }}
        >
          {sublabel}
        </Text>
      ) : (
        <>
          <View
            style={{
              marginTop: 12,
              height: 6,
              borderRadius: 3,
              backgroundColor: colors.borderLight,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${barProgress * 100}%`,
                height: "100%",
                borderRadius: 3,
                backgroundColor:
                  daysLeft <= 3 ? "#EF4444" : "#FFA946",
              }}
            />
          </View>
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 12,
              color: colors.textMuted,
              marginTop: 6,
            }}
          >
            {sublabel}
          </Text>
        </>
      )}
    </Pressable>
  );
}
