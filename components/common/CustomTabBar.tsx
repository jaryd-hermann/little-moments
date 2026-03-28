import { View, Pressable, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";

const TAB_CONFIG: Record<
  string,
  { label: string; icon: string; iconFocused: string }
> = {
  today: {
    label: "Home",
    icon: "home-outline",
    iconFocused: "home",
  },
  "crash-burn": {
    label: "Race",
    icon: "create-outline",
    iconFocused: "create",
  },
  rewind: {
    label: "Rewind",
    icon: "play-back-outline",
    iconFocused: "play-back",
  },
  memories: {
    label: "Memories",
    icon: "book-outline",
    iconFocused: "book",
  },
};

export function CustomTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const { colors, theme } = useTheme();
  const insets = useSafeAreaInsets();
  const centerIndex = 2;

  return (
    <View
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        paddingBottom: insets.bottom > 0 ? insets.bottom : 16,
        paddingHorizontal: 16,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: colors.surface,
          borderRadius: 9999,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: 8,
          paddingVertical: 8,
        }}
      >
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const isCenter = index === centerIndex;

          if (isCenter) {
            return (
              <View
                key={route.key}
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(
                      Haptics.ImpactFeedbackStyle.Medium
                    );
                    router.push("/composer");
                  }}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 9999,
                    backgroundColor: colors.primary,
                    borderWidth: 2,
                    borderColor: theme === "dark" ? "#FFFFFF" : "#1A1A1A",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="add" size={24} color="#000000" />
                </Pressable>
              </View>
            );
          }

          const config = TAB_CONFIG[route.name];
          if (!config) return null;

          const iconName = (
            isFocused ? config.iconFocused : config.icon
          ) as keyof typeof Ionicons.glyphMap;

          return (
            <Pressable
              key={route.key}
              onPress={() => {
                if (!isFocused) {
                  navigation.navigate(route.name);
                }
              }}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 8,
                paddingHorizontal: 4,
                borderRadius: 9999,
                backgroundColor: isFocused
                  ? theme === "dark"
                    ? "rgba(255, 255, 255, 0.15)"
                    : "rgba(0, 0, 0, 0.1)"
                  : "transparent",
              }}
            >
              <Ionicons
                name={iconName}
                size={22}
                color={
                  isFocused
                    ? colors.tabIconSelected
                    : colors.tabIconDefault
                }
              />
              <Text
                style={{
                  marginTop: 2,
                  fontSize: 11,
                  fontFamily: "Roboto-Regular",
                  color: isFocused
                    ? colors.tabIconSelected
                    : colors.tabIconDefault,
                }}
              >
                {config.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
