import { View, Text, Pressable } from "react-native";
import {
  format,
  subDays,
  isSameDay,
  isToday as isDateToday,
} from "date-fns";
import { useTheme } from "@/hooks/useTheme";

interface DayStripProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  entryDates: string[];
}

export function DayStrip({
  selectedDate,
  onSelectDate,
  entryDates,
}: DayStripProps) {
  const { colors } = useTheme();
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) =>
    subDays(today, 6 - i)
  );

  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {days.map((day) => {
        const isSelected = isSameDay(day, selectedDate);
        const isToday = isDateToday(day);
        const hasEntry = entryDates.includes(
          format(day, "yyyy-MM-dd")
        );
        const dayLetter = format(day, "EEEEE");
        const dayNum = format(day, "d");

        return (
          <Pressable
            key={day.toISOString()}
            onPress={() => onSelectDate(day)}
            style={{
              flex: 1,
              alignItems: "center",
              paddingVertical: 8,
              borderRadius: 16,
              backgroundColor: isSelected
                ? colors.text
                : "transparent",
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Regular",
                fontSize: 12,
                color: isSelected
                  ? colors.background
                  : colors.textMuted,
              }}
            >
              {dayLetter}
            </Text>
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 16,
                marginTop: 4,
                color: isSelected
                  ? colors.background
                  : isToday
                    ? colors.text
                    : colors.textSecondary,
              }}
            >
              {dayNum}
            </Text>
            {hasEntry && (
              <View
                style={{
                  marginTop: 4,
                  width: 5,
                  height: 5,
                  borderRadius: 2.5,
                  backgroundColor: isSelected
                    ? colors.background
                    : colors.text,
                }}
              />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
