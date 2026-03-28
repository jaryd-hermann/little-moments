import { Text } from "react-native";

interface RaceTimerProps {
  isRunning: boolean;
  elapsedSeconds: number;
  durationSeconds: number;
}

export function RaceTimer({
  isRunning,
  elapsedSeconds,
  durationSeconds,
}: RaceTimerProps) {
  const remaining = durationSeconds - elapsedSeconds;
  const isOvertime = remaining < 0;

  const formatTime = (totalSecs: number) => {
    const absSecs = Math.abs(totalSecs);
    const m = Math.floor(absSecs / 60);
    const s = absSecs % 60;
    const sign = totalSecs < 0 ? "-" : "";
    return `${sign}${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <Text
      style={{
        fontFamily: "LibreBaskerville-Bold",
        fontSize: 72,
        color: isOvertime ? "#EF4444" : "#FFFFFF",
        textAlign: "center",
      }}
    >
      {formatTime(remaining)}
    </Text>
  );
}
