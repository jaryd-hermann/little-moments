import { View, Pressable, Text, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";
import { useTabBarStore } from "@/store/tabBarStore";
import { useRewindComposeStore } from "@/store/rewindComposeStore";

const TAB_COMPOSE_PLUS = require("@/assets/images/tab-compose-plus.png");

const TAB_CONFIG: Record<
  string,
  { label: string; icon: string; iconFocused: string }
> = {
  today: {
    label: "Today",
    icon: "create-outline",
    iconFocused: "create",
  },
  "crash-burn": {
    label: "Race",
    icon: "play-forward-outline",
    iconFocused: "play-forward",
  },
  rewind: {
    label: "Rewind",
    icon: "play-back-outline",
    iconFocused: "play-back",
  },
  memories: {
    label: "Capsule",
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
  const tabBarHidden = useTabBarStore((s) => s.hidden);
  const centerIndex = 2;
  const currentRouteName = state.routes[state.index]?.name;

  if (tabBarHidden) {
    return null;
  }

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
                    void Haptics.impactAsync(
                      Haptics.ImpactFeedbackStyle.Soft
                    );
                    const { photoUri, photoDate } =
                      useRewindComposeStore.getState();
                    const onRewind = currentRouteName === "rewind";
                    if (
                      onRewind &&
                      photoUri &&
                      photoDate
                    ) {
                      router.push({
                        pathname: "/composer",
                        params: {
                          photoUri,
                          date: photoDate,
                        },
                      });
                    } else {
                      router.push("/composer");
                    }
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
                  <Image
                    source={TAB_COMPOSE_PLUS}
                    style={{ width: 26, height: 26 }}
                    resizeMode="contain"
                  />
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
