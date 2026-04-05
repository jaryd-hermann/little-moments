import { getDayOfYear } from "date-fns";
import { getDailyWord } from "@/constants/words";
import { getDailyQuestion } from "@/constants/questions";
import type { PromptType } from "@/lib/momentAssist";

export interface DailyPrompt {
  type: PromptType;
  value: string;
}

/**
 * Determines today's prompt type based on a 3-day rotation:
 * Day 0 = word, Day 1 = photo, Day 2 = question, repeat.
 */
export function getDailyPromptType(): PromptType {
  const dayIndex = getDayOfYear(new Date()) - 1;
  const cycle = dayIndex % 3;
  switch (cycle) {
    case 0:
      return "word";
    case 1:
      return "photo";
    case 2:
      return "question";
    default:
      return "word";
  }
}

/**
 * Returns the full daily prompt (type + value).
 * For photo type, value is empty — the caller supplies the URI.
 */
export function getDailyPrompt(): DailyPrompt {
  const type = getDailyPromptType();
  switch (type) {
    case "word":
      return { type, value: getDailyWord() };
    case "photo":
      return { type, value: "" };
    case "question":
      return { type, value: getDailyQuestion() };
    default:
      return { type: "word", value: getDailyWord() };
  }
}
