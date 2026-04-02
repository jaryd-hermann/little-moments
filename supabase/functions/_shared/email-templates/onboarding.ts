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
    subject: "The two-minute thing that changes how you see your days",
    preheader: "One question a night. About two minutes. Here's why it works.",
    body: `
      <p style="margin:0 0 16px;">
        So here's the honest version of what Little Moments is.
      </p>
      <p style="margin:0 0 16px;">
        Each night, you answer one question: what was the most interesting thing that happened today? Not the most impressive. Not the most dramatic. Just the thing that made today different from yesterday.
      </p>
      <p style="margin:0 0 16px;">
        You can type it. You can talk it out and we'll transcribe it. You can drop in a photo and write a line about what was happening. However you want to do it — it takes about two minutes.
      </p>
      <p style="margin:0 0 16px;">
        The strange thing is what happens after a few weeks. You start noticing things during the day because you know you'll have to pick something tonight. Your attention shifts. Days stop blurring. You start actually living inside them instead of moving through them.
      </p>
      <p style="margin:0 0 16px;">
        I know that sounds like a lot to promise from two minutes. But I've seen it happen — including to me.
      </p>
      <p style="margin:0 0 16px;">
        Your only job today: open the app and add a moment. One line is plenty. Just something real.
      </p>
    `,
    cta: "Open Little Moments",
    closing: "talk-soon",
    ps: "The streak starts with tonight. No pressure — but there's something satisfying about a day-one entry that just says \"I started.\"",
  },
  {
    emailKey: "onboarding-day-2",
    subject: "The feature that turns your moments into actual stories",
    preheader: "Dig Deeper pulls the story out of what you already wrote.",
    body: `
      <p style="margin:0 0 16px;">
        So you've got a moment or two captured. Good.
      </p>
      <p style="margin:0 0 16px;">
        Here's where it starts to get interesting.
      </p>
      <p style="margin:0 0 16px;">
        Inside the app there's a feature called <strong>Dig Deeper</strong>. Once you've logged a moment, Dig Deeper asks you a few follow-up questions about it — things like: what were you actually feeling? What changed? What would you have told someone about this over dinner?
      </p>
      <p style="margin:0 0 16px;">
        The goal isn't to make you write more. It's to pull out the story that's already inside the moment you captured.
      </p>
      <p style="margin:0 0 16px;">
        Because here's something I've come to believe: most people think they're not good storytellers because they don't have interesting things happen to them. That's not the problem. The problem is they haven't learned to look closely at the things that do. Dig Deeper is basically a structured way to look closely.
      </p>
      <p style="margin:0 0 16px;">
        The stories you tell at work, with friends, with family — they get better when you know how to find the good detail, the moment of change, the thing that actually makes someone lean in. Dig Deeper is practice for that.
      </p>
      <p style="margin:0 0 16px;">
        Try it on your last moment. You might surprise yourself.
      </p>
    `,
    cta: "Try Dig Deeper",
    closing: "talk-soon",
  },
  {
    emailKey: "onboarding-day-3",
    subject: "Your memory is better than you think. Here's proof.",
    preheader: "When your mind goes blank, Memory Jog sends you sideways into a real memory.",
    body: `
      <p style="margin:0 0 16px;">
        Some nights you'll open the app and your mind goes blank. Nothing happened today. Or nothing worth writing about.
      </p>
      <p style="margin:0 0 16px;">
        This is normal. And it's not true.
      </p>
      <p style="margin:0 0 16px;">
        That's what <strong>Memory Jog</strong> is for.
      </p>
      <p style="margin:0 0 16px;">
        Here's how it works: we give you a single random word. Could be anything — \"stairs,\" \"red,\" \"August.\" You look at the word, let it land, and see what memory it knocks loose. Then you follow that memory wherever it goes. One thing connects to another. You end up somewhere you didn't expect.
      </p>
      <p style="margin:0 0 16px;">
        The reason a random word works better than \"think of a memory\" is that your brain stores things by association, not by date. A direct question narrows you down. A random word sends you sideways — into memories you forgot you had.
      </p>
      <p style="margin:0 0 16px;">
        People are genuinely surprised by what surfaces. Not just the memory itself, but how vivid it is. How much feeling is still attached to it.
      </p>
      <p style="margin:0 0 16px;">
        You can swap the word anytime if it's not sparking anything. But give it a few seconds first. The slow burn is usually the one worth following.
      </p>
      <p style="margin:0 0 16px;">
        Tonight, try Memory Jog — even if you have something to write about already.
      </p>
    `,
    cta: "Try Memory Jog",
    closing: "talk-soon",
  },
  {
    emailKey: "onboarding-day-4",
    subject: "The stories hiding in your camera roll",
    preheader: "Rewind pairs old photos with the story the picture can't show.",
    body: `
      <p style="margin:0 0 16px;">
        Quick one today — because this feature explains itself once you see it.
      </p>
      <p style="margin:0 0 16px;">
        <strong>Rewind</strong> surfaces old photos from your camera roll — from a year ago, five years ago, whatever — and invites you to add a moment to them. Not a caption. A real memory. What was happening that day. What you were feeling. What you'd forgotten until right now.
      </p>
      <p style="margin:0 0 16px;">
        Photos are incredible time machines, but most of them just sit in your camera roll getting buried. Rewind gives them a story layer — the part that the photo can't show.
      </p>
      <p style="margin:0 0 16px;">
        It's also one of the best ways to build your moment archive without starting from scratch tonight. You've already lived thousands of story-worthy days. A lot of the evidence is right there in your photos, waiting.
      </p>
      <p style="margin:0 0 16px;">
        Spend five minutes with Rewind today. Dig up something from a year or two ago. See what comes back.
      </p>
    `,
    cta: "Open Rewind",
    closing: "talk-soon",
  },
  {
    emailKey: "onboarding-day-5",
    subject: "Every moment you've ever saved, instantly findable",
    preheader: "Capsule is built to revisit — not just capture once and forget.",
    body: `
      <p style="margin:0 0 16px;">
        By now you've got a handful of moments in the app. Maybe more.
      </p>
      <p style="margin:0 0 16px;">
        Here's something worth knowing about where they live.
      </p>
      <p style="margin:0 0 16px;">
        <strong>Capsule</strong> is your searchable memory archive — every moment you've ever captured, organized and searchable by date, keyword, feeling, person, place. Looking for everything you wrote about your dad? Search it. Want to find that moment from last March you barely remember? It's there.
      </p>
      <p style="margin:0 0 16px;">
        Most journals are linear. You write forward and never look back. Capsule is built to be revisited — because the value of this practice isn't just in the capturing. It's in the returning.
      </p>
      <p style="margin:0 0 16px;">
        One of my favorite things to do is pick a random month from a year ago and read through what I was noticing then. It feels like reading a letter from a version of yourself you'd almost forgotten. The small stuff you recorded — stuff you wouldn't have remembered otherwise — is suddenly right there, completely vivid.
      </p>
      <p style="margin:0 0 16px;">
        Take a few minutes today to explore Capsule. Even with just a few entries it's worth seeing how the archive is starting to take shape.
      </p>
    `,
    cta: "Explore Capsule",
    closing: "talk-soon",
  },
  {
    emailKey: "onboarding-day-6",
    subject: "We'll turn your moments into something beautiful",
    preheader: "Log through the month — we build you a Chapter at the end.",
    body: `
      <p style="margin:0 0 16px;">
        Last one in this series — and I think it's the best one.
      </p>
      <p style="margin:0 0 16px;">
        If you keep logging moments consistently throughout the month, something happens at the end of it: we take everything you've captured and build you a <strong>Chapter</strong>.
      </p>
      <p style="margin:0 0 16px;">
        A Chapter is a beautifully designed, narrative version of your month — connecting your moments into a real story, finding the threads you didn't notice while you were living them, and giving you something you can actually read, share, or keep.
      </p>
      <p style="margin:0 0 16px;">
        It's not a summary. It's not a timeline. It's a story — written from your own words and moments, shaped into something worth returning to.
      </p>
      <p style="margin:0 0 16px;">
        The people who get the most out of Chapters are the ones who don't aim for perfect entries. They just capture consistently — a line here, a photo there, a voice memo on the commute. The raw material doesn't have to be polished. We'll do the rest.
      </p>
      <p style="margin:0 0 16px;">
        A year from now you'll have twelve Chapters. Twelve months of your actual life, written down, beautiful, yours.
      </p>
      <p style="margin:0 0 16px;">
        That's what this is all about.
      </p>
      <p style="margin:0 0 16px;">
        Thanks for being here. I mean that.
      </p>
    `,
    cta: "Open Little Moments",
    closing: "thanks",
    ps: "Keep going. The first week is always the hardest part of any habit. You're already through it.",
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
