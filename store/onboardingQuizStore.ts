import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import {
  SKIP_QUIZ_DEFAULT_ANSWERS,
  derivePersonaFromAnswers,
  deriveCaptureRhythmFromAnswers,
  deriveReflectionTargetFromAnswers,
  type QuizAnswers,
} from "@/lib/onboardingQuiz";

interface OnboardingQuizStore {
  answers: QuizAnswers;
  /**
   * Latest step the user reached (1-based). Used to resume a partial quiz
   * if the user backgrounds and re-opens the app mid-flow.
   */
  furthestStep: number;
  /**
   * True once flushToProfile() succeeded for the most recent answer set.
   * Resets to false whenever setAnswer() mutates the answers so we re-flush
   * if anything changed post-auth (e.g. the user edits a question via a
   * future Settings entry point).
   */
  persistedToProfile: boolean;
  setAnswer: (questionId: string, optionId: string) => void;
  setFurthestStep: (step: number) => void;
  clear: () => void;
  flushToProfile: (
    userId: string
  ) => Promise<{ ok: true; answerCount: number } | { ok: false; reason: string }>;
  /** Quiz skipped via pre-quiz Login → auth; persists defaults only (does not mutate local answers). */
  flushSkipQuizDefaultsToProfile: (
    userId: string
  ) => Promise<{ ok: true } | { ok: false; reason: string }>;
}

export const useOnboardingQuizStore = create<OnboardingQuizStore>()(
  persist(
    (set, get) => ({
      answers: {},
      furthestStep: 1,
      persistedToProfile: false,
      setAnswer: (questionId, optionId) => {
        const next: QuizAnswers = { ...get().answers, [questionId]: optionId };
        set({ answers: next, persistedToProfile: false });
      },
      setFurthestStep: (step) => {
        const current = get().furthestStep;
        if (step > current) set({ furthestStep: step });
      },
      clear: () =>
        set({ answers: {}, furthestStep: 1, persistedToProfile: false }),
      flushToProfile: async (userId) => {
        const answers = get().answers;
        const answerCount = Object.keys(answers).length;
        if (answerCount === 0) {
          return { ok: false, reason: "no_answers" };
        }
        const captureRhythm = deriveCaptureRhythmFromAnswers(answers);
        const reflectionTarget = deriveReflectionTargetFromAnswers(answers);
        const persona = derivePersonaFromAnswers(answers);

        const update: Record<string, unknown> = {
          quiz_answers: answers,
          quiz_persona: persona,
          // Always advance from 'quiz' phase on flush — even a partial quiz
          // counts as "made it past the quiz screens." Existing post-quiz
          // routing handles the rest.
          onboarding_phase: "photo_permission",
        };
        if (captureRhythm) {
          update.capture_rhythm = captureRhythm;
        }
        if (reflectionTarget) {
          update.reflection_target_default = reflectionTarget;
        }

        const { error } = await supabase
          .from("profiles")
          .update(update)
          .eq("id", userId);

        if (error) {
          console.error("[onboardingQuiz] flushToProfile failed:", error);
          return { ok: false, reason: error.message };
        }
        set({ persistedToProfile: true });
        return { ok: true, answerCount };
      },
      flushSkipQuizDefaultsToProfile: async (userId) => {
        const answers = SKIP_QUIZ_DEFAULT_ANSWERS;
        const captureRhythm = deriveCaptureRhythmFromAnswers(answers);
        const reflectionTarget = deriveReflectionTargetFromAnswers(answers);
        const persona = derivePersonaFromAnswers(answers);

        const update: Record<string, unknown> = {
          quiz_answers: answers,
          quiz_persona: persona,
          onboarding_phase: "photo_permission",
        };
        if (captureRhythm) {
          update.capture_rhythm = captureRhythm;
        }
        if (reflectionTarget) {
          update.reflection_target_default = reflectionTarget;
        }

        const { error } = await supabase
          .from("profiles")
          .update(update)
          .eq("id", userId);

        if (error) {
          console.error(
            "[onboardingQuiz] flushSkipQuizDefaultsToProfile failed:",
            error
          );
          return { ok: false, reason: error.message };
        }
        return { ok: true };
      },
    }),
    {
      name: "little-moments-onboarding-quiz",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        answers: state.answers,
        furthestStep: state.furthestStep,
        persistedToProfile: state.persistedToProfile,
      }),
    }
  )
);
