import type { ReactNode } from "react";
import { View, Text, Modal, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";

type PageInfoSheetProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

export function InfoSheetParagraph({
  children,
  last,
}: {
  children: string;
  last?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        fontFamily: "Roboto-Regular",
        fontSize: 15,
        color: colors.textSecondary,
        lineHeight: 24,
        marginBottom: last ? 0 : 16,
      }}
    >
      {children}
    </Text>
  );
}

export function InfoSheetSectionHeading({ children }: { children: string }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        fontFamily: "Roboto-Bold",
        fontSize: 15,
        lineHeight: 22,
        color: colors.text,
        marginTop: 4,
        marginBottom: 6,
      }}
    >
      {children}
    </Text>
  );
}

export function InfoSheetMutedNote({ children }: { children: string }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        fontFamily: "Roboto-Light",
        fontSize: 13,
        color: colors.textMuted,
        lineHeight: 20,
      }}
    >
      {children}
    </Text>
  );
}

/** Full-height page sheet for tab-level “How this works” info (Connections, Chapters, etc.). */
export function PageInfoSheet({
  visible,
  onClose,
  title,
  children,
}: PageInfoSheetProps) {
  const { colors } = useTheme();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 8,
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Bold",
              fontSize: 22,
              color: colors.text,
              flex: 1,
            }}
          >
            {title}
          </Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <Ionicons name="close" size={28} color={colors.textSecondary} />
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}
