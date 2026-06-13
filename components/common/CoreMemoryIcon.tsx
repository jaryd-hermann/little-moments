import { Image } from "expo-image";

const CORE = require("@/assets/images/core.png");
const CORE_UNTAPPED = require("@/assets/images/core-untapped.png");

type CoreMemoryIconProps = {
  size?: number;
  /** When true, the moment is marked as a core memory. */
  active: boolean;
};

export function CoreMemoryIcon({ size = 28, active }: CoreMemoryIconProps) {
  return (
    <Image
      source={active ? CORE : CORE_UNTAPPED}
      style={{ width: size, height: size }}
      contentFit="contain"
      recyclingKey={active ? "core-active" : "core-inactive"}
      accessibilityLabel={active ? "Core memory" : "Not a core memory"}
    />
  );
}
