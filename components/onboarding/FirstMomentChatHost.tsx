import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { usePostHog } from "posthog-react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/store/authStore";
import { useEntries } from "@/hooks/useEntries";
import { useEntryStore, type Entry } from "@/store/entryStore";
import { EllieMessage } from "@/components/ellie/EllieMessage";
import { ThinkingDots } from "@/components/dig-deeper/ThinkingDots";
import { EntryMediaImage } from "@/components/common/EntryMediaImage";
import { EntryRow } from "@/components/memories/EntryRow";
import { CoreMemoryIcon } from "@/components/common/CoreMemoryIcon";
import { LocationTag } from "@/components/common/LocationTag";
import {
  momentTitleStyle,
  photoCardBorder,
  PHOTO_CARD_BORDER_WIDTH,
} from "@/lib/momentTypography";
import {
  MAGIC_FILL_PILL_FILL,
  MAGIC_FILL_PILL_INK,
} from "@/components/magic-fill/MagicFillPill";
import { notifyLifecycleEvent } from "@/lib/lifecycleEvent";
import { setFirstCaptureHandoff } from "@/lib/onboardingHandoff";
import type { MediaAsset } from "@/hooks/useMediaLibrary";
import {
  FavoritesPickCarousel,
  useFavoritePickAssets,
} from "@/components/onboarding/FavoritesPickCarousel";
import { DayAssetPreview } from "@/components/capture/DayAssetPreview";
import { MagicFillDatePill } from "@/components/magic-fill/MagicFillDatePill";
import {
  REMEMBER_MOST_OPTIONS,
  rememberMostOption,
  rememberMostReply,
  syncRememberMostToProfile,
  type RememberMostChoice,
  type RememberMostOption,
} from "@/lib/rememberMost";
import { bevelShadow, PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";
import {
  useFirstMomentChatStore,
  type ChatScriptDraft,
  type ChatTurn,
  type FirstMomentChatStep,
} from "@/store/firstMomentChatStore";

const JARYD_AVATAR = require("@/assets/images/jaryd.png");
/** How long Jaryd "types" before each message lands. */
const TYPING_MS = 1100;
/** Duration of the core-memory celebration, icon pulse and screen glow alike. */
const CELEBRATION_MS = 2000;

function previewText(html: string): string {
  const plain = html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "";
  const m = plain.match(/^[\s\S]*?[.!?](?=\s|$)/);
  return (m?.[0] ?? plain).trim();
}

/**
 * The card's core-memory toggle, sat in the image's top-right corner exactly
 * where `EntryPinToggle` sits on the real card. Pulses along with the screen
 * glow when `celebrate` flips, to draw the eye to the icon they just earned.
 */
function CoreMemoryBadge({
  active,
  celebrate,
  onPress,
}: {
  active: boolean;
  celebrate: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (!celebrate) return;
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 300, easing: Easing.in(Easing.quad) })
      ),
      3,
      false
    );
  }, [celebrate, pulse]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: pulse.value * 0.6,
    transform: [{ scale: 1 + pulse.value * 0.55 }],
  }));
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.28 }],
  }));

  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={active ? "Core memory" : "Mark as core memory"}
      style={{ position: "absolute", top: 12, right: 12, zIndex: 2 }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: -10,
            left: -10,
            right: -10,
            bottom: -10,
            borderRadius: 9999,
            backgroundColor: colors.primary,
          },
          haloStyle,
        ]}
      />
      <Animated.View style={iconStyle}>
        <CoreMemoryIcon size={28} active={active} />
      </Animated.View>
    </Pressable>
  );
}

/** Warm full-screen wash celebrating the first core memory. Purely decorative. */
function CoreCelebrationGlow() {
  const { colors } = useTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withSequence(
      withTiming(1, { duration: 320 }),
      withDelay(1100, withTiming(0, { duration: 580 }))
    );
  }, [progress]);

  const style = useAnimatedStyle(() => ({ opacity: progress.value * 0.22 }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: colors.primary,
        },
        style,
      ]}
    />
  );
}

/** Capture's Dig Deeper pill, reproduced so the carousel cards read the same. */
function DigDeeperButton({ onPress }: { onPress: () => void }) {
  const { colors, theme } = useTheme();
  return (
    <Pressable
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel="Dig deeper on this moment"
      style={{
        marginTop: 14,
        height: 48,
        borderRadius: 9999,
        borderWidth: 1.5,
        borderColor: colors.text,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
      }}
    >
      <Image
        source={
          theme === "dark"
            ? require("@/assets/images/white-icon.png")
            : require("@/assets/images/icon.png")
        }
        style={{ width: 20, height: 20, borderRadius: 5 }}
      />
      <Text
        style={{
          fontFamily: "Roboto-Medium",
          fontSize: 13,
          color: colors.text,
          letterSpacing: 0.5,
          textTransform: "uppercase",
        }}
      >
        Dig deeper
      </Text>
    </Pressable>
  );
}

/**
 * Moment card matching the saved-moment card on Capture after posting —
 * square image up top, title and body beneath. The core-memory toggle and the
 * Dig Deeper pill are opt-in, so each step shows only the one it's teaching.
 */
function MomentCard({
  entry,
  width,
  core,
  onDigDeeper,
}: {
  entry: Entry;
  width?: number;
  core?: { celebrate: boolean; onPress: () => void };
  onDigDeeper?: () => void;
}) {
  const { colors } = useTheme();
  const media = entry.media?.[0] ?? null;

  return (
    <View
      style={{
        width,
        borderRadius: 16,
        ...photoCardBorder(colors.text),
        backgroundColor: colors.surface,
        overflow: "hidden",
      }}
    >
      {media ? (
        <View style={{ position: "relative" }}>
          <EntryMediaImage
            media={media}
            style={{ width: "100%", aspectRatio: 1 }}
            recyclingKey={media.id}
            showLoadingShimmer={false}
          />
          {media.location_name ? (
            <View style={{ position: "absolute", left: 12, bottom: 12 }}>
              <LocationTag name={media.location_name} variant="overlay" />
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={{ padding: 16, paddingBottom: 14 }}>
        {entry.title ? (
          <Text
            style={momentTitleStyle({
              fontSize: 16,
              color: colors.text,
              marginBottom: 6,
            })}
          >
            {entry.title}
          </Text>
        ) : null}
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 14,
            lineHeight: 22,
            color: colors.textSecondary,
          }}
          numberOfLines={media ? 2 : 4}
          ellipsizeMode="tail"
        >
          {previewText(entry.body)}
        </Text>
        {onDigDeeper ? <DigDeeperButton onPress={onDigDeeper} /> : null}
      </View>
      {core ? (
        <CoreMemoryBadge
          active={entry.is_pinned ?? false}
          celebrate={core.celebrate}
          onPress={core.onPress}
        />
      ) : null}
    </View>
  );
}

/**
 * The "pick a moment" carousel, matching Capture's day carousel — full-width
 * paged cards, each with its own Dig Deeper pill.
 */
function MomentPickCarousel({
  entries,
  onDigDeeper,
}: {
  entries: Entry[];
  onDigDeeper: (entry: Entry) => void;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = screenWidth - 40;

  return (
    <View style={{ marginHorizontal: -20, marginTop: 14 }}>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20 }}
        snapToInterval={cardWidth + 12}
        decelerationRate="fast"
        renderItem={({ item, index }) => (
          <View
            style={{
              marginRight: index < entries.length - 1 ? 12 : 0,
            }}
          >
            <MomentCard
              entry={item}
              width={cardWidth}
              onDigDeeper={() => onDigDeeper(item)}
            />
          </View>
        )}
      />
    </View>
  );
}

/**
 * The chosen moment, shown the way Capture shows a pinned photo — same square
 * card, same gold date pill, same shuffle control in the corner. Jaryd's next
 * message sits underneath in place of Ellie's, so the first capture teaches the
 * layout the user will see every day after this.
 */
function PickedMomentCard({
  asset,
  onShuffle,
}: {
  asset: MediaAsset;
  onShuffle?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Animated.View
      entering={FadeIn.duration(280)}
      style={{
        marginTop: 14,
        borderRadius: 16,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceSecondary,
      }}
    >
      {/*
        The square lives on the wrapper, as it does in `PromptCard`:
        `DayAssetPreview` fills its parent with `height: "100%"`, which would
        override an `aspectRatio` passed through its own style.
      */}
      <View style={{ width: "100%", aspectRatio: 1 }}>
        <DayAssetPreview asset={asset} animate />
      </View>
      <View style={{ position: "absolute", top: 12, left: 12 }}>
        <MagicFillDatePill date={new Date(asset.creationTime)} />
      </View>
      {onShuffle ? (
        <Pressable
          onPress={onShuffle}
          accessibilityRole="button"
          accessibilityLabel="Shuffle to another photo"
          hitSlop={8}
          style={{
            position: "absolute",
            bottom: 12,
            right: 12,
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: "rgba(0,0,0,0.55)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="shuffle" size={20} color="#FFFFFF" />
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

/** Dark ink for the pastel option tints, which are light in both themes. */
const REMEMBER_INK = "#1A1A1A";
/**
 * The option cards are always white because the art they end on is, so the fill,
 * ink and stroke are all fixed rather than following the theme.
 */
const REMEMBER_CARD_FILL = "#FFFFFF";
/** Every option's art is 1389 × 813. */
const REMEMBER_ART_RATIO = 1389 / 813;
/** Card padding, and so also what the art has to back out of to run full width. */
const REMEMBER_CARD_PAD = 16;

function RememberOptionCard({
  option,
  width,
  chosen,
  onPress,
}: {
  option: RememberMostOption;
  width: number;
  chosen?: boolean;
  onPress?: () => void;
}) {
  const position = REMEMBER_MOST_OPTIONS.indexOf(option) + 1;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={option.label}
      style={{
        width,
        borderRadius: 16,
        ...photoCardBorder(REMEMBER_INK),
        backgroundColor: REMEMBER_CARD_FILL,
        // Clips the art to the rounded bottom corners it now runs into.
        overflow: "hidden",
        // No bottom padding: the art finishes the card.
        paddingTop: REMEMBER_CARD_PAD,
        paddingHorizontal: REMEMBER_CARD_PAD,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View
          style={{
            backgroundColor: option.tint,
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 3,
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 12,
              color: REMEMBER_INK,
            }}
          >
            {position}/{REMEMBER_MOST_OPTIONS.length}
          </Text>
        </View>
        {chosen ? (
          <Ionicons name="checkmark-circle" size={22} color={REMEMBER_INK} />
        ) : null}
      </View>
      <Text
        style={{
          fontFamily: "PMGothicLudington-Text110",
          fontSize: 22,
          lineHeight: 28,
          color: REMEMBER_INK,
          marginTop: 12,
        }}
      >
        {option.label}
      </Text>
      <View
        style={{
          marginTop: 14,
          /*
            Full bleed to both sides and the bottom edge. Stated outright rather
            than stretched with a negative margin on each side: `aspectRatio`
            makes the stretch unreliable, which left a gap down the right.
          */
          marginLeft: -REMEMBER_CARD_PAD,
          width: width - PHOTO_CARD_BORDER_WIDTH * 2,
          // The art's own ratio, so running it full width crops nothing.
          aspectRatio: REMEMBER_ART_RATIO,
          backgroundColor: option.tint,
        }}
      >
        <Image
          source={option.image}
          style={{ width: "100%", height: "100%" }}
          resizeMode="cover"
        />
      </View>
    </Pressable>
  );
}

/** Circular pager arrow, matching the deck's stroke weight. */
function PagerArrow({
  direction,
  onPress,
  disabled,
}: {
  direction: "prev" | "next";
  onPress: () => void;
  disabled: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={direction === "prev" ? "Previous option" : "Next option"}
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.surface,
        borderWidth: 1.5,
        borderColor: colors.text,
        opacity: disabled ? 0.3 : 1,
      }}
    >
      <Ionicons
        name={direction === "prev" ? "chevron-back" : "chevron-forward"}
        size={20}
        color={colors.text}
      />
    </Pressable>
  );
}

/**
 * The closing question's options as a swipeable deck. Tapping a card commits
 * it, as does the CTA for whichever card is showing. Once they've answered it
 * collapses to just their pick, so the transcript keeps the receipt without
 * still looking answerable.
 */
function RememberMostCarousel({
  choice,
  onSelect,
  onSkip,
}: {
  choice: RememberMostChoice | null;
  onSelect: (option: RememberMostOption) => void;
  onSkip: () => void;
}) {
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = screenWidth - 40;
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<RememberMostOption>>(null);

  const clampIndex = (i: number) =>
    Math.max(0, Math.min(REMEMBER_MOST_OPTIONS.length - 1, i));

  const goTo = (next: number) => {
    const clamped = clampIndex(next);
    setIndex(clamped);
    listRef.current?.scrollToIndex({ index: clamped, animated: true });
  };

  if (choice === "skipped") return null;

  if (choice) {
    const picked = rememberMostOption(choice);
    if (!picked) return null;
    return (
      <Animated.View entering={FadeIn.duration(280)} style={{ marginTop: 14 }}>
        <RememberOptionCard option={picked} width={cardWidth} chosen />
      </Animated.View>
    );
  }

  const current = REMEMBER_MOST_OPTIONS[index];

  return (
    <Animated.View entering={FadeIn.duration(280)} style={{ marginTop: 14 }}>
      <View style={{ marginHorizontal: -20 }}>
        <FlatList
          ref={listRef}
          data={REMEMBER_MOST_OPTIONS}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20 }}
          snapToInterval={cardWidth + 12}
          decelerationRate="fast"
          onMomentumScrollEnd={(e) =>
            // Clamped because the bounce past either end overshoots the range.
            setIndex(
              clampIndex(
                Math.round(e.nativeEvent.contentOffset.x / (cardWidth + 12))
              )
            )
          }
          getItemLayout={(_, i) => ({
            length: cardWidth + 12,
            offset: (cardWidth + 12) * i,
            index: i,
          })}
          renderItem={({ item, index: i }) => (
            <View
              style={{
                marginRight: i < REMEMBER_MOST_OPTIONS.length - 1 ? 12 : 0,
              }}
            >
              <RememberOptionCard
                option={item}
                width={cardWidth}
                onPress={() => onSelect(item)}
              />
            </View>
          )}
        />
        <View
          style={{
            position: "absolute",
            left: 4,
            right: 4,
            top: "50%",
            marginTop: -18,
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <PagerArrow
            direction="prev"
            onPress={() => goTo(index - 1)}
            disabled={index === 0}
          />
          <PagerArrow
            direction="next"
            onPress={() => goTo(index + 1)}
            disabled={index === REMEMBER_MOST_OPTIONS.length - 1}
          />
        </View>
      </View>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          gap: 6,
          marginTop: 14,
        }}
      >
        {REMEMBER_MOST_OPTIONS.map((option, i) => (
          <View
            key={option.id}
            style={{
              width: i === index ? 18 : 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: i === index ? colors.text : colors.border,
            }}
          />
        ))}
      </View>

      <ChatButton
        label="I want to remember this"
        onPress={() => onSelect(current)}
      />
      <Pressable
        onPress={onSkip}
        accessibilityRole="button"
        accessibilityLabel="I don't know, skip this"
        style={{ alignSelf: "center", paddingVertical: 12, paddingHorizontal: 16 }}
      >
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 13,
            color: colors.textSecondary,
            textDecorationLine: "underline",
          }}
        >
          I don&apos;t know, skip this
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/**
 * Magic Fill's haul, as the Capsule list rows — compact enough to show a
 * handful at once. Display-only: `EntryRow` navigates to the moment on tap,
 * which would strand the user behind this modal.
 */
function MomentListPreview({ entries }: { entries: Entry[] }) {
  return (
    <View pointerEvents="none" style={{ marginTop: 14, gap: 4 }}>
      {entries.map((entry) => (
        <EntryRow key={entry.id} entry={entry} />
      ))}
    </View>
  );
}

/** Marks a moment as one they took through Dig Deeper — the button's own mark. */
function DigDeeperBadge() {
  return (
    <Image
      source={require("@/assets/images/icon2.png")}
      style={{ width: 26, height: 26, borderRadius: 6 }}
    />
  );
}

/**
 * Receipt for something they just did to a moment: it in list-row shape,
 * outlined and badged, so the action has something to show for it.
 */
function MomentReceiptCard({
  entry,
  badge,
}: {
  entry: Entry;
  badge: ReactNode;
}) {
  const { colors } = useTheme();
  const media = entry.media?.[0] ?? null;
  const sentence = previewText(entry.body);

  return (
    <Animated.View
      entering={FadeIn.duration(280)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginTop: 14,
        padding: 10,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: colors.text,
        backgroundColor: colors.surface,
      }}
    >
      {media ? (
        <EntryMediaImage
          media={media}
          style={{
            width: 52,
            height: 52,
            borderRadius: 8,
            backgroundColor: colors.surfaceSecondary,
          }}
          recyclingKey={media.id}
          showLoadingShimmer={false}
        />
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        {entry.title ? (
          <Text
            style={momentTitleStyle({ fontSize: 15, color: colors.text })}
            numberOfLines={1}
          >
            {entry.title}
          </Text>
        ) : null}
        {sentence ? (
          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 12,
              color: colors.textSecondary,
              marginTop: 2,
            }}
            numberOfLines={1}
          >
            {sentence}
          </Text>
        ) : null}
      </View>
      {badge}
    </Animated.View>
  );
}

/** The user's own side of the conversation. */
function UserBubble({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={{ alignItems: "flex-end", marginTop: 14, marginBottom: 2 }}
    >
      <View
        style={{
          maxWidth: "85%",
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: 18,
          borderBottomRightRadius: 6,
          backgroundColor: colors.surfaceSecondary,
          borderWidth: 1,
          borderColor: colors.borderLight,
        }}
      >
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 14,
            lineHeight: 21,
            color: colors.text,
          }}
        >
          {text}
        </Text>
      </View>
    </Animated.View>
  );
}

function ChatButton({
  label,
  onPress,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  /** `magicFill` borrows the peach fill from `MagicFillPill`. */
  variant?: "primary" | "secondary" | "magicFill";
}) {
  const { colors, theme } = useTheme();
  const isSecondary = variant === "secondary";
  const isMagicFill = variant === "magicFill";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        height: isSecondary ? 46 : 52,
        borderRadius: 9999,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 20,
        marginTop: 10,
        backgroundColor: isSecondary
          ? "transparent"
          : isMagicFill
            ? MAGIC_FILL_PILL_FILL
            : colors.primary,
        borderWidth: isSecondary ? 1 : 2,
        borderColor: isSecondary
          ? colors.border
          : isMagicFill
            ? "#000000"
            : PINK_CTA_BORDER,
        ...(isSecondary ? null : bevelShadow(theme)),
      }}
    >
      <Text
        style={{
          fontFamily: "Roboto-Medium",
          fontSize: 14,
          color: isSecondary
            ? colors.text
            : isMagicFill
              ? MAGIC_FILL_PILL_INK
              : PINK_CTA_INK,
          letterSpacing: isSecondary ? 0 : 0.6,
          textTransform: isSecondary ? "none" : "uppercase",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const MAGIC_FILL_PITCH =
  "You have one moment so far, we've made it really easy and quick to catch up and capture other moments.\n\nIt's called **Magic Fill**—it's really fun. Do you have 2 minutes to capture a few of your favorite photos? We'll grab them from your favorites!";

const DIG_DEEPER_PITCH =
  "Something that a lot of people have truly loved about Little Moments is we help you remember more, adding to your moments and making richer stories. It's called **Dig Deeper**, do you want to give it a try?";

/**
 * Navigating out of here needs the modal gone first. Pushing while it's still
 * on screen leaves the user sitting in the chat with the push swallowed.
 */
function navigateAfterModalDismiss(go: () => void) {
  setTimeout(go, 350);
}

/**
 * Chat-style onboarding shown once, right after the user's very first moment.
 * Replaces the old five-step coachmark tour: rather than pointing at chrome,
 * Jaryd walks them through making the moment a core memory and then offers
 * Magic Fill.
 *
 * Closing it — by finishing, skipping or tapping X — marks the chat complete
 * for good and hands off to the paywall.
 */
export function FirstMomentChatHost() {
  const { colors } = useTheme();
  const posthog = usePostHog();
  const { editEntry } = useEntries();

  const visible = useFirstMomentChatStore((s) => s.visible);
  const entryId = useFirstMomentChatStore((s) => s.entryId);
  const step = useFirstMomentChatStore((s) => s.step);
  const setStep = useFirstMomentChatStore((s) => s.setStep);
  const handOffToMagicFill = useFirstMomentChatStore(
    (s) => s.handOffToMagicFill
  );
  const closeChat = useFirstMomentChatStore((s) => s.close);
  const awaitingMagicFillReturn = useFirstMomentChatStore(
    (s) => s.awaitingMagicFillReturn
  );
  const handOffToDigDeeper = useFirstMomentChatStore(
    (s) => s.handOffToDigDeeper
  );
  const awaitingDigDeeperReturn = useFirstMomentChatStore(
    (s) => s.awaitingDigDeeperReturn
  );
  const returnFromDigDeeper = useFirstMomentChatStore(
    (s) => s.returnFromDigDeeper
  );
  const abandonMagicFill = useFirstMomentChatStore((s) => s.abandonMagicFill);
  const momentIdsBeforeMagicFill = useFirstMomentChatStore(
    (s) => s.momentIdsBeforeMagicFill
  );
  const digDeeperEntryId = useFirstMomentChatStore((s) => s.digDeeperEntryId);
  const completed = useFirstMomentChatStore((s) => s.completed);
  const startBeforeCapture = useFirstMomentChatStore(
    (s) => s.startBeforeCapture
  );
  const declinedBeforeCapture = useFirstMomentChatStore(
    (s) => s.declinedBeforeCapture
  );
  const awaitingFirstCaptureReturn = useFirstMomentChatStore(
    (s) => s.awaitingFirstCaptureReturn
  );
  const handOffToFirstCapture = useFirstMomentChatStore(
    (s) => s.handOffToFirstCapture
  );
  /** Their pick, held until they say how they want to caption it. */
  const pickedAsset = useFirstMomentChatStore((s) => s.pickedAsset);
  const setPickedAsset = useFirstMomentChatStore((s) => s.setPickedAsset);
  const exitBeforeCapture = useFirstMomentChatStore(
    (s) => s.exitBeforeCapture
  );
  const rememberChoice = useFirstMomentChatStore((s) => s.rememberChoice);
  const setRememberChoice = useFirstMomentChatStore(
    (s) => s.setRememberChoice
  );
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const subscriptionStatus = useAuthStore((s) => s.profile?.subscription_status);
  const onboardingCompleted = useAuthStore(
    (s) => s.profile?.onboarding_completed
  );
  const profileMomentCount = useAuthStore((s) => s.profile?.total_moments);
  const scrollRef = useRef<ScrollView>(null);

  /** Drives the icon pulse and screen glow right after they tap. */
  const [celebrating, setCelebrating] = useState(false);

  /** Transcript and queue live in the store so a remount can't lose them. */
  const turns = useFirstMomentChatStore((s) => s.turns);
  const pending = useFirstMomentChatStore((s) => s.pending);
  const pushTurn = useFirstMomentChatStore((s) => s.pushTurn);
  const advanceQueue = useFirstMomentChatStore((s) => s.advanceQueue);
  const enqueue = useFirstMomentChatStore((s) => s.enqueue);
  /**
   * Jaryd is typing whenever the head of the queue is one of his lines. Derived
   * rather than tracked as state, because the queue is shared: returning from
   * Magic Fill briefly leaves two mounts of this host draining it, and whichever
   * one loses the race would keep a local flag set forever — dots on screen and
   * the step's reply buttons suppressed behind them.
   */
  const queueHead = pending[0];
  const typing = Boolean(queueHead && "text" in queueHead);

  const onboardingEntry = useEntryStore((s) =>
    entryId ? (s.entries.find((e) => e.id === entryId) ?? null) : null
  );
  const isCore = onboardingEntry?.is_pinned ?? false;

  const allEntries = useEntryStore((s) => s.entries);
  /** Their moments, newest first — what the Dig Deeper carousel offers. */
  const pickableEntries = useMemo(
    () =>
      allEntries
        .filter((e) => e.entry_type === "moment")
        .slice()
        .sort((a, b) => (b.entry_date ?? "").localeCompare(a.entry_date ?? "")),
    [allEntries]
  );

  /** Whatever Magic Fill added while we were away. */
  const magicFillNewEntryIds = useMemo(() => {
    if (momentIdsBeforeMagicFill.length === 0) return [];
    const before = new Set(momentIdsBeforeMagicFill);
    return pickableEntries
      .filter((e) => !before.has(e.id))
      .map((e) => e.id);
  }, [pickableEntries, momentIdsBeforeMagicFill]);

  // Dig Deeper exits the same way whether they finished or bailed, so the
  // enhanced body it writes back is the only trustworthy "they did it" signal.
  const digDeeperCompleted = useMemo(() => {
    if (!digDeeperEntryId) return false;
    return (
      allEntries.find((e) => e.id === digDeeperEntryId)?.is_ai_enhanced ?? false
    );
  }, [allEntries, digDeeperEntryId]);

  /** Jaryd's lines (and attachments) for a step, in order. */
  const scriptFor = useCallback(
    (target: FirstMomentChatStep): ChatScriptDraft[] => {
      switch (target) {
        case "capturePick":
          return [
            {
              text: "**Let's capture your first little moment.** Pick one of your favorites to start. By the way, nothing leaves your phone.",
            },
            { turn: { role: "capturePick" } },
          ];
        case "captureCaption":
          return [
            {
              text: "Now you'll have 60 seconds to caption it—what was going on, how did you feel, what do you remember? Add as much or little as you like.",
            },
          ];
        case "intro":
          return [
            {
              text: "You can make any moment a **core memory**. Core memories are easily searchable and can become part of your annual print book if you want it.\n\nDo you want to make this a core memory?",
            },
          ];
        case "coreSaved":
          return [
            {
              text: "Amazing, glad this one was special. **Saved as a core memory.**",
            },
            ...(entryId
              ? [{ turn: { role: "coreMemoryCard" as const, entryId } }]
              : []),
            { text: MAGIC_FILL_PITCH },
          ];
        case "coreSkipped":
          return [
            {
              text: "No problem — you can make any moment core later, whenever it feels right.",
            },
            { text: MAGIC_FILL_PITCH },
          ];
        case "digDeeperOffer": {
          const items: ChatScriptDraft[] = [];
          const added = magicFillNewEntryIds.length;
          if (added > 0) {
            items.push({
              text: `Woah, you just saved **${added}** more ${added === 1 ? "moment" : "moments"}. You can use this feature anytime to capture people, places, times, or just quick catchup.`,
            });
            items.push({
              turn: { role: "momentList", entryIds: magicFillNewEntryIds },
            });
          }
          items.push({ text: DIG_DEEPER_PITCH });
          return items;
        }
        case "digDeeperPick":
          return [
            {
              text: "This will be fun I promise. Pick one of your moments to try it with.",
            },
            { turn: { role: "digDeeperPick" } },
          ];
        case "outro": {
          const items: ChatScriptDraft[] = [];
          if (digDeeperCompleted) {
            items.push({
              text: "You just turned a moment into a deeper story. You're building a real keep sake.",
            });
            if (digDeeperEntryId) {
              items.push({
                turn: { role: "digDeeperCard", entryId: digDeeperEntryId },
              });
            }
          }
          items.push({
            text: "As you add more moments, watch them come together in your **Capsule**, as personalized **Chapters**, and even **Connections**. You can also share moments with people.",
          });
          items.push({
            text: "I just have one last question, in using Little Moments, **what do you want to remember most?**",
          });
          items.push({ turn: { role: "rememberPick" } });
          return items;
        }
        case "rememberAnswered":
          return [
            { text: rememberMostReply(rememberChoice ?? "skipped") },
            {
              text: "Oh, and I'm **Jaryd** (I made Little Moments) and I hope you enjoy it. If you ever have any issues or feedback, you can find me at the bottom of the screen.",
            },
          ];
      }
    },
    [
      magicFillNewEntryIds,
      digDeeperCompleted,
      digDeeperEntryId,
      entryId,
      rememberChoice,
    ]
  );

  // Queue each step's lines exactly once, however we arrive at it. `enqueue`
  // owns the already-narrated check so it survives a remount too.
  useEffect(() => {
    if (!visible) return;
    enqueue(scriptFor(step), step);
  }, [visible, step, scriptFor, enqueue]);

  // Drain the queue one beat at a time: Jaryd types, then the line lands.
  useEffect(() => {
    if (pending.length === 0) return;
    const next = pending[0];

    if ("turn" in next) {
      advanceQueue(next.id, next.turn);
      return;
    }

    const timer = setTimeout(() => {
      advanceQueue(next.id, { role: "jaryd", text: next.text });
    }, TYPING_MS);
    return () => clearTimeout(timer);
  }, [pending, advanceQueue]);

  // First run into the app after onboarding, with nothing captured yet: open
  // on the picker rather than leaving them to find their way around Capture.
  // Gated on the profile's count, not the local entry store, because that store
  // is empty until it hydrates and would briefly look like a new account.
  useEffect(() => {
    if (!onboardingCompleted || (profileMomentCount ?? 0) > 0) return;
    if (completed || visible || declinedBeforeCapture) return;
    if (awaitingFirstCaptureReturn) return;
    startBeforeCapture();
  }, [
    onboardingCompleted,
    profileMomentCount,
    completed,
    visible,
    declinedBeforeCapture,
    awaitingFirstCaptureReturn,
    startBeforeCapture,
  ]);

  useEffect(() => {
    if (!visible) return;
    posthog.capture("onboarding_chat_step_viewed", { step });
  }, [visible, step, posthog]);

  // "User views onboarding chat" — once per run, not once per reopen.
  const viewReported = useRef(false);
  useEffect(() => {
    if (!visible || viewReported.current) return;
    viewReported.current = true;
    posthog.capture("onboarding_chat_viewed");
  }, [visible, posthog]);

  const magicFillReported = useRef(false);
  useEffect(() => {
    if (!visible || magicFillReported.current) return;
    if (magicFillNewEntryIds.length === 0) return;
    magicFillReported.current = true;
    posthog.capture("onboarding_magic_fill_done", {
      moments_added: magicFillNewEntryIds.length,
    });
  }, [visible, magicFillNewEntryIds, posthog]);

  const digDeeperReported = useRef(false);
  useEffect(() => {
    if (!visible || digDeeperReported.current || !digDeeperCompleted) return;
    digDeeperReported.current = true;
    posthog.capture("onboarding_dig_deeper_done", {
      entry_id: digDeeperEntryId,
    });
  }, [visible, digDeeperCompleted, digDeeperEntryId, posthog]);

  // Magic Fill's success screen returns us explicitly, but a user who backs
  // out of it would otherwise be stranded mid-conversation with the flag still
  // set. Reopening once we're back on a tab route covers both exits.
  // Magic Fill's success screen calls `returnFromMagicFill` itself, which is
  // the only way we learn they finished. Getting here instead means they left
  // without saving, so the offer goes back on the table rather than the
  // conversation moving on as though they'd used it.
  const sawMagicFill = useRef(false);
  useEffect(() => {
    if (!awaitingMagicFillReturn) {
      sawMagicFill.current = false;
      return;
    }
    if (pathname.startsWith("/magic-fill")) {
      sawMagicFill.current = true;
      return;
    }
    if (visible || !sawMagicFill.current) return;
    abandonMagicFill();
  }, [awaitingMagicFillReturn, visible, pathname, abandonMagicFill]);

  // Dig Deeper has no completion screen to call us back from — it always
  // exits with `router.back()` — so leaving the route is our only signal, and
  // it covers finishing and backing out alike. Waiting until we've actually
  // seen the route matters: without it, the gap between hiding this modal and
  // the push landing reads as an immediate return and the trip never happens.
  const sawDigDeeper = useRef(false);
  useEffect(() => {
    if (!awaitingDigDeeperReturn) {
      sawDigDeeper.current = false;
      return;
    }
    if (pathname.startsWith("/dig-deeper")) {
      sawDigDeeper.current = true;
      return;
    }
    if (visible || !sawDigDeeper.current) return;
    returnFromDigDeeper();
  }, [awaitingDigDeeperReturn, visible, pathname, returnFromDigDeeper]);

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    const t = setTimeout(
      () => scrollRef.current?.scrollToEnd({ animated: true }),
      80
    );
    return () => clearTimeout(t);
  }, [turns.length, typing]);

  const advanceTo = useCallback(
    (next: FirstMomentChatStep) => {
      setStep(next);
    },
    [setStep]
  );

  /** Record the user's side of the exchange before acting on it. */
  const respond = useCallback(
    (label: string) => {
      pushTurn({ role: "user", text: label });
    },
    [pushTurn]
  );

  /** Close for good, then hand off to the paywall. */
  const finish = useCallback(
    (reason: "completed" | "dismissed") => {
      posthog.capture(
        reason === "completed"
          ? "onboarding_chat_finished"
          : "onboarding_chat_exited",
        { step }
      );
      closeChat();
      if (subscriptionStatus !== "active" && subscriptionStatus !== "trial") {
        // Let the modal finish dismissing before pushing the paywall over it.
        setTimeout(() => router.push("/paywall"), 450);
      }
    },
    [posthog, step, closeChat, subscriptionStatus]
  );

  // Reached from the reply button and from the card's own icon, so it records
  // the user's turn itself rather than leaving that to the button.
  const makeCoreMemory = useCallback(() => {
    if (!entryId || isCore) return;
    respond("Yes, make this one a core memory");
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Deliberately not `EntryPinToggle`: that fires the Core Memory toaster,
    // which would cover the chat's own celebration message.
    void editEntry(entryId, { is_pinned: true });
    void notifyLifecycleEvent("first_pin");
    posthog.capture("onboarding_core_memory_done", { entry_id: entryId });
    setCelebrating(true);
    advanceTo("coreSaved");
  }, [entryId, isCore, editEntry, posthog, advanceTo, respond]);

  useEffect(() => {
    if (!celebrating) return;
    const t = setTimeout(() => setCelebrating(false), CELEBRATION_MS + 100);
    return () => clearTimeout(t);
  }, [celebrating]);

  const startMagicFill = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    posthog.capture("magic_fill_entry_tapped", {
      source: "first_moment_chat",
    });
    handOffToMagicFill(pickableEntries.map((e) => e.id));
    // Straight into the Favorites flow — the mode chooser would be noise when
    // we've already told them we'll grab their favourites.
    navigateAfterModalDismiss(() =>
      router.push("/magic-fill?source=first_moment_chat&mode=favorites")
    );
  }, [posthog, handOffToMagicFill, pickableEntries]);

  const startDigDeeper = useCallback(
    (entry: Entry) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      handOffToDigDeeper(entry.id);
      navigateAfterModalDismiss(() =>
        router.push({
          pathname: "/dig-deeper",
          params: {
            entryId: entry.id,
            title: entry.title ?? "",
            body: entry.body ?? "",
            photoUri: entry.media?.[0]?.storage_url ?? "",
          },
        })
      );
    },
    [handOffToDigDeeper]
  );

  /**
   * With one moment there's nothing to choose between, so go straight in.
   * More than one means Magic Fill ran, so let them pick.
   */
  const acceptDigDeeper = useCallback(() => {
    if (pickableEntries.length > 1) {
      advanceTo("digDeeperPick");
      return;
    }
    const only = pickableEntries[0] ?? onboardingEntry;
    if (only) startDigDeeper(only);
    else advanceTo("outro");
  }, [pickableEntries, onboardingEntry, startDigDeeper, advanceTo]);

  /** Shortlist for the picker, and the pool the shuffle control cycles through. */
  const beforeCapture = step === "capturePick" || step === "captureCaption";
  const { assets: pickAssets, source: pickSource } = useFavoritePickAssets(
    visible && beforeCapture && !entryId
  );
  /** Nothing in the library to offer — surfaces a way out instead of a dead end. */
  const pickerEmpty = pickAssets !== null && pickAssets.length === 0;

  /**
   * Bail out before any moment exists. Resets rather than completes, so the
   * classic "capture on Capture, then chat" path still works for them.
   */
  const leaveBeforeCapture = useCallback(
    (reason: "dismissed" | "no_media") => {
      posthog.capture("onboarding_chat_exited", {
        step,
        before_capture: true,
        reason,
      });
      exitBeforeCapture();
    },
    [posthog, step, exitBeforeCapture]
  );

  // No reply bubble here: the card itself becomes the record of their choice,
  // exactly as the pinned photo does on Capture.
  const choosePickedMoment = useCallback(
    (asset: MediaAsset) => {
      setPickedAsset(asset);
      posthog.capture("onboarding_chat_moment_picked", {
        source: pickSource,
        media_type: asset.mediaType,
      });
      advanceTo("captureCaption");
    },
    [pickSource, posthog, advanceTo, setPickedAsset]
  );

  /** Capture's shuffle: swap to the next candidate, no picker round-trip. */
  const shufflePickedMoment = useCallback(() => {
    if (!pickedAsset || !pickAssets || pickAssets.length < 2) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const at = pickAssets.findIndex((a) => a.id === pickedAsset.id);
    setPickedAsset(pickAssets[(at + 1) % pickAssets.length]);
    posthog.capture("onboarding_chat_moment_shuffled");
  }, [pickedAsset, pickAssets, setPickedAsset, posthog]);

  /**
   * Off to Capture with the pick and the input method. The chat can't caption
   * or save on its own — that's the Ellie flow, the video trim editor and the
   * whole save pipeline — so it hands over and reopens when the moment lands.
   */
  const startCaptioning = useCallback(
    (method: "speaking" | "typing") => {
      if (!pickedAsset) return;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      posthog.capture("onboarding_chat_caption_started", {
        input_method: method,
        media_type: pickedAsset.mediaType,
      });
      setFirstCaptureHandoff({ asset: pickedAsset, method });
      // Capture picks this up off the store flag. No push: it's the route
      // underneath us already, so dismissing the modal is the whole transition.
      handOffToFirstCapture();
    },
    [pickedAsset, posthog, handOffToFirstCapture]
  );

  const chooseRememberMost = useCallback(
    (option: RememberMostOption) => {
      if (rememberChoice) return;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      respond(option.label);
      posthog.capture("onboarding_remember_most_selected", {
        choice: option.id,
      });
      void syncRememberMostToProfile(option.id);
      setRememberChoice(option.id);
      advanceTo("rememberAnswered");
    },
    [rememberChoice, respond, posthog, setRememberChoice, advanceTo]
  );

  const skipRememberMost = useCallback(() => {
    if (rememberChoice) return;
    respond("I don't know, skip this");
    posthog.capture("onboarding_remember_most_skipped");
    setRememberChoice("skipped");
    advanceTo("rememberAnswered");
  }, [rememberChoice, respond, posthog, setRememberChoice, advanceTo]);

  const say = (content: string) => (
    <EllieMessage
      content={content}
      showAvatar
      avatarSource={JARYD_AVATAR}
      avatarRounded
    />
  );

  const renderTurn = (turn: ChatTurn) => {
    switch (turn.role) {
      case "jaryd":
        return (
          <Animated.View
            key={turn.key}
            entering={FadeIn.duration(280)}
            style={{ marginTop: 16 }}
          >
            {say(turn.text)}
          </Animated.View>
        );
      case "user":
        return <UserBubble key={turn.key} text={turn.text} />;
      case "momentList": {
        const rows = turn.entryIds
          .map((id) => allEntries.find((e) => e.id === id))
          .filter((e): e is Entry => Boolean(e));
        return <MomentListPreview key={turn.key} entries={rows} />;
      }
      case "coreMemoryCard": {
        const entry = allEntries.find((e) => e.id === turn.entryId);
        return entry ? (
          <MomentReceiptCard
            key={turn.key}
            entry={entry}
            badge={<CoreMemoryIcon size={26} active />}
          />
        ) : null;
      }
      case "digDeeperCard": {
        const entry = allEntries.find((e) => e.id === turn.entryId);
        return entry ? (
          <MomentReceiptCard
            key={turn.key}
            entry={entry}
            badge={<DigDeeperBadge />}
          />
        ) : null;
      }
      case "digDeeperPick":
        return (
          <MomentPickCarousel
            key={turn.key}
            entries={pickableEntries}
            onDigDeeper={(entry) => {
              respond("Let's try this one");
              startDigDeeper(entry);
            }}
          />
        );
      case "capturePick":
        // Once the moment is saved, the card pinned at the top of the chat is
        // the better record, so this beat retires.
        if (entryId) return null;
        return pickedAsset ? (
          <PickedMomentCard
            key={turn.key}
            asset={pickedAsset}
            onShuffle={
              (pickAssets?.length ?? 0) > 1 ? shufflePickedMoment : undefined
            }
          />
        ) : (
          <FavoritesPickCarousel
            key={turn.key}
            assets={pickAssets}
            onChoose={choosePickedMoment}
          />
        );
      case "rememberPick":
        return (
          <RememberMostCarousel
            key={turn.key}
            choice={rememberChoice}
            onSelect={chooseRememberMost}
            onSkip={skipRememberMost}
          />
        );
    }
  };

  /** A reply button that also drops the user's answer into the transcript. */
  const reply = (
    label: string,
    onPress: () => void,
    variant: "primary" | "secondary" | "magicFill" = "primary"
  ) => (
    <ChatButton
      label={label}
      variant={variant}
      onPress={() => {
        respond(label);
        onPress();
      }}
    />
  );

  /** Only the current step's buttons, and only once its lines have landed. */
  const renderChoices = () => {
    if (pending.length > 0) return null;
    switch (step) {
      case "capturePick":
        // The carousel's "Choose this moment" is the choice at this step. The
        // escape hatch only appears if we found nothing to offer.
        return pickerEmpty ? (
          <ChatButton
            label="Let me capture my own way"
            onPress={() => leaveBeforeCapture("no_media")}
          />
        ) : null;
      case "captureCaption":
        return (
          <>
            {reply("Start speaking", () => startCaptioning("speaking"))}
            {reply("Start typing", () => startCaptioning("typing"), "secondary")}
          </>
        );
      case "intro":
        return (
          <>
            {/* `makeCoreMemory` records the reply itself — see its comment. */}
            <ChatButton
              label="Yes, make this one a core memory"
              onPress={makeCoreMemory}
            />
            {reply("Not this one", () => advanceTo("coreSkipped"), "secondary")}
          </>
        );
      case "coreSaved":
      case "coreSkipped":
        return (
          <>
            {reply("Sure, I'll try Magic Fill", startMagicFill, "magicFill")}
            {reply("Not now", () => advanceTo("digDeeperOffer"), "secondary")}
          </>
        );
      case "digDeeperOffer":
        return (
          <>
            {reply("Sure, I'll try Dig Deeper", acceptDigDeeper)}
            {reply("Not now", () => advanceTo("outro"), "secondary")}
          </>
        );
      case "digDeeperPick":
        // The carousel's own Dig Deeper pills are the choice at this step.
        return null;
      case "outro":
        // The remember-most deck carries its own CTA and skip link.
        return null;
      case "rememberAnswered":
        return (
          <ChatButton
            label="Explore Little Moments"
            onPress={() => finish("completed")}
          />
        );
    }
  };

  // Before the first moment exists there's nothing to complete and no paywall
  // to hand off to — backing out just returns them to Capture.
  const dismiss = () =>
    beforeCapture ? leaveBeforeCapture("dismissed") : finish("dismissed");

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={dismiss}>
      {/*
        Explicit inset padding rather than `SafeAreaView`: this content lives
        in a `Modal`, whose separate native view hierarchy doesn't pick up the
        safe area, so the headline collided with the status bar.
      */}
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          paddingTop: Math.max(insets.top, 20),
          paddingBottom: insets.bottom,
        }}
      >
        <View style={{ alignItems: "flex-end", paddingHorizontal: 16 }}>
          <Pressable
            onPress={dismiss}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={{ padding: 8 }}
          >
            <Ionicons name="close" size={26} color={colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: 40,
          }}
          showsVerticalScrollIndicator={false}
        >
          <Text
            style={{
              fontFamily: "PMGothicLudington-Text110",
              fontSize: 28,
              lineHeight: 34,
              color: colors.text,
              marginBottom: 16,
            }}
          >
            {onboardingEntry
              ? "Nice! This is your first little moment!"
              : "Welcome to Little Moments"}
          </Text>

          {onboardingEntry ? (
            <Animated.View
              entering={FadeInDown.duration(420)}
              style={{ marginBottom: 8 }}
            >
              <MomentCard
                entry={onboardingEntry}
                core={{ celebrate: celebrating, onPress: makeCoreMemory }}
              />
            </Animated.View>
          ) : null}

          {turns.map(renderTurn)}
          {typing ? (
            <View style={{ marginTop: 16 }}>
              <ThinkingDots />
            </View>
          ) : null}
          {renderChoices()}
        </ScrollView>

        {celebrating ? <CoreCelebrationGlow /> : null}
      </View>
    </Modal>
  );
}

/**
 * Opaque screen for the trips out to Magic Fill and Dig Deeper. Both are native
 * modals, so the chat's own `Modal` has to be dismissed before either can
 * present and can't come back until they're gone — without something holding the
 * screen in between, the Capture page is revealed for the length of both
 * animations and invites a stray tap. Mount it after `<Tabs>` so it paints over
 * the tab content.
 */
export function FirstMomentChatHandoffCover() {
  const { colors } = useTheme();
  const covering = useFirstMomentChatStore((s) => s.coveringHandoff);
  const visible = useFirstMomentChatStore((s) => s.visible);
  const away = useFirstMomentChatStore(
    (s) => s.awaitingMagicFillReturn || s.awaitingDigDeeperReturn
  );
  const setCoveringHandoff = useFirstMomentChatStore(
    (s) => s.setCoveringHandoff
  );

  useEffect(() => {
    if (!covering || (!visible && away)) return;
    // Hold past the chat's own slide-in, which would otherwise reveal what we're
    // covering on the way up.
    const t = setTimeout(() => setCoveringHandoff(false), visible ? 520 : 0);
    return () => clearTimeout(t);
  }, [covering, visible, away, setCoveringHandoff]);

  if (!covering) return null;
  // Swallows taps as well: the screen underneath is mid-transition and isn't
  // theirs to act on yet.
  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}
    />
  );
}
