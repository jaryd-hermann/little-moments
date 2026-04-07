import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface CongratsCardProps {
  headline: string;
  totalMoments: number;
  streakCount: number;
  badge?: { label: string; icon: string };
  /** When provided (including `0`), shows a third column for threads. */
  threadsCount?: number;
  onPressMoments?: () => void;
  onPressThreads?: () => void;
}

const CARD_BG = "#024F46";

const CHEVRON_COLOR = "rgba(255,255,255,0.55)";

export function CongratsCard({
  headline,
  totalMoments,
  streakCount,
  badge,
  threadsCount,
  onPressMoments,
  onPressThreads,
}: CongratsCardProps) {
  const showThreadsColumn = threadsCount !== undefined;

  const momentsInner = (
    <>
      <Text
        style={{
          fontFamily: "LibreBaskerville-Bold",
          fontSize: 28,
          color: "#FFFFFF",
        }}
      >
        {totalMoments}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginTop: 2,
          gap: 2,
        }}
      >
        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 12,
            color: "rgba(255,255,255,0.7)",
          }}
        >
          moments
        </Text>
        {onPressMoments ? (
          <Ionicons name="chevron-forward" size={14} color={CHEVRON_COLOR} />
        ) : null}
      </View>
    </>
  );

  const threadsInner = (
    <>
      <Text
        style={{
          fontFamily: "LibreBaskerville-Bold",
          fontSize: 28,
          color: "#FFFFFF",
        }}
      >
        {threadsCount}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginTop: 2,
          gap: 2,
        }}
      >
        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 12,
            color: "rgba(255,255,255,0.7)",
          }}
        >
          threads
        </Text>
        {onPressThreads ? (
          <Ionicons name="chevron-forward" size={14} color={CHEVRON_COLOR} />
        ) : null}
      </View>
    </>
  );

  return (
    <View
      style={{
        marginBottom: 16,
        borderRadius: 16,
        backgroundColor: CARD_BG,
        padding: 20,
        gap: 16,
      }}
    >
      <Text
        style={{
          fontFamily: "LibreBaskerville-Bold",
          fontSize: 18,
          color: "#FFFFFF",
          textAlign: "center",
        }}
      >
        {headline}
      </Text>

      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        {onPressMoments ? (
          <Pressable
            onPress={onPressMoments}
            style={{ flex: 1, alignItems: "center" }}
            accessibilityRole="button"
            accessibilityLabel="Open Capsule, moments list"
          >
            {momentsInner}
          </Pressable>
        ) : (
          <View style={{ flex: 1, alignItems: "center" }}>{momentsInner}</View>
        )}
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text
            style={{
              fontFamily: "LibreBaskerville-Bold",
              fontSize: 28,
              color: "#FFFFFF",
            }}
          >
            {streakCount}
          </Text>
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 12,
              color: "rgba(255,255,255,0.7)",
              marginTop: 2,
            }}
          >
            day streak
          </Text>
        </View>
        {showThreadsColumn ? (
          onPressThreads ? (
            <Pressable
              onPress={onPressThreads}
              style={{ flex: 1, alignItems: "center" }}
              accessibilityRole="button"
              accessibilityLabel="Open Threads"
            >
              {threadsInner}
            </Pressable>
          ) : (
            <View style={{ flex: 1, alignItems: "center" }}>{threadsInner}</View>
          )
        ) : null}
      </View>

      {badge && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingTop: 8,
            borderTopWidth: 1,
            borderTopColor: "rgba(255,255,255,0.15)",
          }}
        >
          <Ionicons
            name={badge.icon as keyof typeof Ionicons.glyphMap}
            size={20}
            color="#F0D7FF"
          />
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 14,
              color: "#F0D7FF",
            }}
          >
            {badge.label}
          </Text>
        </View>
      )}
    </View>
  );
}
