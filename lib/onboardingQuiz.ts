/**
 * Onboarding quiz — 5-question pre-auth funnel that doubles as the
 * commitment device for the paywall (see newsletter / plan).
 *
 * - QUIZ_QUESTIONS drives the dynamic-route screen at
 *   app/(auth)/quiz/[step].tsx.
 * - Answers are stashed locally in store/onboardingQuizStore.ts and
 *   flushed onto `profiles.quiz_answers` after sign-in succeeds.
 * - Q1 → persona tag (drives downstream personalization).
 * - Q3 → capture_rhythm + reflection_target_default (pre-fills the
 *   existing notifications-prompt screen).
 * - Q5 → headline mirror on the mirror screen and the value-anchor
 *   screen.
 */
export type QuizAnswers = Record<string, string>;

/**
 * When someone taps Login from pre-quiz welcome and signs up (no local quiz),
 * we persist these answers so persona, rhythm pre-fill, and paywall headline
 * match a sensible default rather than `{}`.
 */
export const SKIP_QUIZ_DEFAULT_ANSWERS: QuizAnswers = {
  q1_hook: "notice",
  q2_failure: "first_time",
  q3_rhythm: "evening",
  q4_time: "few_minutes",
  /** Drives mirrorHeadlineForQ5 on the paywall value screen. */
  q5_commitment: "archive",
};

export type QuizPersona = "time" | "memory" | "legacy" | "habit" | "presence";

export type CaptureRhythm = "morning" | "evening";
export type ReflectionTarget = "yesterday" | "today";

export type QuizOption = {
  id: string;
  label: string;
};

export type QuizQuestion = {
  id: string;
  /** Short eyebrow over the question (e.g. "Step 1 of 5"). */
  eyebrow: string;
  prompt: string;
  /** One-line explanation under the prompt — newsletter principle #2 ("explain why"). */
  context: string;
  options: QuizOption[];
};

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: "q1_hook",
    eyebrow: "Step 1 of 5",
    prompt: "What pulled you to Little Moments?",
    context: "",
    options: [
      { id: "blur", label: "The days are starting to blur together" },
      { id: "small_stuff", label: "I want to remember the small stuff, not just the big stuff" },
      { id: "family", label: "I want a real, meaningful keepsake of my life, recorded" },
      { id: "stuck", label: "I've tried journals before and they didn't stick" },
      { id: "notice", label: "I just want to slow down and notice my life more" },
    ],
  },
  {
    id: "q2_failure",
    eyebrow: "Step 2 of 5",
    prompt: "What's stopped you from journaling before?",
    context: "We've heard them all. We built the app around these.",
    options: [
      { id: "chore", label: "It felt like a chore" },
      { id: "blank", label: "I didn't know what to write" },
      { id: "forget", label: "I'd forget by the end of the day" },
      { id: "first_time", label: "I never tried — this is my first time" },
    ],
  },
  {
    id: "q3_rhythm",
    eyebrow: "Step 3 of 5",
    prompt: "When does it feel most natural to look back on your day?",
    context: "We'll nudge you once a day at the time that fits you best.",
    options: [
      { id: "morning", label: "In the morning, with my coffee" },
      { id: "evening", label: "In the evening, before bed" },
      { id: "when_it_hits", label: "Not at a set time — whenever a moment hits" },
    ],
  },
  {
    id: "q4_time",
    eyebrow: "Step 4 of 5",
    prompt: "How long would you ideally spend reflecting each day?",
    context: "Be honest. We built it for the short side of this.",
    options: [
      { id: "under_minute", label: "Under a minute" },
      { id: "few_minutes", label: "1–3 minutes" },
      { id: "longer", label: "5+ minutes, if it's helping" },
    ],
  },
  {
    id: "q5_commitment",
    eyebrow: "Step 5 of 5",
    prompt: "A year from now, what would make this worth it?",
    context: "We'll work backwards from this. Promise.",
    options: [
      { id: "archive", label: "A real archive of the year I almost forgot" },
      { id: "habit", label: "A daily habit I actually kept up" },
      { id: "book", label: "A book I can hold and re-read" },
      { id: "family_legacy", label: "Something my future self / kids can read" },
      {
        id: "themes_patterns",
        label: "I've learnt more about myself by seeing themes and patterns across moments",
      },
    ],
  },
];

export const QUIZ_TOTAL_STEPS = QUIZ_QUESTIONS.length;

export function quizQuestionByIndex(index: number): QuizQuestion | null {
  return QUIZ_QUESTIONS[index - 1] ?? null;
}

export function quizQuestionIdByIndex(index: number): string | null {
  return QUIZ_QUESTIONS[index - 1]?.id ?? null;
}

const PERSONA_BY_Q1_OPTION: Record<string, QuizPersona> = {
  blur: "time",
  small_stuff: "memory",
  family: "legacy",
  stuck: "habit",
  notice: "presence",
};

export function derivePersonaFromAnswers(
  answers: QuizAnswers
): QuizPersona | null {
  const q1 = answers["q1_hook"];
  if (!q1) return null;
  return PERSONA_BY_Q1_OPTION[q1] ?? null;
}

export function deriveCaptureRhythmFromAnswers(
  answers: QuizAnswers
): CaptureRhythm | null {
  const q3 = answers["q3_rhythm"];
  if (q3 === "morning") return "morning";
  if (q3 === "evening") return "evening";
  // "when_it_hits" stays null — the user explicitly opted out of a fixed
  // rhythm, so notifications-prompt falls back to its own default.
  return null;
}

export function deriveReflectionTargetFromAnswers(
  answers: QuizAnswers
): ReflectionTarget | null {
  const rhythm = deriveCaptureRhythmFromAnswers(answers);
  if (rhythm === "morning") return "yesterday";
  if (rhythm === "evening") return "today";
  return null;
}

/**
 * Verbatim mirror of the Q5 answer — used as the headline on both the
 * post-quiz mirror screen and the pre-paywall value-anchor screen.
 * Falls back to a generic line if Q5 wasn't answered (shouldn't happen
 * since the quiz blocks forward without an answer, but defensive).
 */
export function mirrorHeadlineForQ5(answers: QuizAnswers): string {
  const q5 = answers["q5_commitment"];
  switch (q5) {
    case "archive":
      return "A real archive of the year you almost forgot.";
    case "habit":
      return "A daily habit you actually kept up.";
    case "book":
      return "A book you can hold and re-read.";
    case "family_legacy":
      return "Something your future self can read.";
    case "themes_patterns":
      return "Themes and patterns across your life, surfaced for you.";
    default:
      return "A year of moments you'll actually remember.";
  }
}

/**
 * Builds the four mirror lines on the post-quiz mirror screen. Each line
 * quotes the user's answer back — newsletter principle: "mirror screen
 * quotes answers literally, not summarized."
 */
/**
 * Builds the mirror-back lines. Each line owns a *different* slice of the
 * value prop so the four-line block reads as four distinct points, not a
 * refrain of the same mechanics. Allocation:
 *   - Q1 line → emotional truth (no product mechanics)
 *   - Q2 line → the specific design choice that solves the failure mode
 *               (owns "no blank page", "single moment", "first-try win")
 *   - Q3+Q4 line → timing + speed (does NOT re-name photo/prompt)
 *   - Q5 line → the year-from-now destination
 */
export function buildMirrorLines(answers: QuizAnswers): string[] {
  const lines: string[] = [];

  const q1 = answers["q1_hook"];
  if (q1 === "blur") {
    lines.push(
      "You don't want the days blurring together — and the little things that make up a life are the first to slip."
    );
  } else if (q1 === "small_stuff") {
    lines.push(
      "It's the small stuff you don't want to lose — and the small stuff is exactly what gets skimmed past."
    );
  } else if (q1 === "family") {
    lines.push(
      "You want a real, meaningful keepsake of your life — something worth keeping forever."
    );
  } else if (q1 === "stuck") {
    lines.push(
      "Journals haven't stuck for you before — we know why, and we built around it."
    );
  } else if (q1 === "notice") {
    lines.push(
      "You want to slow down and notice your life — and most days, we skim past the moment that actually mattered."
    );
  }

  const q2 = answers["q2_failure"];
  if (q2 === "chore") {
    lines.push(
      "It shouldn't feel like a chore — so it's never more than a single moment, lined up for you in advance."
    );
  } else if (q2 === "blank") {
    lines.push(
      "No blank page. Just one question, and a photo or a prompt to riff off."
    );
  } else if (q2 === "forget") {
    lines.push(
      "We'll nudge you once, at the time you said works best — so the day doesn't slip past you."
    );
  } else if (q2 === "first_time") {
    lines.push(
      "We made the first try feel like a win — you'll see why in a few seconds."
    );
  }

  const q3 = answers["q3_rhythm"];
  const q4 = answers["q4_time"];
  const speed =
    q4 === "under_minute" ? "in under a minute" : "in a minute or two";
  if (q3 === "morning") {
    lines.push(
      `Each morning, we'll meet you with what mattered yesterday — done ${speed}.`
    );
  } else if (q3 === "evening") {
    lines.push(
      `Each evening, we'll catch the day before it disappears — done ${speed}.`
    );
  } else if (q3 === "when_it_hits") {
    lines.push(
      `And when a moment hits, the app is ready — open it, capture it, done ${speed}.`
    );
  }

  const q5 = answers["q5_commitment"];
  if (q5 === "book") {
    lines.push(
      "By this time next year, you'll have curated a beautiful printable annual book of photos and moments — yours to hold and re-read forever."
    );
  } else if (q5 === "archive") {
    lines.push(
      "By this time next year, you'll have a real archive of the year you almost forgot — every moment saved, nothing lost."
    );
  } else if (q5 === "habit") {
    lines.push(
      "By this time next year, you'll have done what most never do — a daily habit you actually kept up."
    );
  } else if (q5 === "family_legacy") {
    lines.push(
      "By this time next year, you'll have something real your future self and family can read — woven from the moments you actually lived."
    );
  } else if (q5 === "themes_patterns") {
    lines.push(
      "And as your moments stack up, we'll surface the themes and patterns running through your life — so a year from now, you'll know yourself better than you do today."
    );
  } else {
    lines.push(
      `By this time next year — ${mirrorHeadlineForQ5(answers).toLowerCase()}`
    );
  }

  return lines;
}
