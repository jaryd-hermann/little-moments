import { useTheme } from "@/hooks/useTheme";
import { CaptureInfoButton } from "@/components/capture/CaptureInfoButton";
import * as Haptics from "expo-haptics";
import { useCallback, useState } from "react";
import {
  LayoutAnimation,
  Platform,
  Text,
  UIManager,
  View,
} from "react-native";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface CaptureSectionHeadingProps {
  title: string;
  description: string;
  /** Extra horizontal padding (default 20). */
  gutter?: number;
  style?: { marginTop?: number; marginBottom?: number };
  /**
   * Pin the title to a single line (shrinking the font if needed). Keeps the
   * heading height stable when the title text swaps between states so the
   * content below doesn't shift.
   */
  singleLineTitle?: boolean;
}

/**
 * PM Gothic section title with an optional "i" info toggle that expands
 * explanatory copy underneath.
 */
export function CaptureSectionHeading({
  title,
  description,
  gutter = 20,
  style,
  singleLineTitle = false,
}: CaptureSectionHeadingProps) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);

  const toggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    void Haptics.selectionAsync();
    setExpanded((v) => !v);
  }, []);

  const paragraphs = description.split(/\n\n+/);

  return (
    <View
      style={{
        paddingHorizontal: gutter,
        marginTop: style?.marginTop,
        marginBottom: style?.marginBottom ?? 12,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <Text
          numberOfLines={singleLineTitle ? 1 : undefined}
          adjustsFontSizeToFit={singleLineTitle}
          style={{
            flex: 1,
            fontFamily: "PMGothicLudington-Text110",
            fontSize: 28,
            lineHeight: 32,
            color: colors.text,
          }}
        >
          {title}
        </Text>
        <CaptureInfoButton
          accessibilityLabel={`About ${title}`}
          onPress={toggle}
        />
      </View>
      {expanded ? (
        <View style={{ marginTop: 10, gap: 8 }}>
          {paragraphs.map((para, i) => (
            <Text
              key={i}
              style={{
                fontFamily: "Roboto-Regular",
                fontSize: 15,
                lineHeight: 22,
                color: colors.textSecondary,
              }}
            >
              {para}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
