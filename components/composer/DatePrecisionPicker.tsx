import { View, Text, Pressable, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { format, addDays, subDays, addMonths, subMonths, addYears, subYears } from "date-fns";
import { useTheme } from "@/hooks/useTheme";

type Precision = "exact" | "month_only" | "year_only";

interface DatePrecisionPickerProps {
  visible: boolean;
  onClose: () => void;
  date: Date;
  precision: Precision;
  onChangePrecision: (precision: Precision) => void;
  onChangeDate: (date: Date) => void;
}

const PRECISION_OPTIONS: { value: Precision; label: string }[] = [
  { value: "exact", label: "Day" },
  { value: "month_only", label: "Month" },
  { value: "year_only", label: "Year" },
];

export function DatePrecisionPicker({
  visible,
  onClose,
  date,
  precision,
  onChangePrecision,
  onChangeDate,
}: DatePrecisionPickerProps) {
  const { colors, theme } = useTheme();

  const goBack = () => {
    if (precision === "exact") onChangeDate(subDays(date, 1));
    else if (precision === "month_only") onChangeDate(subMonths(date, 1));
    else onChangeDate(subYears(date, 1));
  };

  const goForward = () => {
    if (precision === "exact") onChangeDate(addDays(date, 1));
    else if (precision === "month_only") onChangeDate(addMonths(date, 1));
    else onChangeDate(addYears(date, 1));
  };

  const dateLabel =
    precision === "exact"
      ? format(date, "EEEE, MMMM d, yyyy")
      : precision === "month_only"
        ? format(date, "MMMM yyyy")
        : format(date, "yyyy");

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable
        style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" }}
        onPress={onClose}
      >
        <Pressable
          style={{
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            backgroundColor: colors.surface,
            paddingHorizontal: 24,
            paddingBottom: 40,
            paddingTop: 16,
          }}
          onPress={() => {}}
        >
          <View
            style={{
              alignSelf: "center",
              height: 4,
              width: 40,
              borderRadius: 2,
              backgroundColor: colors.border,
              marginBottom: 16,
            }}
          />

          <Text
            style={{
              fontFamily: "LibreBaskerville-Bold",
              fontSize: 18,
              color: colors.text,
              marginBottom: 16,
            }}
          >
            When was this moment?
          </Text>

          <View style={{ flexDirection: "row", gap: 8, marginBottom: 24 }}>
            {PRECISION_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => onChangePrecision(opt.value)}
                style={{
                  flex: 1,
                  borderRadius: 12,
                  paddingVertical: 12,
                  backgroundColor:
                    precision === opt.value
                      ? theme === "dark" ? "#FFFFFF" : "#1A1A1A"
                      : colors.surfaceSecondary,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 13,
                    textAlign: "center",
                    color:
                      precision === opt.value
                        ? theme === "dark" ? "#000000" : "#FFFFFF"
                        : colors.textSecondary,
                  }}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 24,
            }}
          >
            <Pressable
              onPress={goBack}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="chevron-back" size={20} color={colors.icon} />
            </Pressable>

            <Text
              style={{
                fontFamily: "LibreBaskerville-Regular",
                fontSize: 16,
                color: colors.text,
                textAlign: "center",
                flex: 1,
              }}
            >
              {dateLabel}
            </Text>

            <Pressable
              onPress={goForward}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="chevron-forward" size={20} color={colors.icon} />
            </Pressable>
          </View>

          <Pressable
            onPress={onClose}
            style={{
              height: 48,
              borderRadius: 9999,
              backgroundColor: theme === "dark" ? "#FFFFFF" : "#1A1A1A",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                color: theme === "dark" ? "#000000" : "#FFFFFF",
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              DONE
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
