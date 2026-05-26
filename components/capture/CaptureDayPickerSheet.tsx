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
import { useTheme } from "@/hooks/useTheme";
import { PINK_CTA_INK } from "@/lib/themedShadow";

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
}

export function CaptureDayPickerSheet({
  visible,
  onClose,
  rows,
  selectedYmd,
  onSelectYmd,
  disableDaysWithMoments = false,
}: CaptureDayPickerSheetProps) {
  const { colors, theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();

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
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: 12 }}
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
                    borderWidth: row.isDefaultRow && !selected ? 2 : 0,
                    borderColor: "#D4A5D8",
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
                      {row.isDefaultRow ? (
                        <View
                          style={{
                            backgroundColor: colors.primary,
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                            borderRadius: 8,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: "Roboto-Medium",
                              fontSize: 10,
                              color: PINK_CTA_INK,
                            }}
                          >
                            Your preference
                          </Text>
                        </View>
                      ) : null}
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
                              ? row.titleLine === "Today"
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}
