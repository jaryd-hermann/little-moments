import { MOMENT_VIDEO_CLIP_SEC } from "@/lib/videoClip";
import type { VideoPlayer } from "expo-video";
import { useEffect } from "react";

/**
 * Keep a video player looping within [clipStartSec, clipStartSec + 2s].
 * Used for montage clips, trim previews, and post-capture playback.
 */
export function useTwoSecondVideoLoop(
  player: VideoPlayer | null,
  active: boolean,
  clipStartSec = 0
) {
  useEffect(() => {
    if (!player || !active) return;

    const endSec = clipStartSec + MOMENT_VIDEO_CLIP_SEC;

    const seekStart = () => {
      try {
        player.currentTime = clipStartSec;
        player.play();
      } catch {
        /* player may not be ready */
      }
    };

    try {
      player.timeUpdateEventInterval = 0.25;
    } catch {
      /* ignore */
    }

    seekStart();

    const timeSub = player.addListener("timeUpdate", ({ currentTime }) => {
      if (currentTime >= endSec - 0.05) {
        seekStart();
      }
    });

    const endSub = player.addListener("playToEnd", () => {
      seekStart();
    });

    return () => {
      timeSub.remove();
      endSub.remove();
    };
  }, [player, active, clipStartSec]);
}
