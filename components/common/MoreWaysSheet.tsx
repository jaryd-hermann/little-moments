import { View, Text, Pressable, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";

interface MoreWaysSheetProps {
  visible: boolean;
  onClose: () => void;
  onGiveWord: () => void;
  onJustWrite: () => void;
  onUseDifferentPhoto: () => void;
}

interface OptionRowProps {
  iconLetter?: string;
  iconName?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  isLast?: boolean;
  /** When true, renders the row with the violet "Most popular" highlight + solid icon container. */
  highlighted?: boolean;
}

function OptionRow({
  iconLetter,
  iconName,
  title,
  subtitle,
  onPress,
  isLast,
  highlighted,
}: OptionRowProps) {
  const { colors } = useTheme();

  const iconContainer = highlighted
    ? {
        width: 44,
        height: 44,
        borderRadius: 10,
        backgroundColor: colors.primary,
        borderWidth: 1.5,
        borderColor: PINK_CTA_BORDER,
      }
    : {
        width: 40,
        height: 40,
        borderRadius: 8,
        backgroundColor: "transparent",
        borderWidth: 1.5,
        borderColor: colors.text,
      };
  const iconColor = highlighted ? PINK_CTA_INK : colors.text;

  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingVertical: 14,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.borderLight,
      }}
    >
      <View
        style={{
          ...iconContainer,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {iconLetter ? (
          <Text
            style={{
              fontFamily: "LibreBaskerville-Bold",
              fontSize: 16,
              color: iconColor,
            }}
          >
            {iconLetter}
          </Text>
        ) : iconName ? (
          <Ionicons name={iconName} size={highlighted ? 22 : 18} color={iconColor} />
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: "LibreBaskerville-Bold",
            fontSize: 16,
            color: colors.text,
            marginBottom: 2,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 13,
            color: colors.textSecondary,
          }}
        >
          {subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

export function MoreWaysSheet({
  visible,
  onClose,
  onGiveWord,
  onJustWrite,
  onUseDifferentPhoto,
}: MoreWaysSheetProps) {
  const { colors } = useTheme();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "rgba(0, 0, 0, 0.4)",
        }}
        onPress={onClose}
      >
        <Pressable
          style={{
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            backgroundColor: colors.surface,
            paddingHorizontal: 24,
            paddingBottom: 32,
            paddingTop: 12,
          }}
          onPress={() => {}}
        >
          <View
            style={{
              alignSelf: "center",
              height: 4,
              width: 40,
              borderRadius: 2,
              backgroundColor: colors.borderLight,
              marginBottom: 16,
            }}
          />
          <Text
            style={{
              fontFamily: "LibreBaskerville-Bold",
              fontSize: 22,
              fontStyle: "italic",
              color: colors.text,
              marginBottom: 4,
            }}
          >
            More ways to capture
          </Text>
          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 14,
              color: colors.textSecondary,
              marginBottom: 12,
            }}
          >
            For when you don&apos;t want to react to a photo.
          </Text>
          <OptionRow
            iconName="camera"
            title="Take a photo, or pick one"
            subtitle="Open the camera now, or pick one from your gallery."
            highlighted
            onPress={() => {
              onClose();
              onUseDifferentPhoto();
            }}
          />
          <OptionRow
            iconLetter="w"
            title="Give me a word"
            subtitle={"A single word, like \u201Ckitchen\u201D or \u201Cache.\u201D"}
            onPress={() => {
              onClose();
              onGiveWord();
            }}
          />
          <OptionRow
            iconName="create-outline"
            title="Just write"
            subtitle="Open freetext. Ellie won't prompt unless you ask."
            onPress={() => {
              onClose();
              onJustWrite();
            }}
            isLast
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
