import { useTheme } from "@/hooks/useTheme";
import type { MovieProgress } from "@/lib/mashupBuckets";
import { Image } from "expo-image";
import { Text, View } from "react-native";

export interface MovieProgressPlaceholderProps {
  progress: MovieProgress;
  width: number;
  height?: number;
  /**
   * Who, where or what the movie would be about — "with Julia", "in Lisbon",
   * "about Family". Left off for period movies, where the section heading
   * already says it.
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
  const { colors, theme } = useTheme();
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
      {/*
        Kept modest: the card is only `width * 0.52` tall and the subject line
        below can run to three lines, so this has to share the height rather
        than claim it. The art sits inside a square canvas with its own margin,
        so it reads smaller than the box.
      */}
      <Image
        source={require("@/assets/images/no-movie.png")}
        style={{ width: 72, height: 72 }}
        contentFit="contain"
        // Black line work on transparency, so it needs inverting to stay
        // visible once the card goes dark.
        tintColor={theme === "dark" ? "#FFFFFF" : undefined}
      />
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
