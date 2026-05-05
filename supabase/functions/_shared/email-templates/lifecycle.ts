/**
 * Lifecycle email templates — behavior-triggered, NOT time-based.
 *
 * Each template has a stable `event_key` used for:
 *   - lifecycle_dispatches idempotency (one email per user per key)
 *   - cron-lifecycle-emails trigger-checker logic (see that function
 *     for the eligibility predicates).
 *
 * Copy aligns with the corresponding push (where one exists) so the
 * two channels reinforce instead of contradict. Tone is personal,
 * Jaryd-voiced, single CTA, optional P.S.
 *
 * Adding a new lifecycle email:
 *   1. Add a new entry to `LIFECYCLE_EMAILS` below.
 *   2. Add a trigger predicate in cron-lifecycle-emails/index.ts.
 *   3. Done — the dispatch helper takes care of idempotency.
 */
import { greetingFirstName } from "./format.ts";
import { emailLayout, ctaButton } from "./layout.ts";

interface LifecycleEmailDef {
  /** Stable identifier; also the lifecycle_dispatches event_key suffix. */
  eventKey: string;
  subject: string;
  preheader: string;
  body: string;
  cta: string;
  closing: "talk-soon" | "thanks";
  ps?: string;
}

const TEMPLATES: Record<string, LifecycleEmailDef> = {
  // NOTE: the welcome email is owned by `welcomeEmail` in
  // `_shared/email-templates/welcome.ts` and dispatched by
  // `send-welcome-email` (DB trigger on profile insert from migration
  // 0012). It's intentionally NOT in this map — every entry here is
  // fired by `cron-lifecycle-emails`, and we don't want a duplicate
  // welcome firing alongside the on-insert one.

  // ---------------- Day-1 starter ----------------
  // Trigger: account is 24h+ old AND total_moments = 0.
  lifecycle_day1_starter: {
    eventKey: "lifecycle_day1_starter",
    subject: "Today's the day",
    preheader: "60 seconds. One photo. That's it.",
    body: `
      <p style="margin:0 0 16px;">
        Most people sign up, mean to start, and then life moves. So before another day blurs by:
        <strong>60 seconds. One photo. That's it.</strong>
      </p>
      <p style="margin:0 0 16px;">
        Open the app, you'll see today's photo prompt, and you'll know what to say.
        Don't overthink it — your future self isn't grading you.
      </p>
    `,
    cta: "Capture today's moment",
    closing: "talk-soon",
    ps: "If today doesn't happen, tomorrow will. The bar really is this low.",
  },

  // ---------------- Dig Deeper ----------------
  // Trigger: total_moments >= 1 AND account_age_days >= 1 (i.e. a day
  // after first capture so they've had time to feel the loop).
  lifecycle_dig_deeper: {
    eventKey: "lifecycle_dig_deeper",
    subject: "Stay on the good ones a little longer",
    preheader: "Dig Deeper turns a moment into a memory.",
    body: `
      <p style="margin:0 0 16px;">
        When a moment feels worth keeping, hit <strong>Dig Deeper</strong>.
      </p>
      <p style="margin:0 0 16px;">
        Ellie will ask a couple of gentle follow-ups — the kind that pull out the thing you
        almost forgot to mention. The smell, the look on their face, why it mattered.
      </p>
      <p style="margin:0 0 16px;">
        That's the difference between a note and something you can step back into.
      </p>
    `,
    cta: "Dig deeper on a moment",
    closing: "talk-soon",
  },

  // ---------------- Pin / album intro ----------------
  // Trigger: total_moments >= 3 AND total_pinned = 0.
  lifecycle_pin_album: {
    eventKey: "lifecycle_pin_album",
    subject: "Pin the ones that mattered",
    preheader: "Your favorites become a real, printed book.",
    body: `
      <p style="margin:0 0 16px;">
        See a moment you don't want to lose? <strong>Pin it.</strong>
      </p>
      <p style="margin:0 0 16px;">
        Pinned moments float to the top of your capsule — and over time they become
        <strong>a printed album</strong>, mailed to you. A real keepsake, made entirely from the
        bits of life you already chose to keep.
      </p>
      <p style="margin:0 0 16px;">
        You curate. The book writes itself.
      </p>
    `,
    cta: "Pin a favorite",
    closing: "talk-soon",
    ps: "The pinned ones are the ones I re-read years later. Choose generously.",
  },

  // ---------------- Sharing ----------------
  // Trigger: total_moments >= 5 (we don't currently track shares
  // server-side beyond the row in shared_entries — checked in the cron).
  lifecycle_sharing: {
    eventKey: "lifecycle_sharing",
    subject: "Some moments belong to two people",
    preheader: "Share a moment with someone who'd want it too.",
    body: `
      <p style="margin:0 0 16px;">
        Not every moment is just yours. The dinner with your dad. The thing your kid said
        you don't want to forget alone.
      </p>
      <p style="margin:0 0 16px;">
        In any moment, tap <strong>Share</strong> to send it to someone you love. They can react,
        add their side of it, or just keep it.
      </p>
      <p style="margin:0 0 16px;">
        A small, private feed instead of another group chat that disappears.
      </p>
    `,
    cta: "Share a moment",
    closing: "talk-soon",
  },

  // ---------------- Chapters intro ----------------
  // Trigger: total_moments >= 4 in current ISO week AND total_chapters = 0.
  lifecycle_chapters_intro: {
    eventKey: "lifecycle_chapters_intro",
    subject: "Your week, written for you",
    preheader: "Every Sunday — a chapter from your moments.",
    body: `
      <p style="margin:0 0 16px;">
        Once you've captured a handful of moments in a week, something nice happens:
        <strong>we write your chapter</strong>.
      </p>
      <p style="margin:0 0 16px;">
        Every Sunday you get a short, narrated piece pulled from what you logged — your week,
        told back to you in your own words. Not a summary. The story you almost didn't notice
        you were living.
      </p>
      <p style="margin:0 0 16px;">
        The more you capture, the better it gets.
      </p>
    `,
    cta: "Add to this week's chapter",
    closing: "talk-soon",
  },

  // ---------------- Threads ----------------
  // Trigger: 1+ thread surfaced AND account_age_days >= 1 since first
  // thread (so they've felt the surprise in-app first).
  lifecycle_threads: {
    eventKey: "lifecycle_threads",
    subject: "Patterns you didn't know you had",
    preheader: "Threads stitch your moments together.",
    body: `
      <p style="margin:0 0 16px;">
        Capture for a few weeks and themes start to surface on their own — a person who keeps
        showing up, a feeling that won't leave, a place that means more than you thought.
      </p>
      <p style="margin:0 0 16px;">
        Those are <strong>Threads</strong>. They appear quietly when we spot a pattern. Pull on
        one and you'll see every related moment, in order.
      </p>
      <p style="margin:0 0 16px;">
        This is the part where the archive starts feeling alive. Keep an eye out.
      </p>
    `,
    cta: "See your threads",
    closing: "talk-soon",
  },

  // ---------------- Brain graph ----------------
  // Trigger: total_moments >= 10.
  lifecycle_brain: {
    eventKey: "lifecycle_brain",
    subject: "Your brain, on a wall",
    preheader: "Every moment, every connection, in one view.",
    body: `
      <p style="margin:0 0 16px;">
        Open the <strong>Brain</strong> tab and you'll see something that looks like a
        constellation — every moment you've captured, every person, every theme, all linked.
      </p>
      <p style="margin:0 0 16px;">
        Tap a node (a name, a place, a feeling) and the related moments light up around it.
      </p>
      <p style="margin:0 0 16px;">
        It's the most fun way to find something you half-remember.
      </p>
    `,
    cta: "Open your brain",
    closing: "talk-soon",
  },

  // ---------------- Capsule flipbook ----------------
  // Trigger: total_moments >= 15.
  lifecycle_capsule: {
    eventKey: "lifecycle_capsule",
    subject: "A flipbook of your life",
    preheader: "Your capsule, one swipe at a time.",
    body: `
      <p style="margin:0 0 16px;">
        Your <strong>Capsule</strong> is the easiest way to look back. Open it and flip — one
        moment per page. Photo, voice, line. Done.
      </p>
      <p style="margin:0 0 16px;">
        Fifteen seconds a day looking back is wildly different than zero. You'll be surprised
        what last month feels like to revisit.
      </p>
    `,
    cta: "Flip through your capsule",
    closing: "talk-soon",
  },

  // ---------------- Premium backstop ----------------
  // Trigger: total_moments >= 20 AND subscription_status = 'free'
  // AND no premium_* event in lifecycle_dispatches in last 14 days.
  // This is the "we still haven't pitched you anything specific" net.
  lifecycle_premium_backstop: {
    eventKey: "lifecycle_premium_backstop",
    subject: "Should you go premium?",
    preheader: "Honest answer below.",
    body: `
      <p style="margin:0 0 16px;">
        A few people have asked, so — straight up:
      </p>
      <p style="margin:0 0 16px;">
        <strong>Free is a real product.</strong> Capture forever, no limits on the basics.
      </p>
      <p style="margin:0 0 16px;">
        <strong>Premium</strong> is for people who want the printed album, more weekly chapters,
        unlimited Dig Deepers, the full Threads + Brain graph, and the satisfaction of helping
        me build this without ads — ever.
      </p>
      <p style="margin:0 0 16px;">
        If you're not sure yet, no rush. The habit matters more than the upgrade.
      </p>
    `,
    cta: "Try premium",
    closing: "talk-soon",
    ps: "Honestly, the album alone has been worth it for me. Yours will look better than mine.",
  },

  // ---------------- Premium pitches (4 conversion triggers) ----------------

  // (a) Capsule filling up — total_moments >= 15, free
  premium_capsule_full: {
    eventKey: "premium_capsule_full",
    subject: "Your capsule is filling up",
    preheader: "Keep it forever.",
    body: `
      <p style="margin:0 0 16px;">
        Fifteen moments. That's already more than most people remember from a typical month.
      </p>
      <p style="margin:0 0 16px;">
        <strong>Premium</strong> keeps your capsule yours, forever — full archive,
        full search, full Brain graph. Plus everything else (Threads, longer chapters,
        printed album discount).
      </p>
      <p style="margin:0 0 16px;">
        Annual plan unlocks the most value, including the biggest discount on the printed book.
      </p>
    `,
    cta: "Go premium",
    closing: "talk-soon",
  },

  // (b1) Chapters proactive — 4 generated, ≥1 viewed, free
  premium_chapters_proactive: {
    eventKey: "premium_chapters_proactive",
    subject: "Keep getting your chapters",
    preheader: "You've read 4. Don't stop now.",
    body: `
      <p style="margin:0 0 16px;">
        You've got 4 weekly chapters. You've actually <em>read</em> at least one of them.
        That's not a coincidence — they're starting to feel like yours.
      </p>
      <p style="margin:0 0 16px;">
        Keep them coming. <strong>Premium</strong> unlocks unlimited chapters every Sunday,
        plus the full Threads system, Brain graph, and a printed-album discount.
      </p>
      <p style="margin:0 0 16px;">
        Annual is the best value — most readers stick with their chapter habit for years.
      </p>
    `,
    cta: "Unlock all chapters",
    closing: "talk-soon",
  },

  // (b2) Chapters reactive — paywall bumped on locked chapter
  premium_chapters_reactive: {
    eventKey: "premium_chapters_reactive",
    subject: "About that chapter you tried to open",
    preheader: "It's there waiting.",
    body: `
      <p style="margin:0 0 16px;">
        You tapped a chapter and hit a wall. That chapter is yours — written from your
        moments — and it stays in your account either way.
      </p>
      <p style="margin:0 0 16px;">
        <strong>Premium</strong> unlocks every chapter, every Sunday, forever. Annual gets you
        the best price plus the printed-album discount.
      </p>
    `,
    cta: "Open your chapter",
    closing: "talk-soon",
  },

  // (c1) Threads proactive — 5 surfaced, ≥1 viewed, free
  premium_threads_proactive: {
    eventKey: "premium_threads_proactive",
    subject: "Ellie's still finding patterns",
    preheader: "Don't stop her now.",
    body: `
      <p style="margin:0 0 16px;">
        Five threads so far. You've actually opened at least one — that's the part most
        people don't get to.
      </p>
      <p style="margin:0 0 16px;">
        <strong>Premium</strong> unlocks unlimited Threads, plus the full Brain graph,
        unlimited chapters, and a printed-album discount.
      </p>
      <p style="margin:0 0 16px;">
        Annual is the smart pick — Threads compound the longer you've been logging.
      </p>
    `,
    cta: "Unlock Threads",
    closing: "talk-soon",
  },

  // (c2) Threads reactive — paywall bumped on locked thread
  premium_threads_reactive: {
    eventKey: "premium_threads_reactive",
    subject: "There's a thread you couldn't open",
    preheader: "It's still there.",
    body: `
      <p style="margin:0 0 16px;">
        You tapped a thread and hit a wall. Ellie wrote it for you — connecting two of your
        moments — and it doesn't go anywhere.
      </p>
      <p style="margin:0 0 16px;">
        <strong>Premium</strong> unlocks every thread Ellie ever finds across your archive.
        Annual gets you the best price.
      </p>
    `,
    cta: "Open your thread",
    closing: "talk-soon",
  },

  // (d.5) Album — 5 pins
  premium_album_5pins: {
    eventKey: "premium_album_5pins",
    subject: "You've started building an album",
    preheader: "5 pinned moments. Keep going.",
    body: `
      <p style="margin:0 0 16px;">
        Five pins. That's the start of an album.
      </p>
      <p style="margin:0 0 16px;">
        Pinned moments become a printed book — a real keepsake, mailed to you.
        <strong>Premium annual</strong> includes the biggest discount on the print, so the more
        you pin, the more your subscription is paying for itself.
      </p>
    `,
    cta: "See annual pricing",
    closing: "talk-soon",
  },

  // (d.15) Album — 15 pins
  premium_album_15pins: {
    eventKey: "premium_album_15pins",
    subject: "15 pinned. This is starting to look like a book.",
    preheader: "Save on the print with annual.",
    body: `
      <p style="margin:0 0 16px;">
        Fifteen moments worth keeping. That's a chapter of an album, easily.
      </p>
      <p style="margin:0 0 16px;">
        <strong>Premium annual</strong> includes the biggest discount on the printed album —
        and it's the same price whether you have 15 pins or 150 by the time you order.
      </p>
    `,
    cta: "See annual pricing",
    closing: "talk-soon",
  },

  // (d.25) Album — 25 pins
  premium_album_25pins: {
    eventKey: "premium_album_25pins",
    subject: "Album-worthy",
    preheader: "25 pins is a real keepsake.",
    body: `
      <p style="margin:0 0 16px;">
        Twenty-five pinned moments. Honestly, you could print the album today.
      </p>
      <p style="margin:0 0 16px;">
        <strong>Premium annual</strong> includes the biggest discount on the printed book.
        At this point, it pays for itself.
      </p>
    `,
    cta: "Lock in annual",
    closing: "talk-soon",
  },

  // (d.50) Album — 50 pins
  premium_album_50pins: {
    eventKey: "premium_album_50pins",
    subject: "Time to print this",
    preheader: "50 pins. Your album is ready.",
    body: `
      <p style="margin:0 0 16px;">
        Fifty pinned moments. The album writes itself at this point.
      </p>
      <p style="margin:0 0 16px;">
        <strong>Premium annual</strong> gets you the biggest discount on the printed book.
        I'd genuinely love to see yours when it ships.
      </p>
    `,
    cta: "Print my album",
    closing: "talk-soon",
  },

  // ---------------- Win-back (D7 / D14 / D30) ----------------
  // Trigger: days_since_last_capture in {7, 14, 30}.

  winback_d7: {
    eventKey: "winback_d7",
    subject: "A week, no nudge from you",
    preheader: "Still here when you are.",
    body: `
      <p style="margin:0 0 16px;">
        It's been about a week since your last moment. No guilt — life moves.
      </p>
      <p style="margin:0 0 16px;">
        I just wanted to say: <strong>everything you've captured is still here</strong>.
        Whenever you come back, the rhythm picks up where you left off.
      </p>
      <p style="margin:0 0 16px;">
        If you want a soft re-entry, just open the app — today's photo prompt is waiting.
      </p>
    `,
    cta: "Capture a moment",
    closing: "talk-soon",
  },

  winback_d14: {
    eventKey: "winback_d14",
    subject: "Two weeks",
    preheader: "What's getting in the way?",
    body: `
      <p style="margin:0 0 16px;">
        Two weeks since your last capture. I'm Jaryd, the one who built this — and I'm
        genuinely curious what's getting in the way.
      </p>
      <p style="margin:0 0 16px;">
        Daily nudge time wrong? App not the right shape? Life just busy?
        Reply to this email and tell me. I read every one.
      </p>
      <p style="margin:0 0 16px;">
        Either way, your archive is yours forever — no pressure.
      </p>
    `,
    cta: "Open Little Moments",
    closing: "talk-soon",
  },

  winback_d30: {
    eventKey: "winback_d30",
    subject: "We'll keep these for you",
    preheader: "Pause notifications anytime.",
    body: `
      <p style="margin:0 0 16px;">
        A month without a moment. That's totally fine.
      </p>
      <p style="margin:0 0 16px;">
        Your past entries are still safe and won't go anywhere. If the daily nudges are noise
        right now, you can pause them in <strong>Settings</strong> — no offense taken.
      </p>
      <p style="margin:0 0 16px;">
        And if you ever want to come back: today's photo is still there waiting.
      </p>
    `,
    cta: "Open Little Moments",
    closing: "talk-soon",
  },
};

export type LifecycleEventKey = keyof typeof TEMPLATES;

export function lifecycleEmail(
  eventKey: string,
  opts?: { displayName?: string | null },
): { subject: string; html: string } | null {
  const def = TEMPLATES[eventKey];
  if (!def) return null;

  const who = greetingFirstName(opts?.displayName);
  const closingBlock = def.closing === "thanks"
    ? `<p style="margin:20px 0 0;">Jaryd</p>`
    : `<p style="margin:20px 0 0;">Talk soon,<br/>Jaryd</p>`;
  const psBlock = def.ps
    ? `<p style="margin:16px 0 0;color:rgba(0,0,0,0.65);font-size:15px;line-height:24px;"><em>P.S. ${def.ps}</em></p>`
    : "";

  return {
    subject: def.subject,
    html: emailLayout({
      preheader: def.preheader,
      body: `
        <p style="margin:0 0 16px;">Hey ${who},</p>
        ${def.body}
        ${ctaButton(def.cta)}
        ${closingBlock}
        ${psBlock}
      `,
    }),
  };
}

export const LIFECYCLE_EVENT_KEYS = Object.keys(TEMPLATES);
