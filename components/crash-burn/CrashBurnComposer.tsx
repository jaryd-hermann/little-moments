import { View, TextInput } from "react-native";
import { MicRecorder } from "@/components/composer/MicRecorder";

interface CrashBurnComposerProps {
  text: string;
  onChangeText: (text: string) => void;
}

export function CrashBurnComposer({
  text,
  onChangeText,
}: CrashBurnComposerProps) {
  return (
    <View className="flex-1">
      <TextInput
        value={text}
        onChangeText={onChangeText}
        multiline
        autoFocus
        placeholder="Start writing... don't stop, don't edit, just go."
        placeholderTextColor="rgba(255, 255, 255, 0.3)"
        style={{
          flex: 1,
          fontFamily: "LibreBaskerville-Regular",
          fontSize: 16,
          lineHeight: 28,
          color: "#FFFFFF",
          textAlignVertical: "top",
        }}
      />
      <View className="mt-2">
        <MicRecorder
          onTranscription={(transcribed) =>
            onChangeText(text + " " + transcribed)
          }
        />
      </View>
    </View>
  );
}
