import type { ImageSourcePropType } from "react-native";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";

/** The answers to "what do you want to remember most?". */
export type RememberMostId =
  | "everyday_life"
  | "kids_growing_up"
  | "travels_adventures"
  | "something_else";

/** Either an answer or a deliberate skip — what the chat has to reply to. */
export type RememberMostChoice = RememberMostId | "skipped";

export interface RememberMostOption {
  id: RememberMostId;
  /** Card face, first person — also what lands in the transcript as their reply. */
  label: string;
  /**
   * Slotted into Jaryd's reply ("a real keepsake of …"). Absent for
   * `something_else`, which has nothing specific to name.
   */
  keepsakeOf?: string;
  /** Card art, sitting under the label. */
  image: ImageSourcePropType;
  /** Pastel wash behind the art while it loads, and on the position pill. */
  tint: string;
}

export const REMEMBER_MOST_OPTIONS: RememberMostOption[] = [
  {
    id: "everyday_life",
    label: "My everyday life",
    keepsakeOf: "your everyday life",
    image: require("@/assets/images/everyday.png"),
    tint: "#FDE8B8",
  },
  {
    id: "kids_growing_up",
    label: "My kids growing up",
    keepsakeOf: "your kids growing up",
    image: require("@/assets/images/kids.png"),
    tint: "#F0D7FF",
  },
  {
    id: "travels_adventures",
    label: "My travels and adventures",
    keepsakeOf: "your travels and adventures",
    image: require("@/assets/images/vacation.png"),
    tint: "#CFE8FF",
  },
  {
    id: "something_else",
    label: "Something else",
    image: require("@/assets/images/somethingelse.png"),
    tint: "#D8F0DC",
  },
];

export function rememberMostOption(
  id: RememberMostId
): RememberMostOption | undefined {
  return REMEMBER_MOST_OPTIONS.find((o) => o.id === id);
}

const GENERIC_KEEPSAKE =
  "A short 60s daily ritual here will help you build a real keepsake of life's little moments and help you notice what matters.";

/** Jaryd's closing line, named to their answer where there is one. */
export function rememberMostReply(choice: RememberMostChoice): string {
  if (choice === "skipped") return `No worries. ${GENERIC_KEEPSAKE}`;
  const keepsakeOf = rememberMostOption(choice)?.keepsakeOf;
  if (!keepsakeOf) return `Perfect, ${lowerFirst(GENERIC_KEEPSAKE)}`;
  return `Perfect, a short 60s daily ritual here will help you build a real keepsake of **${keepsakeOf}**, and help you notice what matters.`;
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * Persist their answer. Fire-and-forget: this is a preference we'd like to
 * have, not something the chat should stall or fail on, so a write error only
 * leaves the column null.
 */
export async function syncRememberMostToProfile(
  id: RememberMostId
): Promise<void> {
  const { user, profile, setProfile } = useAuthStore.getState();
  if (!user?.id) return;

  const { error } = await supabase
    .from("profiles")
    .update({ remember_most: id })
    .eq("id", user.id);

  if (error) {
    // A missing column here means migration `0066_profile_remember_most.sql`
    // hasn't been applied — otherwise invisible, since nothing in the app
    // reads this back yet.
    // `PGRST204` is PostgREST missing the column from its schema cache, `42703`
    // is Postgres' own "column does not exist" — either way the migration
    // hasn't reached the database.
    if (error.code === "PGRST204" || error.code === "42703") {
      console.error(
        `[rememberMost] profiles is missing remember_most — apply supabase/migrations/0066_profile_remember_most.sql. (${error.message})`
      );
      return;
    }
    console.error("[rememberMost] could not save the answer:", error.message);
    return;
  }

  if (profile) setProfile({ ...profile, remember_most: id });
}
