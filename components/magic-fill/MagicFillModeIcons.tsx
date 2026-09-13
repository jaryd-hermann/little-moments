import Svg, { Circle, Path, Rect } from "react-native-svg";

/**
 * Line art for the three ways into Magic Fill — favorites, months, you pick.
 *
 * Drawn rather than shipped as bitmaps because these are stroked vectors: as
 * PNGs they'd need a `tintColor` to survive dark mode, and the source art is a
 * 1200px illustration whose strokes come out as hairlines at icon size. Here the
 * stroke colour is just a prop, so each one takes whatever the surface it sits on
 * would have given an Ionicon.
 *
 * Each viewBox is cropped to its own artwork — including half a stroke of margin,
 * or the outermost edges shave off — so `strokeWidth` differs per icon to land
 * them all on the same visual weight, a little under 2pt at the default size,
 * which is where Ionicons' outline set sits.
 */
export interface MagicFillModeIconProps {
  size?: number;
  color: string;
}

const DEFAULT_SIZE = 34;

export function MagicFillFavoriteIcon({
  size = DEFAULT_SIZE,
  color,
}: MagicFillModeIconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="206 144 954 954"
      fill="none"
      stroke={color}
      strokeWidth={47}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* The photo, tilted the way the art has it. */}
      <Rect
        x={280}
        y={300}
        width={560}
        height={640}
        rx={20}
        rotation={-4}
        originX={560}
        originY={620}
      />
      <Rect
        x={336}
        y={356}
        width={448}
        height={440}
        rx={8}
        rotation={-4}
        originX={560}
        originY={576}
      />
      <Circle
        cx={470}
        cy={470}
        r={26}
        rotation={-4}
        originX={560}
        originY={576}
      />
      <Path
        d="M356 730 L490 596 L568 668 L654 566 L760 700"
        rotation={-4}
        originX={560}
        originY={576}
      />
      {/* The heart, and the little burst above it. */}
      <Path d="M830 570 C830 500 900 470 950 512 C1000 470 1070 500 1070 570 C1070 650 970 710 950 726 C930 710 830 650 830 570 Z" />
      <Path d="M980 388 v-52" />
      <Path d="M886 414 l-34 -40" />
      <Path d="M1072 414 l34 -40" />
    </Svg>
  );
}

export function MagicFillMonthIcon({
  size = DEFAULT_SIZE,
  color,
}: MagicFillModeIconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="188 188 824 824"
      fill="none"
      stroke={color}
      strokeWidth={41}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Rect x={240} y={300} width={720} height={640} rx={28} />
      <Path d="M240 456 H960" />
      <Path d="M420 240 v120" />
      <Path d="M780 240 v120" />
      <Path d="M240 618 H960" />
      <Path d="M240 780 H960" />
      <Path d="M420 456 V940" />
      <Path d="M600 456 V940" />
      <Path d="M780 456 V940" />
      {/* The day that's been picked out. */}
      <Circle cx={690} cy={700} r={52} />
    </Svg>
  );
}

export function MagicFillPickIcon({
  size = DEFAULT_SIZE,
  color,
}: MagicFillModeIconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="181 152 920 920"
      fill="none"
      stroke={color}
      strokeWidth={46}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Rect x={230} y={230} width={330} height={330} rx={20} />
      <Path d="M270 500 L360 400 L420 452 L472 396 L522 448" />
      <Rect x={640} y={230} width={330} height={330} rx={20} />
      <Circle cx={740} cy={330} r={24} />
      <Path d="M676 512 L780 408 L866 486 L906 446" />
      <Rect x={230} y={640} width={330} height={330} rx={20} />
      <Path d="M300 880 C300 800 380 760 395 730 C410 760 490 800 490 880" />
      {/* The one they've chosen, ticked. */}
      <Rect x={616} y={616} width={378} height={378} rx={24} />
      <Path d="M668 928 L768 812 L836 872 L892 806 L946 866" />
      <Circle cx={726} cy={716} r={26} />
      <Circle cx={994} cy={616} r={58} />
      <Path d="M966 618 l20 22 40 -46" />
    </Svg>
  );
}
