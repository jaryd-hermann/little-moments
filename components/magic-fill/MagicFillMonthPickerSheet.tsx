import { useTheme } from "@/hooks/useTheme";
import type { Entry } from "@/store/entryStore";
import { magicFillHeadlineStyle } from "@/lib/magicFillTypography";
import {
  endOfMonth,
  format,
  startOfMonth,
  subMonths,
} from "date-fns";
import * as Haptics from "expo-haptics";
import { useMemo } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface MagicFillMonthPickerSheetProps {
  visible: boolean;
  entries: Entry[];
  onClose: () => void;
  onSelectMonth: (monthKey: string) => void;
}

function monthCapturePct(
  entries: Entry[],
  monthStart: Date,
  visibleDays: number
): number {
  if (visibleDays <= 0) return 0;
  const prefix = format(monthStart, "yyyy-MM");
  const captured = new Set<string>();
  for (const e of entries) {
    if (e.entry_type !== "moment" || !e.entry_date?.startsWith(prefix)) {
      continue;
    }
    captured.add(e.entry_date);
  }
  return Math.round((captured.size / visibleDays) * 100);
}

export function MagicFillMonthPickerSheet({
  visible,
  entries,
  onClose,
  onSelectMonth,
}: MagicFillMonthPickerSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const today = useMemo(() => new Date(), []);

  const months = useMemo(() => {
    const out: {
      key: string;
      label: string;
      pct: number;
    }[] = [];
    for (let i = 0; i < 18; i++) {
      const start = startOfMonth(subMonths(today, i));
      const end = endOfMonth(start);
      const isCurrent =
        start.getMonth() === today.getMonth() &&
        start.getFullYear() === today.getFullYear();
      const visibleDays = isCurrent ? today.getDate() : end.getDate();
      out.push({
        key: format(start, "yyyy-MM"),
        label: format(start, "MMMM yyyy"),
        pct: monthCapturePct(entries, start, visibleDays),
      });
    }
    return out;
  }, [entries, today]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "rgba(0,0,0,0.45)",
        }}
        onPress={onClose}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            maxHeight: "78%",
            backgroundColor: colors.background,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 20,
            paddingBottom: Math.max(insets.bottom, 16),
          }}
        >
          <Text
            style={{
              ...magicFillHeadlineStyle({
                fontSize: 24,
                lineHeight: 30,
                color: colors.text,
              }),
              paddingHorizontal: 24,
              marginBottom: 8,
            }}
          >
            Pick a month
          </Text>
          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 14,
              lineHeight: 20,
              color: colors.textSecondary,
              paddingHorizontal: 24,
              marginBottom: 16,
            }}
          >
            We&apos;ll find every gap day in that month — not limited by the
            number above.
          </Text>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
            {months.map((m) => (
              <Pressable
                key={m.key}
                onPress={() => {
                  void Haptics.selectionAsync();
                  onSelectMonth(m.key);
                }}
                style={{
                  borderRadius: 14,
                  borderWidth: 1.5,
                  borderColor: colors.border,
                  paddingVertical: 16,
                  paddingHorizontal: 18,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 16,
                    color: colors.text,
                  }}
                >
                  {m.label}
                </Text>
                <Text
                  style={{
                    fontFamily: "Roboto-Bold",
                    fontSize: 14,
                    color: colors.primary,
                  }}
                >
                  {m.pct}% captured
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable
            onPress={onClose}
            style={{
              marginTop: 12,
              paddingVertical: 14,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                color: colors.textMuted,
              }}
            >
              Cancel
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
