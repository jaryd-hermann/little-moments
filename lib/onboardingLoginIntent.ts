import AsyncStorage from "@react-native-async-storage/async-storage";

/** Set when tapping Login from the pre-quiz welcome (2.png) so OAuth returns can still flush default quiz defaults. */
const KEY = "@little-moments/login-from-pre-quiz-welcome";

export async function setLoginFromPreQuizWelcomeIntent(): Promise<void> {
  await AsyncStorage.setItem(KEY, "1");
}

export async function getLoginFromPreQuizWelcomeIntent(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEY)) === "1";
}

export async function clearLoginFromPreQuizWelcomeIntent(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
