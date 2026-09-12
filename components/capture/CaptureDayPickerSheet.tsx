import type { ComponentProps } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { format } from "date-fns";
import { usePostHog } from "posthog-react-native";
import { useTheme } from "@/hooks/useTheme";
import { bevelShadow, PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";
import { launchMagicFill } from "@/lib/magicFillLaunch";
import { MagicFillPeachPillButton } from "@/components/magic-fill/MagicFillPeachPillButton";

export interface DayPickerRow {
  /** yyyy-MM-dd */
  ymd: string;
  titleLine: string;
  subtitle: string;
  hasMoment: boolean;
  isDefaultRow: boolean;
  /** Camera-roll count for that local day; null while loading. */
  photoCount: number | null;
}

interface CaptureDayPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  rows: DayPickerRow[];
  selectedYmd: string;
  onSelectYmd: (ymd: string) => void;
  /**
   * When true, days that already have a moment cannot be selected (e.g. Capture
   * another → pick a fresh day only).
   */
  disableDaysWithMoments?: boolean;
  /**
   * Optional primary CTA pinned to the bottom of the sheet. Lets the user
   * bypass the day list when the relevant action is "stay on this day"
   * (e.g. capturing another moment for the day they're already on).
   */
  primaryAction?: {
    label: string;
    onPress: () => void;
    iconName?: ComponentProps<typeof Ionicons>["name"];
  };
  /** Share of the current year captured so far, for the sticky footer bar. */
  yearProgress?: { year: number; ratio: number };
  /**
   * Unlogged days with photos waiting. Above
   * {@link MAGIC_FILL_CTA_MIN_GAP} the footer offers Magic Fill, since picking
   * days one at a time is the slow way out of a gap that size.
   */
  magicFillGapCount?: number | null;
}

/** Gap size (in days) beyond which the footer surfaces the Magic Fill CTA. */
const MAGIC_FILL_CTA_MIN_GAP = 3;

const PROGRESS_BG = "#024F46";
const PROGRESS_ACCENT = "#F0D7FF";

/** Slim year-progress bar sized for the sheet's sticky footer. */
function YearProgressStrip({
  year,
  ratio,
}: {
  year: number;
  ratio: number;
}) {
  const { colors } = useTheme();
  const clamped = Math.max(0, Math.min(1, ratio));
  const pct = Math.round(clamped * 100);

  return (
    <View style={{ gap: 6 }}>
      <Text
        style={{
          fontFamily: "Roboto-Medium",
          fontSize: 12,
          color: colors.textSecondary,
        }}
      >
        You&apos;ve captured {pct}% of {year}
      </Text>
      <View
        style={{
          height: 10,
          borderRadius: 5,
          overflow: "hidden",
          backgroundColor: colors.surfaceSecondary,
          borderWidth: 1,
          borderColor: colors.borderLight,
        }}
      >
        <View
          style={{
            height: "100%",
            // Keep a sliver visible at 0% so the bar reads as a bar.
            width: `${Math.max(pct, 2)}%`,
            borderRadius: 5,
            backgroundColor: pct > 0 ? PROGRESS_BG : PROGRESS_ACCENT,
          }}
        />
      </View>
    </View>
  );
}

export function CaptureDayPickerSheet({
  visible,
  onClose,
  rows,
  selectedYmd,
  onSelectYmd,
  disableDaysWithMoments = false,
  primaryAction,
  yearProgress,
  magicFillGapCount,
}: CaptureDayPickerSheetProps) {
  const { colors, theme } = useTheme();
  const posthog = usePostHog();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();

  const showMagicFillCta =
    (magicFillGapCount ?? 0) > MAGIC_FILL_CTA_MIN_GAP;
  const showFooter = Boolean(yearProgress) || showMagicFillCta;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.4)",
          justifyContent: "flex-end",
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            maxHeight: screenH * 0.88,
            backgroundColor: colors.background,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingBottom: Math.max(insets.bottom, 16),
          }}
        >
          <View
            style={{
              alignItems: "center",
              paddingTop: 10,
              paddingBottom: 6,
            }}
          >
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.border,
              }}
            />
          </View>
          <Text
            style={{
              fontFamily: "PMGothicLudington-Text110",
              fontSize: 26,
              color: colors.text,
              paddingHorizontal: 20,
              marginTop: 8,
              marginBottom: 12,
            }}
          >
            Capture a moment for…
          </Text>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{ flexGrow: 0, flexShrink: 1 }}
            contentContainerStyle={{
              paddingHorizontal: 12,
              paddingBottom: primaryAction ? 8 : 0,
            }}
          >
            {rows.map((row, i) => {
              const selected = row.ymd === selectedYmd;
              const blocked =
                disableDaysWithMoments && row.hasMoment;
              return (
                <Pressable
                  key={row.ymd}
                  disabled={blocked}
                  onPress={() => {
                    if (blocked) return;
                    onSelectYmd(row.ymd);
                    onClose();
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 14,
                    paddingHorizontal: 12,
                    marginBottom: i === rows.length - 1 ? 0 : 4,
                    borderRadius: 14,
                    opacity: blocked ? 0.45 : 1,
                    backgroundColor: selected
                      ? theme === "dark"
                        ? "rgba(230, 216, 242, 0.15)"
                        : "#EFE6F7"
                      : "transparent",
                  }}
                >
                  <View style={{ width: 32, alignItems: "center" }}>
                    {row.hasMoment ? (
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          backgroundColor: colors.text,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons name="checkmark" size={14} color={colors.background} />
                      </View>
                    ) : (
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          borderWidth: 2,
                          borderColor: colors.border,
                        }}
                      />
                    )}
                  </View>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "Roboto-Medium",
                          fontSize: 17,
                          color: colors.text,
                        }}
                      >
                        {row.titleLine}
                      </Text>
                      {row.photoCount !== null ? (
                        <View
                          style={{
                            backgroundColor: colors.surfaceSecondary,
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: colors.borderLight,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: "Roboto-Medium",
                              fontSize: 11,
                              color: colors.textSecondary,
                            }}
                          >
                            {row.photoCount === 0
                              ? row.ymd === format(new Date(), "yyyy-MM-dd")
                                ? "No photos today"
                                : "No photos"
                              : `${row.photoCount} photo${row.photoCount === 1 ? "" : "s"}`}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text
                      style={{
                        fontFamily: "Roboto-Regular",
                        fontSize: 13,
                        color: colors.textMuted,
                        marginTop: 2,
                      }}
                    >
                      {row.subtitle}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.textMuted}
                  />
                </Pressable>
              );
            })}
          </ScrollView>
          {primaryAction ? (
            <View
              style={{
                paddingHorizontal: 16,
                paddingTop: 12,
                paddingBottom: 4,
                borderTopWidth: 1,
                borderTopColor: colors.border,
                backgroundColor: colors.background,
              }}
            >
              <Pressable
                onPress={primaryAction.onPress}
                accessibilityRole="button"
                accessibilityLabel={primaryAction.label}
                style={{
                  height: 56,
                  borderRadius: 9999,
                  backgroundColor: colors.primary,
                  borderWidth: 2,
                  borderColor: PINK_CTA_BORDER,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  ...bevelShadow(theme),
                }}
              >
                {primaryAction.iconName ? (
                  <Ionicons
                    name={primaryAction.iconName}
                    size={18}
                    color={PINK_CTA_INK}
                  />
                ) : null}
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 15,
                    color: PINK_CTA_INK,
                    letterSpacing: 0.8,
                    textTransform: "uppercase",
                  }}
                  numberOfLines={1}
                >
                  {primaryAction.label}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {showFooter ? (
            <View
              style={{
                paddingHorizontal: 20,
                paddingTop: 12,
                gap: 12,
                borderTopWidth: primaryAction ? 0 : 1,
                borderTopColor: colors.border,
                backgroundColor: colors.background,
              }}
            >
              {showMagicFillCta ? (
                <View style={{ gap: 8 }}>
                  <Text
                    style={{
                      fontFamily: "Roboto-Regular",
                      fontSize: 13,
                      lineHeight: 18,
                      color: colors.textSecondary,
                    }}
                  >
                    {magicFillGapCount} days are waiting with photos — fill them
                    in one go instead of picking days one by one.
                  </Text>
                  <MagicFillPeachPillButton
                    label="✦ Magic fill"
                    fullWidth
                    onPress={() => {
                      posthog?.capture("magic_fill_entry_tapped", {
                        source: "day_picker_footer",
                        gap_count: magicFillGapCount ?? 0,
                      });
                      onClose();
                      launchMagicFill("day_picker_footer");
                    }}
                  />
                </View>
              ) : null}

              {yearProgress ? (
                <YearProgressStrip
                  year={yearProgress.year}
                  ratio={yearProgress.ratio}
                />
              ) : null}
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
