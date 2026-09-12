import { useMemo } from "react";
import { View } from "react-native";
import { DayAssetPreview } from "@/components/capture/DayAssetPreview";
import {
  selectedPhoto,
  type MagicFillDraft,
} from "@/store/magicFillStore";

const THUMB = 72;
const COLLAGE_W = 280;
const COLLAGE_H = 168;

/** Staggered positions for 1–6 thumbnails in the collage area. */
const COLLAGE_SLOTS: Array<{
  left: number;
  top: number;
  rotate: string;
  zIndex: number;
}> = [
  { left: 104, top: 48, rotate: "-4deg", zIndex: 3 },
  { left: 36, top: 28, rotate: "6deg", zIndex: 2 },
  { left: 168, top: 20, rotate: "-7deg", zIndex: 4 },
  { left: 64, top: 88, rotate: "5deg", zIndex: 1 },
  { left: 148, top: 82, rotate: "-5deg", zIndex: 5 },
  { left: 108, top: 8, rotate: "3deg", zIndex: 2 },
];

type MagicFillMomentCollageProps = {
  drafts: MagicFillDraft[];
  borderColor: string;
  backgroundColor?: string;
  marginBottom?: number;
};

export function MagicFillMomentCollage({
  drafts,
  borderColor,
  backgroundColor = "rgba(255,255,255,0.08)",
  marginBottom = 32,
}: MagicFillMomentCollageProps) {
  const thumbs = useMemo(
    () =>
      drafts
        .map((d) => selectedPhoto(d))
        .filter((p): p is NonNullable<typeof p> => p != null)
        .slice(0, COLLAGE_SLOTS.length),
    [drafts]
  );

  if (thumbs.length === 0) return null;

  return (
    <View
      style={{
        width: COLLAGE_W,
        height: COLLAGE_H,
        alignSelf: "center",
        marginBottom,
      }}
    >
      {thumbs.map((asset, i) => {
        const slot = COLLAGE_SLOTS[i] ?? COLLAGE_SLOTS[0];
        return (
          <View
            key={`${asset.id}-${i}`}
            style={{
              position: "absolute",
              left: slot.left,
              top: slot.top,
              width: THUMB,
              height: THUMB,
              borderRadius: 12,
              overflow: "hidden",
              borderWidth: 2,
              borderColor,
              backgroundColor,
              transform: [{ rotate: slot.rotate }],
              zIndex: slot.zIndex,
            }}
          >
            <DayAssetPreview asset={asset} animate={false} />
          </View>
        );
      })}
    </View>
  );
}
