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
import {
  trialExpiredEmail,
  trialExpiringEmail,
} from "../supabase/functions/_shared/email-templates/trial.ts";

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
