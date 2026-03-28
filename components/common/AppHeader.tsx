import { useState } from "react";
import { View, Text, Pressable, Modal, ScrollView } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StreakBadge } from "./StreakBadge";
import { useTheme } from "@/hooks/useTheme";

interface AppHeaderProps {
  streakCount: number;
  isAtRisk?: boolean;
  displayName?: string | null;
  avatarUrl?: string | null;
  longestStreak?: number;
  totalMoments?: number;
}

export function AppHeader({
  streakCount,
  isAtRisk,
  displayName,
  avatarUrl,
  longestStreak = 0,
  totalMoments = 0,
}: AppHeaderProps) {
  const { colors, theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [showStreak, setShowStreak] = useState(false);

  const hasFirstStory = totalMoments >= 1;

  return (
    <>
      <View className="flex-row items-center justify-between px-5 py-2">
        <StreakBadge
          count={streakCount}
          isAtRisk={isAtRisk}
          onPress={() => setShowStreak(true)}
        />

        <Text
          style={{
            fontFamily: "Roboto-Medium",
            fontSize: 16,
            color: colors.text,
            letterSpacing: 0.3,
          }}
        >
          Little Moments
        </Text>

        <Pressable
          onPress={() => router.push("/settings")}
          style={{
            width: 32,
            height: 32,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="menu" size={24} color={colors.icon} />
        </Pressable>
      </View>

      <Modal
        visible={showStreak}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowStreak(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 20,
              paddingTop: insets.top + 12,
              paddingBottom: 12,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <Text
              style={{
                fontFamily: "LibreBaskerville-Bold",
                fontSize: 20,
                color: colors.text,
              }}
            >
              Your Streak
            </Text>
            <Pressable onPress={() => setShowStreak(false)}>
              <Ionicons name="close" size={24} color={colors.icon} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 24, alignItems: "center" }}
          >
            <Text style={{ fontSize: 64, marginTop: 16 }}>🔥</Text>
            <Text
              style={{
                fontFamily: "LibreBaskerville-Bold",
                fontSize: 48,
                color: colors.text,
                marginTop: 8,
              }}
            >
              {streakCount}
            </Text>
            <Text
              style={{
                fontFamily: "Roboto-Light",
                fontSize: 15,
                color: colors.textSecondary,
                marginTop: 4,
              }}
            >
              day streak
            </Text>

            <View style={{ flexDirection: "row", gap: 16, marginTop: 32, width: "100%" }}>
              <View
                style={{
                  flex: 1,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  padding: 20,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: "LibreBaskerville-Bold",
                    fontSize: 28,
                    color: colors.text,
                  }}
                >
                  {longestStreak}
                </Text>
                <Text
                  style={{
                    fontFamily: "Roboto-Light",
                    fontSize: 13,
                    color: colors.textMuted,
                    marginTop: 4,
                  }}
                >
                  Longest Streak
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  padding: 20,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: "LibreBaskerville-Bold",
                    fontSize: 28,
                    color: colors.text,
                  }}
                >
                  {totalMoments}
                </Text>
                <Text
                  style={{
                    fontFamily: "Roboto-Light",
                    fontSize: 13,
                    color: colors.textMuted,
                    marginTop: 4,
                  }}
                >
                  Total Moments
                </Text>
              </View>
            </View>

            {hasFirstStory && (
              <View
                style={{
                  marginTop: 24,
                  width: "100%",
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: colors.primary,
                  backgroundColor: colors.primary + "18",
                  padding: 20,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <Text style={{ fontSize: 28 }}>⭐</Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: "Roboto-Medium",
                      fontSize: 16,
                      color: colors.text,
                    }}
                  >
                    Story Starter!
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Roboto-Light",
                      fontSize: 13,
                      color: colors.textSecondary,
                      marginTop: 2,
                    }}
                  >
                    You posted your first moment. The journey begins.
                  </Text>
                </View>
              </View>
            )}

            {isAtRisk && (
              <View
                style={{
                  marginTop: 16,
                  width: "100%",
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: colors.warning,
                  backgroundColor: colors.warning + "18",
                  padding: 20,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <Text style={{ fontSize: 28 }}>⚠️</Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: "Roboto-Medium",
                      fontSize: 16,
                      color: colors.text,
                    }}
                  >
                    Streak at risk!
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Roboto-Light",
                      fontSize: 13,
                      color: colors.textSecondary,
                      marginTop: 2,
                    }}
                  >
                    Add a moment today to keep it alive.
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
