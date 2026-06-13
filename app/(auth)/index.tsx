import { Redirect } from "expo-router";

/** Auth group entry — splash owns pre-auth welcome; land on sign-in. */
export default function AuthIndex() {
  return <Redirect href="/(auth)/sign-in" />;
}
