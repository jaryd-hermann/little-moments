import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="photo-permission" />
      <Stack.Screen name="activation" />
      <Stack.Screen name="reveal" />
      <Stack.Screen name="notifications-prompt" />
    </Stack>
  );
}
