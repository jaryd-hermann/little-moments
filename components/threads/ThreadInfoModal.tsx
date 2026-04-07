import { View, Text, Modal, Pressable, Linking, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";

interface ThreadInfoModalProps {
  visible: boolean;
  onClose: () => void;
}

export function ThreadInfoModal({ visible, onClose }: ThreadInfoModalProps) {
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
              fontFamily: "LibreBaskerville-Bold",
              fontSize: 22,
              color: colors.text,
              flex: 1,
            }}
          >
            How Threads work
          </Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <Ionicons name="close" size={28} color={colors.textSecondary} />
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
        >

          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 15,
              color: colors.textSecondary,
              lineHeight: 24,
              marginBottom: 16,
            }}
          >
            As you log moments, Ellie reads across your entries to find
            patterns, recurring feelings, and connections you might not have
            noticed. She's looking for the kind of thing a thoughtful friend
            might say after reading your whole journal.
          </Text>

          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 15,
              color: colors.textSecondary,
              lineHeight: 24,
              marginBottom: 16,
            }}
          >
            The more you log, the better she gets at knowing you. Threads are
            stored permanently — they never disappear.
          </Text>

          <Pressable
            onPress={() =>
              Linking.openURL("https://getlittlemoments.com/ellie/threads")
            }
            style={{
              paddingVertical: 12,
              paddingHorizontal: 24,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: colors.primary,
              alignSelf: "flex-start",
              marginBottom: 20,
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 14,
                color: colors.primary,
              }}
            >
              More details
            </Text>
          </Pressable>

          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 13,
              color: colors.textMuted,
              lineHeight: 20,
              marginBottom: 8,
            }}
          >
            Your entries stay encrypted on your device and in transit. For
            analysis, we use secure processing: text is converted into numerical
            embeddings and technical metadata that are not human-readable in
            storage—so nobody can skim your journal to find Threads. Only the
            structured insight Ellie writes back to you is stored as readable
            text tied to your account.
          </Text>

        </ScrollView>
      </View>
    </Modal>
  );
}
