import { View, Text, Pressable, Linking, Alert } from "react-native";
import type { ImageSourcePropType } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";

const CARD_BG = "#FAF9ED";
const BUTTON_BG = "#EEDDFF";
const INK = "#000000";
const BUTTON_BORDER = 1.5;
const BUTTON_RADIUS = 10;
const LOGO_SLOT = 22;

const _padBeforeShrink = Math.max(
  8,
  Math.round(Math.round(17 * 1.6) * 0.5)
);
/** Vertical padding inside each CTA */
const BUTTON_PADDING_V = Math.max(7, Math.round(_padBeforeShrink * 0.9));

/**
 * Lavender chrome must own min height — Pressable minHeight does not reliably
 * size the parent View that draws the fill + border.
 */
const _buttonChromeTall = Math.max(
  Math.round(48 * 1.6),
  Math.round(17 * 1.6) * 2 + LOGO_SLOT + 8
);
const _chromeBeforeShrink = Math.max(
  _padBeforeShrink * 2 + LOGO_SLOT + 6,
  Math.round(_buttonChromeTall * 0.5)
);
const BUTTON_CHROME_MIN_HEIGHT = Math.max(
  BUTTON_PADDING_V * 2 + LOGO_SLOT + 4,
  Math.round(_chromeBeforeShrink * 0.9)
);

const AI_EXPLAINER_PROMPT =
  'Explain briefly the concept behind "Homework For Life" by Matthew Dicks, how I can start doing it, and why people say doing it daily can change my life.';

const CHATGPT_URL = `https://chatgpt.com/?hints=search&q=${encodeURIComponent(AI_EXPLAINER_PROMPT)}`;
const CLAUDE_URL = `https://claude.ai/new?q=${encodeURIComponent(AI_EXPLAINER_PROMPT)}`;

const OPENAI_LOGO = require("@/assets/ask-ai/openai.png");
const CLAUDE_LOGO = require("@/assets/ask-ai/claude.png");

async function copyPromptAndOpen(url: string) {
  try {
    await Clipboard.setStringAsync(AI_EXPLAINER_PROMPT);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Linking.openURL(url);
  } catch {
    Alert.alert(
      "Copied to clipboard",
      "We couldn’t open the link. Paste the prompt into ChatGPT or Claude manually."
    );
  }
}

function AskButton({
  label,
  iconSource,
  onPress,
  logoScale = 1,
}: {
  label: string;
  iconSource: ImageSourcePropType;
  onPress: () => void;
  /** Claude artwork reads larger in the same box; scale down to match OpenAI visually */
  logoScale?: number;
}) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      {/* Chrome on View — Pressable alone can omit bg/border in some RN layouts */}
      <View
        style={{
          width: "100%",
          minHeight: BUTTON_CHROME_MIN_HEIGHT,
          borderRadius: BUTTON_RADIUS,
          borderWidth: BUTTON_BORDER,
          borderColor: INK,
          backgroundColor: BUTTON_BG,
          overflow: "hidden",
          justifyContent: "center",
        }}
      >
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={label}
          android_ripple={{ color: "rgba(0,0,0,0.08)" }}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: BUTTON_PADDING_V,
            paddingHorizontal: 10,
            width: "100%",
            opacity: pressed ? 0.88 : 1,
          })}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              maxWidth: "100%",
              gap: 8,
            }}
          >
            <View
              style={{
                width: LOGO_SLOT,
                height: LOGO_SLOT,
                flexShrink: 0,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Image
                source={iconSource}
                style={{
                  width: LOGO_SLOT,
                  height: LOGO_SLOT,
                  transform: [{ scale: logoScale }],
                }}
                contentFit="contain"
              />
            </View>
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 14,
                color: INK,
                flexShrink: 1,
              }}
              numberOfLines={1}
            >
              {label}
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

export function AskAiExplainerCard() {
  return (
    <View
      style={{
        alignSelf: "stretch",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: INK,
        backgroundColor: CARD_BG,
        padding: 20,
        paddingBottom: 22,
        marginBottom: 8,
      }}
    >
      <Text
        style={{
          fontFamily: "LibreBaskerville-Bold",
          fontSize: 20,
          lineHeight: 26,
          color: INK,
          textAlign: "center",
        }}
      >
        Still not sure?
      </Text>
      <Text
        style={{
          fontFamily: "Roboto-Regular",
          fontSize: 14,
          lineHeight: 20,
          color: INK,
          textAlign: "center",
          marginTop: 10,
          paddingHorizontal: 4,
        }}
      >
        Tap to ask your favorite chat assistant for more info
      </Text>

      <View
        style={{
          flexDirection: "row",
          alignItems: "stretch",
          width: "100%",
          gap: 10,
          marginTop: 18,
        }}
      >
        <AskButton
          label="Ask ChatGPT"
          iconSource={OPENAI_LOGO}
          onPress={() => copyPromptAndOpen(CHATGPT_URL)}
        />
        <AskButton
          label="Ask Claude"
          iconSource={CLAUDE_LOGO}
          logoScale={0.88}
          onPress={() => copyPromptAndOpen(CLAUDE_URL)}
        />
      </View>
    </View>
  );
}
