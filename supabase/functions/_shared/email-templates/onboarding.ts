import { emailLayout, ctaButton } from "./layout.ts";

interface OnboardingDay {
  emailKey: string;
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  cta: string;
}

const DAYS: OnboardingDay[] = [
  {
    emailKey: "onboarding-day-1",
    subject: "Capture your first moment",
    preheader: "It only takes a sentence.",
    heading: "Writing a moment",
    body: `
      <p style="margin:0 0 16px;">
        A moment does not have to be grand. It can be a good cup of coffee,
        a conversation that stuck with you, or something you noticed on a walk.
      </p>
      <p style="margin:0 0 16px;">
        Tap the compose button, write a sentence or two, and save.
        You can add a photo or record a voice note if you prefer.
      </p>
    `,
    cta: "Write a moment",
  },
  {
    emailKey: "onboarding-day-2",
    subject: "Try the Word Race",
    preheader: "90 seconds. One word. No thinking, just writing.",
    heading: "Crash & Burn",
    body: `
      <p style="margin:0 0 16px;">
        Some days the blank page feels heavy. The Word Race gives you a random
        word and 90 seconds on the clock. Write whatever comes to mind -- no
        editing, no backspace, just go.
      </p>
      <p style="margin:0 0 16px;">
        It is a fast way to get out of your head and onto the page.
      </p>
    `,
    cta: "Start a race",
  },
  {
    emailKey: "onboarding-day-3",
    subject: "Go deeper on a moment",
    preheader: "Talk through what you wrote with AI.",
    heading: "Dig Deeper",
    body: `
      <p style="margin:0 0 16px;">
        After you write a moment, you can tap "Dig Deeper" to have a
        conversation about it. The AI asks thoughtful follow-up questions
        to help you unpack what happened and why it mattered.
      </p>
      <p style="margin:0 0 16px;">
        It is like talking to a friend who actually listens.
      </p>
    `,
    cta: "Try Dig Deeper",
  },
  {
    emailKey: "onboarding-day-4",
    subject: "Rediscover an old photo",
    preheader: "Spin the wheel and see where it lands.",
    heading: "Rewind",
    body: `
      <p style="margin:0 0 16px;">
        Rewind pulls photos from your camera roll and lets you spin a wheel
        to land on a random one. When it stops, you can write the story
        behind that photo and save it as a moment.
      </p>
      <p style="margin:0 0 16px;">
        It is a good way to capture memories you forgot you had.
      </p>
    `,
    cta: "Spin the wheel",
  },
  {
    emailKey: "onboarding-day-5",
    subject: "Your time capsule is building",
    preheader: "Every moment you write lives here.",
    heading: "The Capsule",
    body: `
      <p style="margin:0 0 16px;">
        The Capsule tab is where all your moments collect over time. You can
        search, scroll, and browse through everything you have written.
      </p>
      <p style="margin:0 0 16px;">
        The more you write, the richer it gets. A few months from now you
        will be glad you started.
      </p>
    `,
    cta: "Open your Capsule",
  },
  {
    emailKey: "onboarding-day-6",
    subject: "Keep the streak going",
    preheader: "Small habits add up.",
    heading: "Streaks",
    body: `
      <p style="margin:0 0 16px;">
        Every day you write a moment, your streak grows. It is a simple
        counter, but it works -- it keeps you coming back.
      </p>
      <p style="margin:0 0 16px;">
        You do not need to write a lot. One sentence counts. The point is
        showing up.
      </p>
    `,
    cta: "Add today's moment",
  },
];

export function onboardingEmail(day: number): {
  emailKey: string;
  subject: string;
  html: string;
} | null {
  const d = DAYS[day - 1];
  if (!d) return null;

  return {
    emailKey: d.emailKey,
    subject: d.subject,
    html: emailLayout({
      preheader: d.preheader,
      body: `
        <p style="margin:0 0 8px;font-size:20px;font-weight:600;">${d.heading}</p>
        ${d.body}
        ${ctaButton(d.cta)}
      `,
    }),
  };
}

export const ONBOARDING_DAY_COUNT = DAYS.length;
