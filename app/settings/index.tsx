import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Switch,
  Alert,
  Linking,
  Share,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
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
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useSettingsStore } from "@/store/settingsStore";
import { Colors, ACCENT_PALETTES } from "@/constants/Colors";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/lib/supabase";
import {
  scheduleDailyReminder,
  cancelAllNotifications,
} from "@/lib/notifications";
import { exportToJSON } from "@/lib/icloud";
import { MarketingStoryCard } from "@/components/today/MarketingStoryCard";
import { StoryViewer } from "@/components/today/StoryViewer";

type ThemePalette = (typeof Colors)["light"];

export default function SettingsScreen() {
  const { profile, signOut, deleteAccount, user } = useAuth();
  const { subscriptionStatus } = useSubscription();
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

  const [showStoryViewer, setShowStoryViewer] = useState(false);
  const [activeStoryIndex, setActiveStoryIndex] = useState(0);

  const handleToggleNotifications = async (val: boolean) => {
    setNotificationEnabled(val);
    if (val) {
      await scheduleDailyReminder(
        notificationTime.hour,
        notificationTime.minute
      );
    } else {
      await cancelAllNotifications();
    }
    if (user) {
      await supabase
        .from("profiles")
        .update({ notification_enabled: val })
        .eq("id", user.id);
    }
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

  const handleExport = async () => {
    if (!user) return;
    try {
      await exportToJSON(user.id);
    } catch {
      Alert.alert("Error", "Export failed. Please try again.");
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

  const handleOpenStory = (storyIndex: number) => {
    setActiveStoryIndex(storyIndex);
    setShowStoryViewer(true);
  };

  const handleCloseStory = (highestSlide: number) => {
    setStoryProgress(activeStoryIndex, highestSlide);
    setShowStoryViewer(false);
  };

  if (showCustomerCenter && RevenueCatUI) {
    return (
      <RevenueCatUI.CustomerCenter
        onDismiss={() => setShowCustomerCenter(false)}
      />
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
        }}
      >
        <Pressable onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={colors.icon} />
        </Pressable>
        <Text
          style={{
            fontFamily: "LibreBaskerville-Bold",
            fontSize: 18,
            color: colors.text,
          }}
        >
          Settings
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
        {/* Profile header */}
        <View style={{ marginTop: 24, alignItems: "center" }}>
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 18,
              color: colors.text,
            }}
          >
            {profile?.display_name ?? "User"}
          </Text>
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 14,
              color: colors.textMuted,
              marginTop: 2,
            }}
          >
            {profile?.email}
          </Text>
        </View>

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

        {/* Notifications */}
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
            />
          </View>
        </View>

        {/* THE PHILOSOPHY — always rewatchable */}
        <View style={{ marginTop: 24 }}>
          <MarketingStoryCard
            onPressStory={handleOpenStory}
            storyProgress={storyProgress}
            hideCompleted={false}
          />
        </View>

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
                : subscriptionStatus === "trial"
                  ? "Free Trial"
                  : "Expired"
            }
            onPress={() => {
              if (subscriptionStatus === "active") {
                setShowCustomerCenter(true);
              } else {
                router.push("/paywall");
              }
            }}
          />
          <SettingDivider colors={colors} />
          <SettingRow
            colors={colors}
            label="Backup to iCloud"
            onPress={handleExport}
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
            onPress={() => {
              Share.share({
                message: "Check out Little Moments — honor the everyday. https://littlemoments.app",
                url: "https://littlemoments.app",
              });
            }}
          />
          <SettingDivider colors={colors} />
          <SettingRow
            colors={colors}
            label="Give Feedback"
            onPress={() =>
              Linking.openURL(
                "mailto:hello@littlemoments.app?subject=Feedback"
              )
            }
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
        visible={showStoryViewer}
        onClose={handleCloseStory}
        storyIndex={activeStoryIndex}
      />
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
