export type ResonanceTag =
  | "time"
  | "storytelling"
  | "habit"
  | "presence"
  | "memory"
  | "legacy"
  | "self"
  | "family";

export type FollowUpScreenKey =
  | "time_storytelling"
  | "storytelling"
  | "legacy"
  | "family"
  | "memory"
  | "time"
  | "presence"
  | "habit"
  | "self";

export interface FollowUpScreenCopy {
  heading: string;
  subtext: string;
  checks: string[];
}

const STORYTELLING_CHECKS: string[] = [
  'Never say "nothing interesting happened to me" again',
  "Build a library of real stories from your actual life",
  "Become the person in the room who always has something worth saying",
  "Grounded in Matthew Dicks' Homework for Life — used by the world's best storytellers",
];

const COPY: Record<FollowUpScreenKey, FollowUpScreenCopy> = {
  time: {
    heading: "You're not losing time. You're just not catching it.",
    subtext:
      "Days don't disappear — they slip by unnoticed. One tiny entry each night changes that. You stop losing days. You start owning them.",
    checks: [
      "Never end a week wondering where it went",
      "Relive any day, month, or year like it was yesterday",
      "Watch your life feel bigger, richer, and slower — in the best way",
      "5 minutes tonight. A memory you'll have forever.",
    ],
  },
  storytelling: {
    heading:
      "Your best stories are already happening. You're just not seeing them yet.",
    subtext:
      "The moments that make people lean in aren't the dramatic ones — they're the small, true ones. Little Moments trains you to spot them every single day.",
    checks: STORYTELLING_CHECKS,
  },
  memory: {
    heading: "The small stuff is the stuff that matters most. Don't let it disappear.",
    subtext:
      "You won't remember the way your kid mispronounced that word. Or the random Tuesday that turned into something special. But you could. One line is all it takes.",
    checks: [
      "Capture the moments you'd otherwise lose forever",
      "Build a searchable, personal archive of your life",
      "Trigger memories you forgot you even had",
      "The small details are the ones you'll treasure most — we help you hold onto them",
    ],
  },
  presence: {
    heading: "You're already living the moments. Now start noticing them.",
    subtext:
      "Most of us move through our days on autopilot — not because nothing is happening, but because we're not looking. Little Moments gives you a reason to pay attention.",
    checks: [
      "End each day with a moment of real reflection — not doom-scrolling",
      "Train yourself to notice what's meaningful as it's happening",
      "Feel more grounded, more grateful, more awake to your own life",
      "Just 5 minutes. But the effect lasts all day.",
    ],
  },
  habit: {
    heading:
      "The journaling habit you've always wanted — finally one you'll actually keep.",
    subtext:
      "Most journals ask too much. Little Moments asks for one moment. One line. That's it. No blank pages. No pressure. Just a tiny habit that quietly changes everything.",
    checks: [
      "Takes less than 5 minutes — fits into any routine",
      "A gentle daily prompt so you never stare at a blank screen",
      "Streak tracking that celebrates consistency, not perfection",
      "Thousands of people say it's the first journaling habit that actually stuck",
    ],
  },
  time_storytelling: {
    heading: "Stop losing days. Start living stories worth telling.",
    subtext:
      "Time moves fast when you're not paying attention — and the best stories come from the days you almost forgot. Little Moments is built for exactly this: catching the moments that make your life worth narrating, before they're gone.",
    checks: [
      "Never lose a day you'll wish you remembered",
      "Build a real, personal library of stories from your actual life",
      "Train the storytelling instinct that most people never develop",
      "Based on Matthew Dicks' Homework for Life — the practice behind some of the world's best personal stories",
      "5 minutes a night. A completely different relationship with your own life.",
    ],
  },
  legacy: {
    heading: "Your memories become a gift when they're captured.",
    subtext:
      "Family doesn't just inherit photos — they inherit stories, voice, and meaning. A few minutes a day helps preserve the life only you can describe.",
    checks: [
      "Create a memory archive your family can return to for years",
      "Preserve the small details that disappear fastest",
      "Turn everyday moments into stories worth passing down",
      "A tiny daily habit that builds a lasting family record",
    ],
  },
  family: {
    heading: "Your memories become a gift when they're captured.",
    subtext:
      "Family doesn't just inherit photos — they inherit stories, voice, and meaning. A few minutes a day helps preserve the life only you can describe.",
    checks: [
      "Create a memory archive your family can return to for years",
      "Preserve the small details that disappear fastest",
      "Turn everyday moments into stories worth passing down",
      "A tiny daily habit that builds a lasting family record",
    ],
  },
  self: {
    heading: "Build a memory archive that's for you first.",
    subtext:
      "Most moments fade because no one captures them in time. Little Moments helps you quickly record the details that matter so your own life stays vivid and searchable.",
    checks: [
      "Capture what happened before it blurs together",
      "Build a personal archive you can revisit anytime",
      "Reconnect with moments you would have forgotten",
      "Just 5 minutes a day to preserve your own story",
    ],
  },
};

export function resolveFollowUpScreenKey(tags: ResonanceTag[]): FollowUpScreenKey {
  const set = new Set(tags);
  const has = (t: ResonanceTag) => set.has(t);

  if (has("time") && has("storytelling")) return "time_storytelling";

  const order: FollowUpScreenKey[] = [
    "storytelling",
    "family",
    "legacy",
    "self",
    "memory",
    "time",
    "presence",
    "habit",
  ];

  for (const key of order) {
    if (has(key as ResonanceTag)) return key;
  }

  return "habit";
}

export function getFollowUpCopy(key: FollowUpScreenKey): FollowUpScreenCopy {
  return COPY[key];
}
