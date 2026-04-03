import { View, Pressable } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDecay,
  runOnJS,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";

interface SpinWheelProps {
  onRotationChange: (delta: number) => void;
  onPlay: () => void;
  isPlaying: boolean;
}

const WHEEL_SIZE = 220;
const TICK_COUNT = 60;
const RADIUS = WHEEL_SIZE / 2;

export function SpinWheel({
  onRotationChange,
  onPlay,
  isPlaying,
}: SpinWheelProps) {
  const rotation = useSharedValue(0);
  const prevAngle = useSharedValue(0);
  const startRotation = useSharedValue(0);
  const lastReportedStep = useSharedValue(0);
  const lastVelocity = useSharedValue(0);

  const DEGREES_PER_DAY = 6;

  const reportChange = (rot: number) => {
    const step = Math.round(rot / DEGREES_PER_DAY);
    if (step !== lastReportedStep.value) {
      const delta = step - lastReportedStep.value;
      lastReportedStep.value = step;
      // Photos are sorted creationTime DESC (newest first). Negate so clockwise /
      // dragging forward moves toward newer photos; anticlockwise toward older.
      onRotationChange(-delta);
    }
  };

  const gesture = Gesture.Pan()
    .onStart((event) => {
      startRotation.value = rotation.value;
      const dx = event.x - RADIUS;
      const dy = event.y - RADIUS;
      prevAngle.value = Math.atan2(dy, dx) * (180 / Math.PI);
    })
    .onUpdate((event) => {
      const dx = event.x - RADIUS;
      const dy = event.y - RADIUS;
      const currentAngle = Math.atan2(dy, dx) * (180 / Math.PI);
      let delta = currentAngle - prevAngle.value;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      prevAngle.value = currentAngle;
      lastVelocity.value = delta;
      rotation.value = rotation.value + delta;
      runOnJS(reportChange)(rotation.value);
    })
    .onEnd(() => {
      rotation.value = withDecay(
        {
          velocity: lastVelocity.value * 60,
          deceleration: 0.995,
        },
        () => {
          runOnJS(reportChange)(rotation.value);
        }
      );
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const ticks = Array.from({ length: TICK_COUNT }, (_, i) => {
    const angleDeg = (i * 360) / TICK_COUNT;
    const angleRad = (angleDeg * Math.PI) / 180;
    const isMajor = i % 5 === 0;
    const tickLen = isMajor ? 14 : 7;
    const outerR = RADIUS - 2;
    const innerR = outerR - tickLen;

    const x1 = RADIUS + Math.sin(angleRad) * outerR;
    const y1 = RADIUS - Math.cos(angleRad) * outerR;
    const x2 = RADIUS + Math.sin(angleRad) * innerR;
    const y2 = RADIUS - Math.cos(angleRad) * innerR;

    return { x1, y1, x2, y2, isMajor, angleDeg };
  });

  return (
    <View style={{ width: WHEEL_SIZE, height: WHEEL_SIZE, alignItems: "center", justifyContent: "center" }}>
      {/* Pointer at top */}
      <View
        style={{
          position: "absolute",
          top: 0,
          zIndex: 10,
          width: 3,
          height: 16,
          backgroundColor: "white",
          borderRadius: 1.5,
          alignSelf: "center",
        }}
      />

      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[
            {
              width: WHEEL_SIZE,
              height: WHEEL_SIZE,
              borderRadius: RADIUS,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.1)",
            },
            animatedStyle,
          ]}
        >
          {ticks.map(({ x1, y1, x2, y2, isMajor, angleDeg }, i) => {
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.sqrt(dx * dx + dy * dy);
            const w = isMajor ? 2 : 1;

            return (
              <View
                key={i}
                style={{
                  position: "absolute",
                  left: x1 - w / 2,
                  top: y1,
                  width: w,
                  height: len,
                  backgroundColor: isMajor
                    ? "rgba(255,255,255,0.65)"
                    : "rgba(255,255,255,0.25)",
                  borderRadius: 0.5,
                  transform: [{ rotate: `${angleDeg}deg` }],
                  transformOrigin: "top center",
                }}
              />
            );
          })}
        </Animated.View>
      </GestureDetector>

      {/* Play/Pause button center */}
      <Pressable
        onPress={onPlay}
        style={{
          position: "absolute",
          width: 64,
          height: 64,
          borderRadius: 32,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons
          name={isPlaying ? "pause" : "play"}
          size={38}
          color="white"
          style={isPlaying ? undefined : { marginLeft: 4 }}
        />
      </Pressable>
    </View>
  );
}
