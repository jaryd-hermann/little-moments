import { Platform, Share } from "react-native";

const INVITE_MESSAGE =
  "Check out Little Moments — honor the everyday. https://littlemoments.app";
const INVITE_URL = "https://littlemoments.app";

export async function shareInvite(): Promise<void> {
  try {
    await Share.share(
      Platform.OS === "ios"
        ? { message: INVITE_MESSAGE, url: INVITE_URL }
        : { message: `${INVITE_MESSAGE}` }
    );
  } catch {
    // user dismissed
  }
}

export const FEEDBACK_MAIL =
  "mailto:hermannjaryd@gmail.com?subject=Little%20Moments%20feedback";
