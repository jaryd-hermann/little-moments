import { greetingFirstName } from "./format.ts";
import { emailLayout, ctaButton } from "./layout.ts";

interface OnboardingDay {
  emailKey: string;
  subject: string;
  preheader: string;
  body: string;
  cta: string;
  closing: "talk-soon" | "thanks";
  ps?: string;
}

const DAYS: OnboardingDay[] = [
  {
    emailKey: "onboarding-day-1",
    subject: "Your word of the day is a door — walk through it",
    preheader: "One word. Two minutes. Capture something true.",
    body: `
      <p style="margin:0 0 16px;">
        Some days you'll get a <strong>single word</strong> as your starting point. Don't overthink it — let it unlock whatever memory or association it pulls up.
      </p>
      <p style="margin:0 0 16px;">
        The point isn't a perfect sentence. It's <strong>capture</strong>: something real, however rough. Talk it out, type a few lines, or both. Ellie may ask one focused follow-up to help shape what you said — still quick, still low pressure.
      </p>
      <p style="margin:0 0 16px;">
        Open the app and try today's starting point when you have two minutes.
      </p>
    `,
    cta: "Open Little Moments",
    closing: "talk-soon",
    ps: "Small honest beats polished empty. One line is enough.",
  },
  {
    emailKey: "onboarding-day-2",
    subject: "A photo you already took — with the story behind it",
    preheader: "Photo prompts: we never store your camera roll.",
    body: `
      <p style="margin:0 0 16px;">
        Other days you'll get a <strong>photo from your camera roll</strong> as the nudge. We use it on your device as a prompt — <strong>we don't store or upload your photos</strong>.
      </p>
      <p style="margin:0 0 16px;">
        Same focus as a word: <strong>what was happening, what you felt, what you'd forgotten</strong>. Not a caption for Instagram — a moment for you.
      </p>
      <p style="margin:0 0 16px;">
        Next time you see a photo prompt, give it two minutes and see what comes back.
      </p>
    `,
    cta: "Open Little Moments",
    closing: "talk-soon",
  },
  {
    emailKey: "onboarding-day-3",
    subject: "Same question, different answer",
    preheader: "Everyone sees the prompt — you find your moment.",
    body: `
      <p style="margin:0 0 16px;">
        Sometimes your starting point is a <strong>question of the day</strong> — the same prompt for everyone, but your answer is yours.
      </p>
      <p style="margin:0 0 16px;">
        Hunt for <strong>one little moment</strong> from the last few days worth saving: a conversation, a meal, something someone said, a small thing you'd otherwise forget.
      </p>
      <p style="margin:0 0 16px;">
        Epic optional. Specific wins. Capture it in the app when you can.
      </p>
    `,
    cta: "Open Little Moments",
    closing: "talk-soon",
  },
  {
    emailKey: "onboarding-day-4",
    subject: "Your moments, findable — Capsule and Flipbook",
    preheader: "Search your archive — or browse like a book.",
    body: `
      <p style="margin:0 0 16px;">
        Everything you save lives in your <strong>Capsule</strong> — a <strong>searchable archive</strong> of moments. Keywords, people, feelings, dates: find what you wrote months ago in seconds.
      </p>
      <p style="margin:0 0 16px;">
        When you want to wander instead of search, try <strong>Flipbook</strong> — flip through your memories visually and see the month or year come back in order.
      </p>
      <p style="margin:0 0 16px;">
        Spend a minute in Capsule today, even if you only have a few entries. The archive grows faster than you'd think.
      </p>
    `,
    cta: "Explore Capsule",
    closing: "talk-soon",
  },
  {
    emailKey: "onboarding-day-5",
    subject: "Each month becomes a Chapter",
    preheader: "A beautiful read-through of your month — shareable.",
    body: `
      <p style="margin:0 0 16px;">
        When you capture consistently, something accumulates: real material from your actual month.
      </p>
      <p style="margin:0 0 16px;">
        <strong>Chapters</strong> turn that into a <strong>beautiful, readable generation</strong> of your moments and photos — something you can sit with, look back on, or <strong>share with people you care about</strong>.
      </p>
      <p style="margin:0 0 16px;">
        You don't need polished entries — consistent little captures are enough. The Chapter meets you where you are.
      </p>
    `,
    cta: "Open Little Moments",
    closing: "talk-soon",
  },
  {
    emailKey: "onboarding-day-6",
    subject: "Beyond Chapters: Threads",
    preheader: "Ellie surfaces themes across your moments.",
    body: `
      <p style="margin:0 0 16px;">
        <strong>Threads</strong> go wider than a single day or month. Ellie looks across what you've captured to surface <strong>themes</strong> and <strong>insights</strong> — patterns and through-lines you might not notice when you're in the weeds.
      </p>
      <p style="margin:0 0 16px;">
        It's not magic — it's your own words, reflected back with distance. When a Thread shows up, it's worth the read.
      </p>
    `,
    cta: "Open Little Moments",
    closing: "talk-soon",
  },
  {
    emailKey: "onboarding-day-7",
    subject: "Share a moment with someone who matters",
    preheader: "Invite someone into a moment you choose — not your whole journal.",
    body: `
      <p style="margin:0 0 16px;">
        Some moments are meant to be shared — with a partner, a parent, a friend.
      </p>
      <p style="margin:0 0 16px;">
        Little Moments lets you <strong>share specific moments</strong> you pick, not your entire archive. It's a simple way to let someone in on a slice of your life.
      </p>
      <p style="margin:0 0 16px;">
        Next time you save something they'd appreciate, look for share from the moment.
      </p>
    `,
    cta: "Open Little Moments",
    closing: "talk-soon",
  },
  {
    emailKey: "onboarding-day-8",
    subject: "Little Moments Premium — what's included",
    preheader: "Chapters, deeper Capsule, connections, Threads.",
    body: `
      <p style="margin:0 0 16px;">
        <strong>Premium</strong> is for people who want the full arc: <strong>monthly Chapters</strong>, <strong>advanced Capsule search</strong>, <strong>memory connections</strong> across what you've saved, and <strong>Threads</strong> where your plan includes them.
      </p>
      <p style="margin:0 0 16px;">
        If you're happy on the free path, keep capturing — the daily habit matters most. If you want the synthesis layer on top, you'll see Premium when it's right in the app.
      </p>
    `,
    cta: "Open Little Moments",
    closing: "talk-soon",
  },
  {
    emailKey: "onboarding-day-9",
    subject: "I want your honest feedback",
    preheader: "Tap Feedback in the app or reply here — I read it.",
    body: `
      <p style="margin:0 0 16px;">
        I'm Jaryd. I'm building Little Moments in public and I want it to be genuinely useful — not just pretty in the App Store.
      </p>
      <p style="margin:0 0 16px;">
        If something confuses you, annoys you, or could be better: use <strong>Feedback</strong> in the app (tap the menu) or email me at <a href="mailto:hermannjaryd@gmail.com" style="color:#1A1A1A;">hermannjaryd@gmail.com</a>. I read every message I can.
      </p>
      <p style="margin:0 0 16px;">
        If you want to follow along as I ship: <a href="https://www.The-Diff.com" style="color:#1A1A1A;">The-Diff.com</a>
      </p>
    `,
    cta: "Open Little Moments",
    closing: "talk-soon",
  },
  {
    emailKey: "onboarding-day-10",
    subject: "If Little Moments has stuck with you…",
    preheader: "One friend or one rating helps more people find us.",
    body: `
      <p style="margin:0 0 16px;">
        If the app has been good to you, the most helpful things are small: <strong>tell one friend</strong> who might love the habit, or leave a <strong>rating on the App Store</strong> so more people discover us.
      </p>
      <p style="margin:0 0 16px;">
        No guilt if you're not in that place — thanks for being here either way.
      </p>
    `,
    cta: "Open Little Moments",
    closing: "thanks",
    ps: "Your streak and your archive are yours. Keep going.",
  },
];

export function onboardingEmail(
  day: number,
  opts?: { displayName?: string | null },
): {
  emailKey: string;
  subject: string;
  html: string;
} | null {
  const d = DAYS[day - 1];
  if (!d) return null;

  const who = greetingFirstName(opts?.displayName);
  const closingBlock =
    d.closing === "thanks"
      ? `<p style="margin:20px 0 0;">Jaryd</p>`
      : `<p style="margin:20px 0 0;">Talk soon,<br/>Jaryd</p>`;
  const psBlock = d.ps
    ? `<p style="margin:16px 0 0;color:rgba(0,0,0,0.65);font-size:15px;line-height:24px;"><em>P.S. ${d.ps}</em></p>`
    : "";

  return {
    emailKey: d.emailKey,
    subject: d.subject,
    html: emailLayout({
      preheader: d.preheader,
      body: `
        <p style="margin:0 0 16px;">Hey ${who},</p>
        ${d.body}
        ${ctaButton(d.cta)}
        ${closingBlock}
        ${psBlock}
      `,
    }),
  };
}

export const ONBOARDING_DAY_COUNT = DAYS.length;
