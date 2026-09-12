import { MagicFillBanner } from "@/components/magic-fill/MagicFillBanner";

export type CaptureMagicFillBannerVariant = "first_moment" | "second_moment";

const COPY: Record<
  CaptureMagicFillBannerVariant,
  { title: string; subtitle: string }
> = {
  first_moment: {
    title: "Great job, first moment done!",
    subtitle:
      "Try Magic Fill to capture more recent moments quickly!",
  },
  second_moment: {
    title: "Another one!",
    subtitle:
      "Try Magic Fill to capture more recent moments quickly!",
  },
};

export function resolveCaptureMagicFillBanner(opts: {
  totalMomentCount: number;
  hasCompletedMagicFill: boolean;
  viewingDayHasMoment: boolean;
  /** Dev: bypass completion + moment-count gates when the viewed day has a moment. */
  devForceVariant?: CaptureMagicFillBannerVariant | null;
  devIgnoreCompleted?: boolean;
}): CaptureMagicFillBannerVariant | null {
  if (!opts.viewingDayHasMoment) return null;

  const completed =
    opts.devIgnoreCompleted || opts.devForceVariant
      ? false
      : opts.hasCompletedMagicFill;
  if (completed && !opts.devForceVariant) return null;

  if (opts.devForceVariant) return opts.devForceVariant;

  if (opts.totalMomentCount < 1 || opts.totalMomentCount >= 3) return null;
  return opts.totalMomentCount === 1 ? "first_moment" : "second_moment";
}

export function CaptureMagicFillOnboardingBanner({
  variant,
}: {
  variant: CaptureMagicFillBannerVariant;
}) {
  const copy = COPY[variant];

  return (
    <MagicFillBanner
      source="capture_banner"
      embedded
      prominent
      title={copy.title}
      subtitle={copy.subtitle}
    />
  );
}

export const NOTHING_TODAY_MAGIC_FILL = {
  title: "Nothing today yet",
  subtitle: "Try a Magic Fill to log more life!",
} as const;

export const PAST_DAY_EMPTY_MAGIC_FILL = {
  title: "Magic fill other days",
  subtitle:
    "Find recent days with photos waiting and capture several moments at once.",
} as const;
