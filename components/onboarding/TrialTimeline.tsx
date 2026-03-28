import { useEffect } from "react";
import { View, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { format, addDays } from "date-fns";
import { useTheme } from "@/hooks/useTheme";

const NODES = [
  {
    label: "Today",
    sublabel: "Your free trial begins",
    icon: "✅",
    dayOffset: 0,
  },
  {
    label: "Day 13",
    sublabel: "We'll remind you before your trial ends",
    icon: "🔔",
    dayOffset: 13,
  },
  {
    label: "Day 14",
    sublabel: "Trial ends — choose your plan",
    icon: "🔓",
    dayOffset: 14,
  },
];

export function TrialTimeline() {
  const { colors } = useTheme();
  const lineHeight = useSharedValue(0);

  useEffect(() => {
    lineHeight.value = withTiming(1, { duration: 1200 });
  }, []);

  const lineStyle = useAnimatedStyle(() => ({
    height: `${lineHeight.value * 100}%`,
  }));

  return (
    <View style={{ paddingHorizontal: 8 }}>
      {NODES.map((node, index) => {
        const date = format(
          addDays(new Date(), node.dayOffset),
          "MMM d, yyyy"
        );

        return (
          <View key={index} style={{ flexDirection: "row" }}>
            <View
              style={{
                marginRight: 16,
                width: 32,
                alignItems: "center",
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 14 }}>{node.icon}</Text>
              </View>
              {index < NODES.length - 1 && (
                <View
                  style={{
                    width: 2,
                    flex: 1,
                    overflow: "hidden",
                    backgroundColor: colors.border,
                  }}
                >
                  <Animated.View
                    style={[
                      {
                        width: "100%",
                        backgroundColor: colors.primary,
                      },
                      lineStyle,
                    ]}
                  />
                </View>
              )}
            </View>

            <View style={{ flex: 1, paddingBottom: 32 }}>
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 15,
                  color: colors.text,
                }}
              >
                {node.label}{" "}
                <Text
                  style={{
                    fontFamily: "Roboto-Light",
                    color: colors.textMuted,
                  }}
                >
                  — {date}
                </Text>
              </Text>
              <Text
                style={{
                  fontFamily: "Roboto-Light",
                  fontSize: 13,
                  color: colors.textSecondary,
                  marginTop: 4,
                }}
              >
                {node.sublabel}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
