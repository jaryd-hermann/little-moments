import { useTheme } from "@/hooks/useTheme";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

/**
 * What people say, on the sign-in screen.
 *
 * A quote reads as more credible when a phrase of it is picked out, so each one
 * carries its own emphasis rather than being set in a single weight.
 */
interface Review {
  parts: { text: string; bold?: boolean }[];
  name: string;
}

const REVIEWS: Review[] = [
  {
    parts: [
      {
        text: "Honestly the only journaling app I've stuck with just because it's quick every day. ",
      },
      { text: "It feels too easy but seeing it grow over time is really cool.", bold: true },
    ],
    name: "Joseph",
  },
  {
    parts: [
      {
        text: "I've always taken so many photos and they just sit in my camera roll and I forget, but ",
      },
      { text: "I love how this app brings them back to me.", bold: true },
    ],
    name: "Allison",
  },
  {
    parts: [
      { text: "This has become something I really look forward to! ", bold: true },
      {
        text: "I'm always walking around thinking \u201Cwhat should I make my little moment today?\u201D Crazy it's free!",
      },
    ],
    name: "Rose",
  },
  {
    parts: [
      {
        text: "I'd been using this for like 3 months and just found out all my moments were being connected in this graph/map thing. ",
      },
      { text: "It's like a visual of how my life connects, SO COOL!", bold: true },
    ],
    name: "Lucy",
  },
  {
    parts: [
      { text: "I love the movies the app makes of my moments, and the chapters. " },
      { text: "I share them with my family back home", bold: true },
      { text: " so they can see what's going on with me and they love it.", bold: false },
    ],
    name: "Patrick",
  },
];

/**
 * Space held back either side of the settled card, and the gap between cards.
 *
 * Set as a width rather than as a share of one, because what matters is that the
 * next card actually shows through — that sliver is what says these can be
 * swiped, without having to tell anyone. A ratio left roughly a gap's worth of
 * peek, and the neighbour's scale-down then pulled its edge in by about as much
 * again, so nothing showed at all. Everything left over goes to the card, which
 * keeps it wide, and so short.
 */
const SIDE_PEEK = 52;
const CARD_GAP = 12;

/**
 * Copies of the list laid end to end. Three, so there's always a full run either
 * side of where the user is: they scroll within the middle one and get silently
 * put back after each swipe, which is what makes the run feel endless.
 */
const LOOP_COPIES = 3;

export function ReviewCarousel() {
  const { width: screenWidth } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const scrollX = useSharedValue(0);
  const scrollRef = useRef<React.ComponentRef<typeof Animated.ScrollView>>(null);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });

  /*
    Run edge to edge, out past the padding of whatever screen this sits on. The
    padding would otherwise come off the peek at both ends, and there isn't
    enough of it to spare; pulled out to the full width, that padding becomes
    part of what the neighbouring cards show through.
  */
  const bleed = width > 0 ? Math.max(0, Math.round((screenWidth - width) / 2)) : 0;
  const track = width > 0 ? width + bleed * 2 : 0;

  const cardWidth = Math.max(0, track - SIDE_PEEK * 2);
  const snap = cardWidth + CARD_GAP;
  // Keeps the settled card centred, with the neighbours peeking either side.
  const sidePad = SIDE_PEEK;
  /** One full pass through the reviews, in scroll offset. */
  const span = REVIEWS.length * snap;

  const looped = useMemo(
    () => Array.from({ length: LOOP_COPIES }, () => REVIEWS).flat(),
    []
  );

  // Open on the middle copy so there's somewhere to go in both directions.
  useEffect(() => {
    if (width === 0) return;
    scrollRef.current?.scrollTo({ x: span, y: 0, animated: false });
  }, [width, span]);

  /*
    Once a swipe settles, jump by exactly one pass if we've left the middle copy.
    The card on screen is identical either side of the jump, so nothing moves as
    far as the user can tell — they just never reach an end.
  */
  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (span === 0) return;
      const x = e.nativeEvent.contentOffset.x;
      if (x < span) {
        scrollRef.current?.scrollTo({ x: x + span, y: 0, animated: false });
      } else if (x >= span * 2) {
        scrollRef.current?.scrollTo({ x: x - span, y: 0, animated: false });
      }
    },
    [span]
  );

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={snap}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          onScroll={onScroll}
          onMomentumScrollEnd={onMomentumEnd}
          contentOffset={{ x: span, y: 0 }}
          scrollEventThrottle={16}
          style={{ marginHorizontal: -bleed }}
          contentContainerStyle={{
            paddingHorizontal: sidePad,
            gap: CARD_GAP,
          }}
        >
          {looped.map((review, i) => (
            <ReviewCard
              key={`${review.name}-${i}`}
              review={review}
              index={i}
              position={i % REVIEWS.length}
              scrollX={scrollX}
              cardWidth={cardWidth}
              snap={snap}
            />
          ))}
        </Animated.ScrollView>
      ) : null}
    </View>
  );
}

function ReviewCard({
  review,
  index,
  position,
  scrollX,
  cardWidth,
  snap,
}: {
  review: Review;
  /** Where this card sits in the looped run — what the scroll offset is measured against. */
  index: number;
  /** Which of the five reviews this is, for the dots. */
  position: number;
  scrollX: SharedValue<number>;
  cardWidth: number;
  snap: number;
}) {
  const { colors } = useTheme();

  /*
    Whichever card is settled sits forward; the ones either side hold back,
    smaller and dimmer, so the edge of the next one reads as out of focus rather
    than as a second thing competing for attention.
  */
  const animated = useAnimatedStyle(() => {
    const distance = Math.min(Math.abs(scrollX.value - index * snap) / snap, 1);
    return {
      opacity: interpolate(distance, [0, 1], [1, 0.55]),
      // Only slightly smaller: the shrink pulls the neighbour's near edge away
      // from the screen, and there's only a sliver of it showing to begin with.
      transform: [{ scale: interpolate(distance, [0, 1], [1, 0.95]) }],
    };
  });

  return (
    <Animated.View style={[{ width: cardWidth }, animated]}>
      {/*
        Filled with the screen colour and outlined rather than raised on white:
        these sit behind the sign-in buttons, so they should recede. No shadow
        for the same reason — nothing to cast one against a matching background.
      */}
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          borderWidth: 2,
          borderColor: colors.border,
          borderRadius: 22,
          paddingVertical: 22,
          paddingHorizontal: 20,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ReviewLoveIcon size={34} color={colors.text} />

        <Text
          style={{
            marginTop: 16,
            fontFamily: "Roboto-Regular",
            fontSize: 15,
            lineHeight: 23,
            color: colors.text,
            textAlign: "center",
          }}
        >
          {review.parts.map((part, i) => (
            <Text
              key={i}
              style={part.bold ? { fontFamily: "Roboto-Bold" } : undefined}
            >
              {part.text}
            </Text>
          ))}
        </Text>

        <View
          style={{
            width: 44,
            height: 1,
            backgroundColor: colors.border,
            marginTop: 16,
            marginBottom: 12,
          }}
        />

        <Text
          style={{
            fontFamily: "Roboto-Bold",
            fontSize: 15,
            color: colors.text,
            textAlign: "center",
          }}
        >
          {review.name}
        </Text>

        {/*
          The dots live in the card, so each one only has to know its own place in
          the five — no need to work it back out of the scroll offset, which the
          looping would have made a moving target anyway.
        */}
        <View style={{ flexDirection: "row", gap: 6, marginTop: 12 }}>
          {REVIEWS.map((r, i) => (
            <View
              key={r.name}
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: colors.text,
                opacity: i === position ? 1 : 0.25,
              }}
            />
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

/**
 * Speech bubble with a heart in it — the mark on each review card.
 *
 * Drawn rather than shipped as a bitmap for the same reason as the Magic Fill
 * icons: it's a stroked vector, so the colour is a prop and it follows the theme
 * instead of needing a `tintColor` over a fixed-colour PNG. The source strokes
 * are 13 on a 1200 canvas, which is a hairline at this size, so the weight here
 * is set for the size it actually renders at.
 */
function ReviewLoveIcon({ size, color }: { size: number; color: string }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="180 59 960 960"
      fill="none"
      stroke={color}
      strokeWidth={64}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M320 330 C 470 314, 740 312, 866 326 C 926 334, 946 372, 950 430 C 956 508, 954 590, 944 652 C 936 700, 902 726, 848 730 C 762 738, 660 740, 578 736" />
      <Path d="M578 736 C 540 792, 494 836, 442 866 C 456 820, 462 780, 460 734" />
      <Path d="M460 734 C 416 732, 372 728, 336 722 C 288 714, 262 684, 256 632 C 248 566, 248 494, 258 428 C 266 372, 286 336, 320 330" />
      {/* The two lines of writing, and the heart beside them. */}
      <Path d="M340 470 C 430 460, 540 462, 618 468" />
      <Path d="M338 548 C 408 540, 490 542, 554 548" />
      <Path d="M690 560 C 682 512, 736 486, 774 518 C 806 484, 862 506, 858 554 C 854 606, 792 646, 776 660 C 758 648, 698 612, 690 560" />
      <Path d="M962 262 C 966 246, 968 230, 966 212" />
      <Path d="M884 284 C 872 272, 862 258, 854 242" />
      <Path d="M1036 280 C 1048 266, 1058 250, 1064 232" />
    </Svg>
  );
}
