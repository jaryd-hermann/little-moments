export type ReflectionQuestionId =
  | "best"
  | "hardest"
  | "regret"
  | "win"
  | "noticed"
  | "remember";

export interface ReflectionQuestionItem {
  id: ReflectionQuestionId;
  tagLabel: string;
  prompt: string;
  /** Substring of `prompt` shown with accent styling (italic + highlight). */
  promptAccent?: string;
}

export const REFLECTION_QUESTIONS: ReflectionQuestionItem[] = [
  {
    id: "best",
    tagLabel: "Best moment",
    prompt: "What was the best moment of your day?",
    promptAccent: "best",
  },
  {
    id: "hardest",
    tagLabel: "Hardest moment",
    prompt: "What was the hardest moment of your day?",
    promptAccent: "hardest",
  },
  {
    id: "regret",
    tagLabel: "One regret",
    prompt: "What's one thing you would have done differently today?",
    promptAccent: "differently",
  },
  {
    id: "win",
    tagLabel: "Tiny win",
    prompt: "What tiny win are you glad happened today?",
    promptAccent: "tiny win",
  },
  {
    id: "noticed",
    tagLabel: "Something I noticed",
    prompt: "What's something small you noticed today that stuck with you?",
    promptAccent: "small",
  },
  {
    id: "remember",
    tagLabel: "Worth remembering",
    prompt: "What's a little moment from the day you don't want to forget?",
    promptAccent: "little moment",
  },
];

export function getReflectionQuestion(
  id: ReflectionQuestionId
): ReflectionQuestionItem {
  const found = REFLECTION_QUESTIONS.find((q) => q.id === id);
  return found ?? REFLECTION_QUESTIONS[0];
}
