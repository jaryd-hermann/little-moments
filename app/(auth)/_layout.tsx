import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "none",
      }}
      initialRouteName="sign-in"
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="quiz/[step]" />
      <Stack.Screen name="quiz/mirror" />
      <Stack.Screen name="photo-permission" />
      <Stack.Screen name="activation" />
      <Stack.Screen name="reveal" />
      <Stack.Screen name="notifications-prompt" />
      <Stack.Screen name="first-moment" />
    </Stack>
  );
}
