import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

type Theme = {
  text: string;
  textSecondary: string;
  textMuted: string;
  surface: string;
  surfaceSecondary: string;
  border: string;
  primary: string;
};

type Preset = "morning" | "afternoon" | "evening" | "custom";

const PRESETS: Record<Exclude<Preset, "custom">, { hour: number; minute: number; label: string }> = {
  morning: { hour: 9, minute: 0, label: "Morning" },
  afternoon: { hour: 13, minute: 0, label: "Afternoon" },
  evening: { hour: 18, minute: 0, label: "Evening" },
};

function matchesPreset(hour: number, minute: number): Preset {
  for (const key of Object.keys(PRESETS) as Array<keyof typeof PRESETS>) {
    const p = PRESETS[key];
    if (p.hour === hour && p.minute === minute) return key;
  }
  return "custom";
}

function formatTime(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? "AM" : "PM";
  const m = minute.toString().padStart(2, "0");
  return `${h12}:${m} ${ampm}`;
}

function clampHour(h: number): number {
  return ((h % 24) + 24) % 24;
}

function clampMinute(m: number): number {
  return ((m % 60) + 60) % 60;
}

export function NotificationTimePicker({
  value,
  onChange,
  colors,
  disabled = false,
}: {
  value: { hour: number; minute: number };
  onChange: (hour: number, minute: number) => void;
  colors: Theme;
  disabled?: boolean;
}) {
  const activePreset = useMemo(
    () => matchesPreset(value.hour, value.minute),
    [value.hour, value.minute]
  );

  const [customExpanded, setCustomExpanded] = useState(activePreset === "custom");

  const handlePreset = (key: Preset) => {
    if (disabled) return;
    if (key === "custom") {
      setCustomExpanded(true);
      return;
    }
    setCustomExpanded(false);
    const p = PRESETS[key];
    onChange(p.hour, p.minute);
  };

  const adjust = (kind: "hour" | "minute", delta: number) => {
    if (disabled) return;
    const h = kind === "hour" ? clampHour(value.hour + delta) : value.hour;
    const m = kind === "minute" ? clampMinute(value.minute + delta) : value.minute;
    onChange(h, m);
  };

  const presetKeys: Preset[] = ["morning", "afternoon", "evening", "custom"];

  return (
    <View style={{ opacity: disabled ? 0.4 : 1 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {presetKeys.map((key) => {
          const isActive = activePreset === key;
          const label =
            key === "custom" ? "Custom" : PRESETS[key as keyof typeof PRESETS].label;
          const subLabel =
            key === "custom"
              ? null
              : formatTime(
                  PRESETS[key as keyof typeof PRESETS].hour,
                  PRESETS[key as keyof typeof PRESETS].minute
                );
          return (
            <Pressable
              key={key}
              onPress={() => handlePreset(key)}
              disabled={disabled}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderRadius: 9999,
                borderWidth: 1.5,
                borderColor: isActive ? colors.primary : colors.border,
                backgroundColor: isActive ? colors.primary + "22" : "transparent",
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Text
                style={{
                  fontFamily: "Roboto-Regular",
                  fontSize: 13,
                  color: colors.text,
                }}
              >
                {label}
              </Text>
              {subLabel ? (
                <Text
                  style={{
                    fontFamily: "Roboto-Light",
                    fontSize: 11,
                    color: colors.textMuted,
                  }}
                >
                  {subLabel}
                </Text>
              ) : null}
              {isActive ? (
                <Ionicons name="checkmark" size={14} color={colors.text} />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {(activePreset === "custom" || customExpanded) && (
        <View
          style={{
            marginTop: 14,
            padding: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceSecondary,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 11,
              color: colors.textMuted,
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            At
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Stepper
              colors={colors}
              label={value.hour.toString().padStart(2, "0")}
              onUp={() => adjust("hour", 1)}
              onDown={() => adjust("hour", -1)}
              disabled={disabled}
            />
            <Text
              style={{
                fontFamily: "Roboto-Regular",
                fontSize: 22,
                color: colors.textMuted,
              }}
            >
              :
            </Text>
            <Stepper
              colors={colors}
              label={value.minute.toString().padStart(2, "0")}
              onUp={() => adjust("minute", 5)}
              onDown={() => adjust("minute", -5)}
              disabled={disabled}
            />
            <Text
              style={{
                fontFamily: "Roboto-Light",
                fontSize: 11,
                color: colors.textMuted,
                width: 28,
                textAlign: "center",
                letterSpacing: 0.5,
              }}
            >
              {value.hour < 12 ? "AM" : "PM"}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

function Stepper({
  colors,
  label,
  onUp,
  onDown,
  disabled,
}: {
  colors: Theme;
  label: string;
  onUp: () => void;
  onDown: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ alignItems: "center", gap: 2 }}>
      <Pressable
        onPress={onUp}
        disabled={disabled}
        hitSlop={8}
        style={{ padding: 2 }}
      >
        <Ionicons name="chevron-up" size={16} color={colors.textSecondary} />
      </Pressable>
      <Text
        style={{
          fontFamily: "Roboto-Regular",
          fontSize: 22,
          color: colors.text,
          minWidth: 32,
          textAlign: "center",
        }}
      >
        {label}
      </Text>
      <Pressable
        onPress={onDown}
        disabled={disabled}
        hitSlop={8}
        style={{ padding: 2 }}
      >
        <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}
