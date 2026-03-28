import { View } from "react-native";

// This screen is never shown — the center "+" tab triggers
// a modal push to /composer via the custom tab bar.
export default function ComposePlaceholder() {
  return <View />;
}
