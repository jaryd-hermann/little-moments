import { Text } from "react-native";

const PIN = "\u{1F4CC}"; // 📌 pushpin

type ThumbtackIconProps = {
  size?: number;
  /** Unused for emoji; kept for call-site compatibility. */
  color?: string;
  /** Pinned uses full opacity; unpinned slightly lighter. */
  weight: "solid" | "regular";
};

export function ThumbtackIcon({
  size = 20,
  weight,
}: ThumbtackIconProps) {
  return (
    <Text
      style={{
        fontSize: size,
        lineHeight: Math.round(size * 1.15),
        opacity: weight === "solid" ? 1 : 0.55,
      }}
      accessibilityLabel={weight === "solid" ? "Pinned" : "Not pinned"}
    >
      {PIN}
    </Text>
  );
}
