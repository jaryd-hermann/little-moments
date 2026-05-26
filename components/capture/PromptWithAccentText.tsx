import { Text } from "react-native";

export function PromptWithAccentText({
  prompt,
  accent,
  serifStyle,
  accentBg,
  accentColor,
}: {
  prompt: string;
  accent?: string;
  serifStyle: object;
  accentBg: string;
  accentColor: string;
}) {
  if (!accent) {
    return <Text style={serifStyle}>{prompt}</Text>;
  }
  const i = prompt.indexOf(accent);
  if (i < 0) {
    return <Text style={serifStyle}>{prompt}</Text>;
  }
  const before = prompt.slice(0, i);
  const after = prompt.slice(i + accent.length);
  return (
    <Text style={serifStyle}>
      {before}
      <Text
        style={{
          fontStyle: "italic",
          backgroundColor: accentBg,
          color: accentColor,
        }}
      >
        {accent}
      </Text>
      {after}
    </Text>
  );
}
