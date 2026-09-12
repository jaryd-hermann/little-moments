import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import type { MovieProgress } from "@/lib/mashupBuckets";
import { Text, View } from "react-native";

export interface MovieProgressPlaceholderProps {
  progress: MovieProgress;
  width: number;
  height?: number;
  /**
   * Who or what the movie would be about — "with Julia", "about Family". Left
   * off for period movies, where the section heading already says it.
   */
  subject?: string | null;
}

/**
 * Stand-in for a movie that hasn't earned itself yet: says how many more
 * moments it needs and shows how close the user is.
 *
 * Used everywhere a movie could appear but doesn't — the Capture tab's
 * current-month slot and every empty section on Chapters — so the number the
 * user is chasing reads the same on both.
 */
export function MovieProgressPlaceholder({
  progress,
  width,
  height,
  subject = null,
}: MovieProgressPlaceholderProps) {
  const { colors } = useTheme();
  const { current, required, remaining, ratio } = progress;

  return (
    <View
      style={{
        width,
        height: height ?? Math.round(width * 0.52),
        borderRadius: 18,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: colors.border,
        backgroundColor: colors.surfaceSecondary,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 28,
        gap: 14,
      }}
    >
      <Ionicons name="film-outline" size={28} color={colors.textMuted} />
      <Text
        style={{
          fontFamily: "Roboto-Medium",
          fontSize: 15,
          lineHeight: 22,
          color: colors.textSecondary,
          textAlign: "center",
        }}
      >
        Capture {remaining} more moment{remaining === 1 ? "" : "s"}
        {subject ? ` ${subject}` : ""} to get a movie made for you
      </Text>

      <View style={{ width: "100%", maxWidth: 260, gap: 6 }}>
        <View
          style={{
            height: 6,
            borderRadius: 3,
            backgroundColor: colors.border,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              width: `${Math.round(ratio * 100)}%`,
              height: "100%",
              borderRadius: 3,
              backgroundColor: colors.primary,
            }}
          />
        </View>
        <Text
          style={{
            fontFamily: "Roboto-Medium",
            fontSize: 12,
            color: colors.textMuted,
            textAlign: "center",
          }}
        >
          {current} of {required} moments
        </Text>
      </View>
    </View>
  );
}
