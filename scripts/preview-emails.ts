/**
 * Renders transactional email HTML to email-previews/ for browser review.
 *
 *   npm run email:preview
 *
 * Open email-previews/index.html in your browser.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  onboardingEmail,
  ONBOARDING_DAY_COUNT,
} from "../supabase/functions/_shared/email-templates/onboarding.ts";
import { welcomeEmail } from "../supabase/functions/_shared/email-templates/welcome.ts";
import { premiumWelcomeEmail } from "../supabase/functions/_shared/email-templates/premium-welcome.ts";
import {
  trialExpiredEmail,
  trialExpiringEmail,
} from "../supabase/functions/_shared/email-templates/trial.ts";
import {
  lifecycleEmail,
  LIFECYCLE_EVENT_KEYS,
} from "../supabase/functions/_shared/email-templates/lifecycle.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "email-previews");

interface Entry {
  file: string;
  label: string;
  html: string;
}

const entries: Entry[] = [];

function push(file: string, label: string, html: string) {
  entries.push({ file, label, html });
}

push(
  "welcome",
  "Welcome",
  welcomeEmail({ displayName: "Alex", causeTitle: "Environment" }).html,
);

push(
  "premium-welcome",
  "Premium welcome",
  premiumWelcomeEmail({ displayName: "Alex" }).html,
);

for (let day = 1; day <= ONBOARDING_DAY_COUNT; day++) {
  const o = onboardingEmail(day, { displayName: "Alex" });
  if (o) push(o.emailKey, `Onboarding day ${day}: ${o.subject}`, o.html);
}

const trialPreview = {
  displayName: "Alex",
  causeTitle: "Environment",
};

push(
  "trial-expiring-3d",
  "Trial expiring (3 days left)",
  trialExpiringEmail(3, trialPreview).html,
);
push(
  "trial-expiring-1d",
  "Trial expiring (1 day left)",
  trialExpiringEmail(1, trialPreview).html,
);
push(
  "trial-expired",
  "Trial expired",
  trialExpiredEmail(trialPreview).html,
);

// ---- Lifecycle (behavior-triggered) templates ----
// Pretty labels grouped by category so the index reads cleanly.
const LIFECYCLE_LABELS: Record<string, string> = {
  lifecycle_day1_starter: "Lifecycle · Day-1 starter (no captures yet)",
  lifecycle_dig_deeper: "Lifecycle · Dig Deeper",
  lifecycle_pin_album: "Lifecycle · Pin / album",
  lifecycle_sharing: "Lifecycle · Sharing",
  lifecycle_chapters_intro: "Lifecycle · Chapters intro",
  lifecycle_threads: "Lifecycle · Threads",
  lifecycle_brain: "Lifecycle · Brain graph",
  lifecycle_capsule: "Lifecycle · Capsule flipbook",
  lifecycle_premium_backstop: "Lifecycle · Premium backstop",

  premium_capsule_full: "Premium pitch · Capsule full (15 moments)",
  premium_chapters_proactive: "Premium pitch · Chapters proactive (4 + viewed)",
  premium_chapters_reactive: "Premium pitch · Chapters reactive (paywall bump)",
  premium_threads_proactive: "Premium pitch · Threads proactive (5 + viewed)",
  premium_threads_reactive: "Premium pitch · Threads reactive (paywall bump)",
  premium_album_5pins: "Premium pitch · Album (5 pins)",
  premium_album_15pins: "Premium pitch · Album (15 pins)",
  premium_album_25pins: "Premium pitch · Album (25 pins)",
  premium_album_50pins: "Premium pitch · Album (50 pins)",

  winback_d7: "Win-back · 7 days inactive",
  winback_d14: "Win-back · 14 days inactive",
  winback_d30: "Win-back · 30 days inactive",
};

for (const key of LIFECYCLE_EVENT_KEYS) {
  const tpl = lifecycleEmail(key, { displayName: "Alex" });
  if (!tpl) continue;
  const label = LIFECYCLE_LABELS[key] ?? key;
  push(key, `${label} — ${tpl.subject}`, tpl.html);
}

mkdirSync(outDir, { recursive: true });

for (const { file, html } of entries) {
  writeFileSync(join(outDir, `${file}.html`), html, "utf8");
}

const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Little Moments — email previews</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 42rem; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
    h1 { font-size: 1.25rem; }
    ul { list-style: none; padding: 0; margin: 0; }
    li { margin: 0.5rem 0; }
    a { color: #5b21b6; }
    p.note { color: #666; font-size: 0.9rem; margin-top: 2rem; }
  </style>
</head>
<body>
  <h1>Transactional email previews</h1>
  <p>Generated from <code>supabase/functions/_shared/email-templates</code>.</p>
  <ul>
${entries.map((e) => `    <li><a href="${e.file}.html">${e.label}</a></li>`).join("\n")}
  </ul>
  <p class="note">Re-run <code>npm run email:preview</code> after editing templates.</p>
</body>
</html>`;

writeFileSync(join(outDir, "index.html"), indexHtml, "utf8");

console.log(`Wrote ${entries.length} templates to email-previews/`);
console.log(`Open: ${join(outDir, "index.html")}`);
