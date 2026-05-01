import { View, Pressable, Text, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";
import { useTabBarStore } from "@/store/tabBarStore";

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
  memories: {
    label: "Capsule",
    icon: "book-outline",
    iconFocused: "book",
  },
};

const VISIBLE_TABS = ["today", "add", "memories"];

export function CustomTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const { colors, theme } = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarHidden = useTabBarStore((s) => s.hidden);
  const triggerAddReset = useTabBarStore((s) => s.triggerAddReset);

  if (tabBarHidden) return null;

  const visibleRoutes = state.routes.filter((r) => VISIBLE_TABS.includes(r.name));
  const centerName = "add";

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
        {visibleRoutes.map((route) => {
          const globalIndex = state.routes.findIndex((r) => r.key === route.key);
          const isFocused = state.index === globalIndex;
          const isCenter = route.name === centerName;

          if (isCenter) {
            return (
              <View
                key={route.key}
                style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
              >
                <Pressable
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
                    if (isFocused) {
                      triggerAddReset();
                    } else {
                      navigation.navigate(route.name);
                    }
                  }}
                  style={{
                    minHeight: 48,
                    paddingLeft: 14,
                    paddingRight: 18,
                    borderRadius: 9999,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    backgroundColor: colors.primary,
                    borderWidth: 2,
                    borderColor: theme === "dark" ? "#FFFFFF" : "#1A1A1A",
                    justifyContent: "center",
                  }}
                >
                  <Image
                    source={TAB_COMPOSE_PLUS}
                    style={{ width: 26, height: 26 }}
                    resizeMode="contain"
                  />
                  <Text
                    style={{
                      fontSize: 15,
                      fontFamily: "Roboto-Medium",
                      color: "#1A1A1A",
                    }}
                  >
                    Add
                  </Text>
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
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
                if (!isFocused) navigation.navigate(route.name);
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
                color={isFocused ? colors.tabIconSelected : colors.tabIconDefault}
              />
              <Text
                style={{
                  marginTop: 2,
                  fontSize: 11,
                  fontFamily: "Roboto-Regular",
                  color: isFocused ? colors.tabIconSelected : colors.tabIconDefault,
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
