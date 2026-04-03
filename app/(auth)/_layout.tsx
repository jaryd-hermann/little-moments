import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="resonance" />
      <Stack.Screen name="follow-up" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="donation" />
      <Stack.Screen name="trial" />
      <Stack.Screen name="notifications-prompt" />
      <Stack.Screen name="story-coach" />
    </Stack>
  );
}
