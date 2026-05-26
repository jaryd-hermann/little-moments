import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  Platform,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { format, setHours, setMinutes } from "date-fns";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";
import {
  type ReminderSlot,
  REMINDER_SLOT_DEFAULTS,
  inferMorningEveningSlotFromTime,
} from "@/lib/notificationTimeSync";

const SLOT_LABEL: Record<ReminderSlot, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

const DEFAULT_VISIBLE_SLOTS: ReminderSlot[] = [
  "morning",
  "afternoon",
  "evening",
];

function formatHm(hour: number, minute: number): string {
  const d = setMinutes(setHours(new Date(), hour), minute);
  return format(d, "h:mm a");
}

type TimesState = Record<ReminderSlot, { hour: number; minute: number }>;

export interface DailyPromptReminderScheduleProps {
  selectedSlot: ReminderSlot;
  times: TimesState;
  onSelectSlot: (slot: ReminderSlot) => void;
  onChangeTimeForSlot: (slot: ReminderSlot, hour: number, minute: number) => void;
  /** Defaults to morning / afternoon / evening. Settings uses morning / evening only. */
  visibleSlots?: ReminderSlot[];
  /** When set, shows a primary Continue CTA (onboarding). */
  continueLabel?: string;
  onContinue?: () => void;
  continueDisabled?: boolean;
}

export function DailyPromptReminderSchedule({
  selectedSlot,
  times,
  onSelectSlot,
  onChangeTimeForSlot,
  visibleSlots = DEFAULT_VISIBLE_SLOTS,
  continueLabel = "Continue",
  onContinue,
  continueDisabled,
}: DailyPromptReminderScheduleProps) {
  const { colors } = useTheme();
  const [editingSlot, setEditingSlot] = useState<ReminderSlot | null>(null);

  const slots = visibleSlots;

  const editingDate = useMemo(() => {
    if (!editingSlot) return new Date();
    const { hour, minute } = times[editingSlot];
    return setMinutes(setHours(new Date(), hour), minute);
  }, [editingSlot, times]);

  const bumpHour = useCallback(
    (delta: number) => {
      if (!editingSlot) return;
      const { hour, minute } = times[editingSlot];
      const next = (hour + delta + 24) % 24;
      void Haptics.selectionAsync();
      onChangeTimeForSlot(editingSlot, next, minute);
    },
    [editingSlot, times, onChangeTimeForSlot]
  );

  const bumpMinute = useCallback(
    (delta: number) => {
      if (!editingSlot) return;
      const { hour, minute } = times[editingSlot];
      let m = minute + delta;
      let h = hour;
      while (m < 0) {
        m += 60;
        h = (h - 1 + 24) % 24;
      }
      while (m >= 60) {
        m -= 60;
        h = (h + 1) % 24;
      }
      void Haptics.selectionAsync();
      onChangeTimeForSlot(editingSlot, h, m);
    },
    [editingSlot, times, onChangeTimeForSlot]
  );

  const cardStyle = {
    borderRadius: 14,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  } as const;

  return (
    <View style={{ marginTop: 8 }}>
      {slots.map((slot) => {
        const on = selectedSlot === slot;
        const { hour, minute } = times[slot];
        const dimmed = !on;
        return (
          <View key={slot} style={cardStyle}>
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 12,
                color: dimmed ? colors.textMuted : colors.textSecondary,
                marginBottom: 4,
              }}
            >
              {SLOT_LABEL[slot]}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Pressable
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setEditingSlot(slot);
                }}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 17,
                    color: dimmed ? colors.textMuted : colors.text,
                  }}
                >
                  {formatHm(hour, minute)}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={dimmed ? colors.textMuted : colors.textSecondary}
                />
              </Pressable>
              <Switch
                value={on}
                onValueChange={(v) => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  if (v) {
                    onSelectSlot(slot);
                    return;
                  }
                  const idx = slots.indexOf(slot);
                  const next = slots[(idx + 1) % slots.length];
                  onSelectSlot(next);
                }}
                trackColor={{
                  true: colors.primary,
                  false: colors.surfaceSecondary,
                }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>
        );
      })}

      {onContinue ? (
        <Pressable
          onPress={onContinue}
          disabled={continueDisabled}
          style={{
            marginTop: 18,
            height: 52,
            borderRadius: 9999,
            backgroundColor: continueDisabled ? colors.surfaceSecondary : colors.primary,
            borderWidth: 2,
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
            opacity: continueDisabled ? 0.5 : 1,
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 15,
              color: continueDisabled ? colors.textMuted : colors.text,
              letterSpacing: 0.5,
            }}
          >
            {continueLabel}
          </Text>
        </Pressable>
      ) : null}

      <Modal
        visible={editingSlot !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setEditingSlot(null)}
      >
        <Pressable
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0,0,0,0.55)",
          }}
          onPress={() => setEditingSlot(null)}
        >
          <Pressable
            style={{
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              backgroundColor: colors.surface,
              paddingHorizontal: 20,
              paddingTop: 16,
              paddingBottom: Platform.OS === "ios" ? 36 : 24,
            }}
            onPress={() => {}}
          >
            <Text
              style={{
                fontFamily: "LibreBaskerville-Bold",
                fontSize: 18,
                color: colors.text,
                marginBottom: 20,
              }}
            >
              {editingSlot ? `Set ${SLOT_LABEL[editingSlot]} time` : "Set time"}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 24,
                marginBottom: 24,
              }}
            >
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontFamily: "Roboto-Light", fontSize: 12, color: colors.textMuted }}>
                  Hour
                </Text>
                <Pressable onPress={() => bumpHour(1)} style={{ padding: 8 }}>
                  <Ionicons name="chevron-up" size={28} color={colors.text} />
                </Pressable>
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 28,
                    color: colors.text,
                    minWidth: 48,
                    textAlign: "center",
                  }}
                >
                  {format(editingDate, "h")}
                </Text>
                <Pressable onPress={() => bumpHour(-1)} style={{ padding: 8 }}>
                  <Ionicons name="chevron-down" size={28} color={colors.text} />
                </Pressable>
              </View>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontFamily: "Roboto-Light", fontSize: 12, color: colors.textMuted }}>
                  Minute
                </Text>
                <Pressable onPress={() => bumpMinute(5)} style={{ padding: 8 }}>
                  <Ionicons name="chevron-up" size={28} color={colors.text} />
                </Pressable>
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 28,
                    color: colors.text,
                    minWidth: 48,
                    textAlign: "center",
                  }}
                >
                  {format(editingDate, "mm")}
                </Text>
                <Pressable onPress={() => bumpMinute(-5)} style={{ padding: 8 }}>
                  <Ionicons name="chevron-down" size={28} color={colors.text} />
                </Pressable>
              </View>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 12 }}>
              <Pressable
                onPress={() => setEditingSlot(null)}
                style={{
                  paddingVertical: 12,
                  paddingHorizontal: 18,
                }}
              >
                <Text style={{ fontFamily: "Roboto-Medium", fontSize: 15, color: colors.textSecondary }}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setEditingSlot(null);
                }}
                style={{
                  paddingVertical: 12,
                  paddingHorizontal: 22,
                  borderRadius: 9999,
                  backgroundColor: colors.primary,
                }}
              >
                <Text style={{ fontFamily: "Roboto-Medium", fontSize: 15, color: colors.text }}>Done</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export function useReminderScheduleState(
  initialFromSettings?: { hour: number; minute: number },
  options?: {
    captureRhythm?: "morning" | "evening" | null;
  }
) {
  const captureRhythm = options?.captureRhythm;
  const base = initialFromSettings ?? REMINDER_SLOT_DEFAULTS.morning;
  const initialSlot = ((): ReminderSlot => {
    if (captureRhythm === "morning" || captureRhythm === "evening") {
      return captureRhythm;
    }
    return inferMorningEveningSlotFromTime(base.hour, base.minute);
  })();
  const [selectedSlot, setSelectedSlot] = useState<ReminderSlot>(initialSlot);
  const [times, setTimes] = useState<TimesState>(() => ({
    morning: { ...REMINDER_SLOT_DEFAULTS.morning },
    afternoon: { ...REMINDER_SLOT_DEFAULTS.afternoon },
    evening: { ...REMINDER_SLOT_DEFAULTS.evening },
    [initialSlot]: { hour: base.hour, minute: base.minute },
  }));

  useEffect(() => {
    if (!initialFromSettings) return;
    const slot =
      captureRhythm === "morning" || captureRhythm === "evening"
        ? captureRhythm
        : inferMorningEveningSlotFromTime(
            initialFromSettings.hour,
            initialFromSettings.minute
          );
    setSelectedSlot(slot);
    setTimes({
      morning: { ...REMINDER_SLOT_DEFAULTS.morning },
      afternoon: { ...REMINDER_SLOT_DEFAULTS.afternoon },
      evening: { ...REMINDER_SLOT_DEFAULTS.evening },
      [slot]: {
        hour: initialFromSettings.hour,
        minute: initialFromSettings.minute,
      },
    });
  }, [initialFromSettings?.hour, initialFromSettings?.minute, captureRhythm]);

  const selectSlot = useCallback((slot: ReminderSlot) => {
    setSelectedSlot(slot);
  }, []);

  const changeTimeForSlot = useCallback((slot: ReminderSlot, hour: number, minute: number) => {
    setTimes((prev) => ({ ...prev, [slot]: { hour, minute } }));
  }, []);

  return { selectedSlot, times, selectSlot, changeTimeForSlot, setTimes, setSelectedSlot };
}
