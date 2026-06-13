import { format, subDays } from "date-fns";
import {
  queryCameraPhotosForLocalDay,
  type MediaAsset,
} from "@/hooks/useMediaLibrary";

export type OnboardingFirstCaptureTarget = {
  targetDate: Date;
  targetYmd: string;
  todayPhotoCount: number;
  /** Weekday label when falling back off today, e.g. "Tuesday". */
  fallbackDayLabel: string | null;
  earliestAsset: MediaAsset | null;
};

/**
 * Pick the calendar day (and earliest library asset) for a brand-new user's
 * first capture in the main app.
 */
export async function resolveOnboardingFirstCaptureTarget(): Promise<OnboardingFirstCaptureTarget> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayPhotos = await queryCameraPhotosForLocalDay(today, {
    lightweight: true,
  });
  if (todayPhotos.length > 0) {
    return {
      targetDate: today,
      targetYmd: format(today, "yyyy-MM-dd"),
      todayPhotoCount: todayPhotos.length,
      fallbackDayLabel: null,
      earliestAsset: todayPhotos[0] ?? null,
    };
  }

  for (let offset = 1; offset <= 21; offset++) {
    const d = subDays(today, offset);
    const photos = await queryCameraPhotosForLocalDay(d, { lightweight: true });
    if (photos.length > 0) {
      return {
        targetDate: d,
        targetYmd: format(d, "yyyy-MM-dd"),
        todayPhotoCount: 0,
        fallbackDayLabel: format(d, "EEEE"),
        earliestAsset: photos[0] ?? null,
      };
    }
  }

  return {
    targetDate: today,
    targetYmd: format(today, "yyyy-MM-dd"),
    todayPhotoCount: 0,
    fallbackDayLabel: null,
    earliestAsset: null,
  };
}
