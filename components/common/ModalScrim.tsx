import { Pressable, StyleSheet } from "react-native";

type ModalScrimProps = {
  onPress: () => void;
};

/**
 * Neutral dark overlay (no blur tint — avoids iOS burgundy/red blur artifacts).
 */
export function ModalScrim({ onPress }: ModalScrimProps) {
  return (
    <Pressable
      style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(0,0,0,0.86)" }]}
      onPress={onPress}
    />
  );
}
