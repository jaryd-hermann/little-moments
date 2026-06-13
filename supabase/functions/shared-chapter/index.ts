import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SHARE_PUBLIC_BASE = "https://getlittlemoments.com/share/chapter";
const APP_STORE_URL =
  "https://apps.apple.com/us/app/little-moments-a-2min-journal/id6761054988";
const WORDMARK_URL =
  "https://smwmkeoljqnifaoqzemb.supabase.co/storage/v1/object/public/brand/wordmark-little-moments-black.png";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th", "6th"];

function monthName(month: number): string {
  return MONTH_NAMES[(month - 1) % 12] ?? `Month ${month}`;
}

function weekOfMonthLabel(weekStartIso: string | null): string {
  if (!weekStartIso) return "";
  const d = new Date(`${weekStartIso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  const month = d.getUTCMonth();
  const year = d.getUTCFullYear();
  const first = new Date(Date.UTC(year, month, 1));
  const dow = first.getUTCDay();
  const offset = ((1 - dow) + 7) % 7;
  const firstMonday = new Date(Date.UTC(year, month, 1 + offset));
  const diffDays = Math.round(
    (d.getTime() - firstMonday.getTime()) / (1000 * 60 * 60 * 24)
  );
  const weekNum = Math.max(1, Math.floor(diffDays / 7) + 1);
  const ord = ORDINALS[weekNum] ?? `${weekNum}th`;
  return `${ord} week of ${monthName(month + 1)}`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getPublicMediaUrl(storagePath: string): string {
  if (/^https?:\/\//i.test(storagePath)) return storagePath;
  return `${SUPABASE_URL}/storage/v1/object/public/entry-media/${storagePath}`;
}

function safeAvatarSrc(url: string | null | undefined): string | null {
  const u = url?.trim();
  if (!u || !/^https:\/\//i.test(u)) return null;
  return u;
}

function sharerDisplayName(displayName: string | null | undefined): string | null {
  const n = displayName?.trim();
  if (!n) return null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(n)) return null;
  return n;
}

// Mirrors the in-app `RichBody` parser: wrap *foo* in <em>foo</em>.
function renderRichBody(text: string): string {
  const parts = text.split(/(\*[^*]+\*)/g);
  return parts
    .map((part) => {
      if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
        return `<em>${escapeHtml(part.slice(1, -1))}</em>`;
      }
      return escapeHtml(part);
    })
    .join("");
}

type ChapterRow = {
  chapter_number: number;
  ref_year: number | null;
  ref_month: number | null;
  ref_week_start_date: string | null;
  moment_count: number;
  slides: unknown;
  image_slide: unknown;
};

type ImageSlide = {
  layout: "v1" | "v2" | "v3" | "v4" | "v5";
  storage_paths: string[];
};

function parseImageSlide(raw: unknown): ImageSlide | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.layout !== "string" ||
    !Array.isArray(r.storage_paths) ||
    r.storage_paths.length === 0
  ) {
    return null;
  }
  return {
    layout: r.layout as ImageSlide["layout"],
    storage_paths: r.storage_paths as string[],
  };
}

function parseTextSlides(raw: unknown): { body: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { body: string }[] = [];
  for (const s of raw) {
    if (s && typeof s === "object" && typeof (s as { body?: unknown }).body === "string") {
      out.push({ body: (s as { body: string }).body });
    }
  }
  return out;
}

function chapterTitleLabel(chapter: ChapterRow): string {
  if (chapter.ref_week_start_date) return weekOfMonthLabel(chapter.ref_week_start_date);
  if (chapter.ref_month != null) return monthName(chapter.ref_month);
  return "";
}

// Replicate the React Native image-slide layouts as inline-styled HTML
// blocks. The CSS in the page styles each `.img-layout-*` correctly.
function renderImageSlide(slide: ImageSlide): string {
  const uris = slide.storage_paths.map(getPublicMediaUrl);
  const img = (u: string, extra = "") =>
    `<img src="${escapeHtml(u)}" alt="" loading="lazy"${extra ? ` ${extra}` : ""}>`;

  switch (slide.layout) {
    case "v1":
      return `<div class="img-layout-v1">${img(uris[0])}</div>`;
    case "v2":
      return `<div class="img-layout-v2">${img(uris[0])}${img(uris[1])}</div>`;
    case "v3":
      return `<div class="img-layout-v3">
        <div class="col">${img(uris[0])}</div>
        <div class="col stack">${img(uris[1])}${img(uris[2])}</div>
      </div>`;
    case "v4":
      return `<div class="img-layout-v4">
        <div class="row">${img(uris[0])}${img(uris[1])}</div>
        <div class="row">${img(uris[2])}${img(uris[3])}</div>
      </div>`;
    case "v5":
    default: {
      const left = uris.filter((_, i) => i % 2 === 0).map((u) => img(u)).join("");
      const right = uris.filter((_, i) => i % 2 === 1).map((u) => img(u)).join("");
      return `<div class="img-layout-v5">
        <div class="col">${left}</div>
        <div class="col">${right}</div>
      </div>`;
    }
  }
}

function renderSharerByline(name: string | null, avatarUrl: string | null): string {
  const imgSrc = safeAvatarSrc(avatarUrl);
  const showName = !!name;
  if (!imgSrc && !showName) return "";

  const imgBlock = imgSrc
    ? `<img src="${escapeHtml(imgSrc)}" alt="" class="byline-avatar" loading="lazy">`
    : "";
  const nameBlock = showName
    ? `<span class="byline-name">${escapeHtml(name!)}</span>`
    : "";
  return `<div class="byline">${imgBlock}${nameBlock}</div>`;
}

function renderPage(
  chapter: ChapterRow,
  sharer: { displayName: string | null; avatarUrl: string | null },
  shareUrl: string
): string {
  const label = chapterTitleLabel(chapter);
  const titleText = `Chapter ${chapter.chapter_number}${label ? `: ${label}` : ""}`;
  const ogDescription = `${chapter.moment_count} moments captured · ${titleText}`;

  const imageSlide = parseImageSlide(chapter.image_slide);
  const textSlides = parseTextSlides(chapter.slides);
  const ogImageUrl = imageSlide && imageSlide.storage_paths.length > 0
    ? getPublicMediaUrl(imageSlide.storage_paths[0])
    : "";

  const bylineHtml = renderSharerByline(sharer.displayName, sharer.avatarUrl);

  // Intro copy: prefer first name when we have a real display name, otherwise fall back.
  const firstName = sharer.displayName?.trim().split(/\s+/)[0] ?? "";
  const introWho = firstName
    ? `${escapeHtml(firstName)} has shared`
    : `Someone has shared`;
  const introHtml = `${introWho} <span class="accent">a Chapter</span> of their life with you`;

  // Build slides: cover + text slides + (optional) image slide.
  const slideHtml: string[] = [];

  slideHtml.push(`
    <section class="slide cover">
      <div class="cover-inner">
        <div class="eyebrow">Chapter ${chapter.chapter_number}</div>
        <h1 class="cover-title">${escapeHtml(label)}</h1>
        <div class="divider"></div>
        <div class="cover-count">${chapter.moment_count}</div>
        <div class="cover-count-label">moments captured</div>
        ${bylineHtml}
      </div>
    </section>
  `);

  for (const s of textSlides) {
    slideHtml.push(`
      <section class="slide text">
        <div class="text-inner">
          <p class="rich-body">${renderRichBody(s.body)}</p>
        </div>
      </section>
    `);
  }

  if (imageSlide) {
    slideHtml.push(`
      <section class="slide image">
        <div class="image-inner">
          ${renderImageSlide(imageSlide)}
        </div>
      </section>
    `);
  }

  const totalSlides = slideHtml.length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#0A0A0A">
  <title>${escapeHtml(titleText)} \u2014 Little Moments</title>

  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(titleText)}">
  <meta property="og:description" content="${escapeHtml(ogDescription)}">
  <meta property="og:url" content="${escapeHtml(shareUrl)}">
  ${ogImageUrl ? `<meta property="og:image" content="${escapeHtml(ogImageUrl)}">` : ""}
  <meta property="og:site_name" content="Little Moments">

  <meta name="twitter:card" content="${ogImageUrl ? "summary_large_image" : "summary"}">
  <meta name="twitter:title" content="${escapeHtml(titleText)}">
  <meta name="twitter:description" content="${escapeHtml(ogDescription)}">
  ${ogImageUrl ? `<meta name="twitter:image" content="${escapeHtml(ogImageUrl)}">` : ""}

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Roboto:wght@300;400;500&display=swap" rel="stylesheet">

  <style>
    :root {
      --bg: #0A0A0A;
      --text: #FFFFFF;
      --muted: rgba(255,255,255,0.5);
      --bar: rgba(255,255,255,0.3);
      --cta-bg: #F0D7FF;
      --cta-ink: #1A1A1A;
      --cream: #FFFFEB;
    }

    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    html, body { height: 100%; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Libre Baskerville', Georgia, serif;
      -webkit-font-smoothing: antialiased;
      overflow: hidden;
    }

    .stage {
      position: fixed;
      inset: 0;
      display: flex;
      flex-direction: column;
      max-width: 600px;
      margin: 0 auto;
    }

    /* Progress bars */
    .progress-row {
      display: flex;
      gap: 4px;
      padding: calc(env(safe-area-inset-top, 0px) + 12px) 16px 8px;
    }
    .progress-bar {
      flex: 1;
      height: 2px;
      border-radius: 1px;
      background: var(--bar);
      overflow: hidden;
    }
    .progress-bar > span {
      display: block;
      height: 100%;
      border-radius: 1px;
      background: var(--text);
      width: 0%;
      transition: width 200ms ease-out;
    }
    .progress-bar.active > span,
    .progress-bar.filled > span { width: 100%; }

    .close-btn {
      position: absolute;
      top: calc(env(safe-area-inset-top, 0px) + 10px);
      right: 12px;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: var(--text);
      font-size: 18px;
      font-weight: 700;
      background: transparent;
      border: none;
      z-index: 50;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    }

    /* Slide stage */
    .slides {
      flex: 1;
      position: relative;
      overflow: hidden;
    }
    .slide {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 220ms ease-out;
    }
    .slide.active {
      opacity: 1;
      pointer-events: auto;
    }

    /* Cover */
    .cover-inner {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
      text-align: center;
      padding: 24px;
    }
    .eyebrow {
      font-family: 'Roboto', sans-serif;
      font-weight: 300;
      font-size: 12px;
      color: var(--muted);
      letter-spacing: 3px;
      text-transform: uppercase;
    }
    .cover-title {
      font-family: 'Libre Baskerville', Georgia, serif;
      font-weight: 700;
      font-size: 36px;
      line-height: 44px;
      color: var(--text);
      margin: 0;
    }
    .divider {
      width: 64px;
      height: 1px;
      background: rgba(255,255,255,0.2);
    }
    .cover-count {
      font-family: 'Libre Baskerville', Georgia, serif;
      font-weight: 400;
      font-size: 48px;
      color: var(--text);
      line-height: 1;
    }
    .cover-count-label {
      font-family: 'Roboto', sans-serif;
      font-weight: 300;
      font-size: 14px;
      color: var(--muted);
      letter-spacing: 0.5px;
    }

    .byline {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
    }
    .byline-avatar {
      width: 28px;
      height: 28px;
      border-radius: 9999px;
      object-fit: cover;
      border: 1px solid rgba(255,255,255,0.15);
    }
    .byline-name {
      font-family: 'Roboto', sans-serif;
      font-size: 13px;
      color: var(--muted);
    }

    /* Text slide */
    .text-inner {
      padding: 16px 24px;
      max-width: 520px;
    }
    .rich-body {
      text-align: center;
      font-family: 'Libre Baskerville', Georgia, serif;
      font-weight: 400;
      font-size: 20px;
      line-height: 32px;
      color: var(--text);
      margin: 0;
    }
    .rich-body em {
      font-style: italic;
    }

    /* Image slide */
    .slide.image { align-items: stretch; }
    .image-inner {
      width: 100%;
      max-width: 520px;
      align-self: center;
      max-height: 100%;
      overflow-y: auto;
      padding: 0 8px;
      -webkit-overflow-scrolling: touch;
    }
    .image-inner img {
      width: 100%;
      border-radius: 12px;
      display: block;
      object-fit: cover;
      background: #1a1a1a;
    }
    /* v1: single big image */
    .img-layout-v1 { display: block; }
    .img-layout-v1 img { aspect-ratio: 3/4; height: auto; }
    /* v2: two stacked equal images */
    .img-layout-v2 { display: flex; flex-direction: column; gap: 4px; }
    .img-layout-v2 img { aspect-ratio: 16/10; }
    /* v3: one tall + two stacked */
    .img-layout-v3 { display: flex; gap: 4px; align-items: stretch; min-height: 60vh; }
    .img-layout-v3 .col { flex: 1; display: flex; }
    .img-layout-v3 .col > img { flex: 1; object-fit: cover; }
    .img-layout-v3 .col.stack { flex-direction: column; gap: 4px; }
    /* v4: 2x2 grid */
    .img-layout-v4 { display: flex; flex-direction: column; gap: 4px; }
    .img-layout-v4 .row { display: flex; gap: 4px; }
    .img-layout-v4 .row img { flex: 1; aspect-ratio: 1; }
    /* v5: two columns, alternating */
    .img-layout-v5 { display: flex; gap: 4px; }
    .img-layout-v5 .col { flex: 1; display: flex; flex-direction: column; gap: 4px; }
    .img-layout-v5 .col img { width: 100%; aspect-ratio: 4/5; }

    /* Tap zones over the slide stage. The image slide allows vertical
       scrolling, so we keep the tap zones below the image-inner via z-index
       and pointer-events. Rendered as <div> to avoid the default iOS Safari
       button border/background that would otherwise paint a visible frame. */
    .tap-zone {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 33%;
      z-index: 2;
      background: transparent;
      border: 0;
      padding: 0;
      margin: 0;
      outline: none;
      -webkit-appearance: none;
      appearance: none;
      -webkit-tap-highlight-color: transparent;
      cursor: pointer;
    }
    .tap-zone.left { left: 0; }
    .tap-zone.right { right: 0; width: 67%; }
    .slide.image .tap-zone { display: none; }

    /* Bottom: dots + arrow CTA */
    .footer {
      display: flex;
      align-items: center;
      padding: 12px 16px calc(env(safe-area-inset-bottom, 0px) + 12px);
      gap: 12px;
    }
    .dots {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .dot {
      width: 6px;
      height: 6px;
      border-radius: 3px;
      background: rgba(255,255,255,0.3);
      transition: width 200ms ease-out;
    }
    .dot.active {
      width: 20px;
      background: var(--text);
    }
    .cta-circle {
      width: 44px;
      height: 44px;
      border-radius: 22px;
      background: var(--cta-bg);
      color: var(--cta-ink);
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      cursor: pointer;
    }
    .cta-circle svg { width: 20px; height: 20px; }

    /* Completion overlay */
    .complete {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.6);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 24px;
      z-index: 100;
    }
    .complete.active { display: flex; }
    .complete-card {
      max-width: 360px;
      width: 100%;
      background: var(--cream);
      color: #1A1A1A;
      border-radius: 20px;
      padding: 44px 24px 28px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.35);
      position: relative;
      text-align: center;
    }
    .complete-title {
      font-family: 'Libre Baskerville', Georgia, serif;
      font-weight: 400;
      font-size: 22px;
      line-height: 30px;
      margin: 0;
    }
    .complete-sub {
      font-family: 'Libre Baskerville', Georgia, serif;
      font-weight: 400;
      font-size: 16px;
      line-height: 24px;
      margin: 12px 0 0 0;
      color: #5c5348;
    }
    .complete-actions {
      margin-top: 28px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    /* CTAs — mirror the app's primary "Capture another" CTA exactly:
       56px tall pink pill, 2px black border, hard offset "bevel" shadow.
       The bevel must match the surrounding background so it reads as a
       stacked second card under the button (cream on dark, ink on cream). */
    .pill {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 56px;
      border-radius: 9999px;
      font-family: 'Roboto', sans-serif;
      font-weight: 500;
      font-size: 15px;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      text-decoration: none;
      cursor: pointer;
      border: 0;
      padding: 0 24px;
      -webkit-appearance: none;
      appearance: none;
      -webkit-tap-highlight-color: transparent;
    }
    .pill.primary {
      background: var(--cta-bg);
      color: var(--cta-ink);
      border: 2px solid #000000;
    }
    /* Bevel variant for dark backgrounds (landing screen). */
    .pill.primary.bevel-dark {
      box-shadow: 0 5px 0 0 #FFFFEB;
    }
    /* Bevel variant for cream/light backgrounds (completion card). */
    .pill.primary.bevel-light {
      box-shadow: 0 5px 0 0 #1A1A1A;
    }
    .pill.secondary {
      background: transparent;
      color: #1A1A1A;
      border: 1.5px solid rgba(0,0,0,0.15);
      letter-spacing: 0.4px;
      text-transform: none;
      font-size: 14px;
      height: 48px;
    }
    /* When primary + secondary live together in the completion card, give
       the primary a little space so its bevel doesn't crash into secondary. */
    .complete-actions .pill.bevel-light { margin-bottom: 6px; }

    /* Wordmark — sized consistently across landing + completion. */
    .wordmark {
      height: 28px;
      width: auto;
      display: block;
    }
    .wordmark.invert {
      /* The asset has brand-purple accents that don't survive a plain invert
         (purple becomes a muddy yellow-green). brightness(0) flattens
         everything to pure black, then invert(1) flips it to pure white so
         the wordmark reads cleanly on the dark landing background. */
      filter: brightness(0) invert(1);
    }

    /* Landing (intro) screen — covers the whole page until "Watch it" is tapped. */
    .landing {
      position: fixed;
      inset: 0;
      background: var(--bg);
      color: var(--text);
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: space-between;
      padding: calc(env(safe-area-inset-top, 0px) + 24px) 24px
              calc(env(safe-area-inset-bottom, 0px) + 24px);
      z-index: 200;
      transition: opacity 220ms ease-out;
    }
    .landing.hidden {
      opacity: 0;
      pointer-events: none;
    }
    .landing-top {
      padding-top: 16px;
      display: flex;
      justify-content: center;
      width: 100%;
    }
    .landing-middle {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      width: 100%;
      padding: 0 8px;
    }
    .landing-intro {
      font-family: 'Libre Baskerville', Georgia, serif;
      font-weight: 400;
      font-size: 22px;
      line-height: 32px;
      color: var(--text);
      margin: 0;
      max-width: 320px;
    }
    .landing-intro .accent {
      font-style: italic;
    }
    .landing-bottom {
      width: 100%;
      max-width: 360px;
      margin: 0 auto;
    }
    .landing-bottom .pill.primary {
      width: 100%;
    }
    .wordmark {
      height: 32px;
    }

    /* Initially hide the stage while the landing is up. The "Watch it" CTA
       removes .pre-watch to reveal everything. */
    body.pre-watch .stage { visibility: hidden; }

    /* Completion-card additions — accommodate the wordmark + marketing copy. */
    .complete-wordmark {
      margin: 0 auto 16px;
    }
    .complete-card .pill.primary { width: 100%; }
  </style>
</head>
<body class="pre-watch">
  <div class="landing" id="landing">
    <div class="landing-top">
      <img class="wordmark invert" src="${WORDMARK_URL}" alt="Little Moments">
    </div>
    <div class="landing-middle">
      <p class="landing-intro">${introHtml}</p>
    </div>
    <div class="landing-bottom">
      <button type="button" class="pill primary bevel-dark" id="watch-it">Watch it</button>
    </div>
  </div>

  <div class="stage">
    <div class="progress-row" id="progress-row">
      ${Array.from({ length: totalSlides }, () => `<div class="progress-bar"><span></span></div>`).join("")}
    </div>

    <a class="close-btn" href="https://getlittlemoments.com" aria-label="Close">\u2715</a>

    <div class="slides" id="slides">
      <div class="tap-zone left" id="tap-left" role="button" aria-label="Previous"></div>
      <div class="tap-zone right" id="tap-right" role="button" aria-label="Next"></div>
      ${slideHtml.join("\n")}
    </div>

    <div class="footer">
      <div class="dots" id="dots">
        ${Array.from({ length: totalSlides }, () => `<span class="dot"></span>`).join("")}
      </div>
      <button type="button" class="cta-circle" id="cta-next" aria-label="Next slide">
        <svg id="cta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="5" y1="12" x2="19" y2="12"></line>
          <polyline points="12 5 19 12 12 19"></polyline>
        </svg>
      </button>
    </div>
  </div>

  <div class="complete" id="complete">
    <div class="complete-card">
      <img class="wordmark complete-wordmark" src="${WORDMARK_URL}" alt="Little Moments">
      <h2 class="complete-title">Check out Little Moments</h2>
      <p class="complete-sub">Capture a lifetime of memories, starting with a single moment.</p>
      <div class="complete-actions">
        <a class="pill primary bevel-light" href="${APP_STORE_URL}?utm_source=shared_chapter&amp;utm_medium=web&amp;utm_campaign=chapter_share">Tell me more</a>
        <button type="button" class="pill secondary" id="rewatch">Rewatch</button>
      </div>
    </div>
  </div>

  <script>
    (function () {
      var TOTAL = ${totalSlides};
      var idx = 0;
      var slides = document.querySelectorAll('.slide');
      var bars = document.querySelectorAll('.progress-bar');
      var dots = document.querySelectorAll('.dot');
      var cta = document.getElementById('cta-next');
      var ctaIcon = document.getElementById('cta-icon');
      var complete = document.getElementById('complete');

      function render() {
        for (var i = 0; i < slides.length; i++) {
          slides[i].classList.toggle('active', i === idx);
          bars[i].classList.toggle('filled', i < idx);
          bars[i].classList.toggle('active', i === idx);
          dots[i].classList.toggle('active', i === idx);
        }
        if (idx === TOTAL - 1) {
          ctaIcon.innerHTML = '<polyline points="20 6 9 17 4 12"></polyline>';
        } else {
          ctaIcon.innerHTML = '<line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline>';
        }
      }

      function goNext() {
        if (idx < TOTAL - 1) { idx += 1; render(); }
        else { complete.classList.add('active'); }
      }
      function goPrev() {
        if (idx > 0) { idx -= 1; render(); }
      }

      document.getElementById('tap-left').addEventListener('click', goPrev);
      document.getElementById('tap-right').addEventListener('click', goNext);
      cta.addEventListener('click', goNext);

      // Landing → slideshow transition.
      var landing = document.getElementById('landing');
      var watchBtn = document.getElementById('watch-it');
      function startWatching() {
        document.body.classList.remove('pre-watch');
        landing.classList.add('hidden');
        // Fully remove the landing from the layer stack after the fade so its
        // (otherwise transparent) container can't swallow taps.
        setTimeout(function () { landing.style.display = 'none'; }, 260);
      }
      watchBtn.addEventListener('click', startWatching);

      // Rewatch — restart the slideshow from the cover.
      var rewatchBtn = document.getElementById('rewatch');
      if (rewatchBtn) {
        rewatchBtn.addEventListener('click', function () {
          complete.classList.remove('active');
          idx = 0;
          render();
        });
      }

      function isPreWatch() {
        return document.body.classList.contains('pre-watch');
      }

      document.addEventListener('keydown', function (e) {
        if (isPreWatch()) return;
        if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
          e.preventDefault(); goNext();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault(); goPrev();
        } else if (e.key === 'Escape') {
          complete.classList.remove('active');
        }
      });

      // Swipe-to-next on touch devices (horizontal swipe).
      var startX = null, startY = null;
      document.getElementById('slides').addEventListener('touchstart', function (e) {
        if (isPreWatch()) return;
        if (e.touches.length !== 1) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      }, { passive: true });
      document.getElementById('slides').addEventListener('touchend', function (e) {
        if (isPreWatch()) return;
        if (startX == null) return;
        var endX = (e.changedTouches[0] || {}).clientX;
        var endY = (e.changedTouches[0] || {}).clientY;
        var dx = endX - startX;
        var dy = endY - startY;
        startX = null; startY = null;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
          if (dx < 0) goNext(); else goPrev();
        }
      }, { passive: true });

      render();
    })();
  </script>
</body>
</html>`;
}

function render404(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Not Found \u2014 Little Moments</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=Roboto:wght@300;500&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#FFFFEB;color:#1A1A1A;font-family:'Libre Baskerville',Georgia,serif;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:40px 20px;">
  <div>
    <div style="font-family:'Libre Baskerville',Georgia,serif;font-size:18px;font-weight:700;color:#1A1A1A;margin-bottom:32px;">Little Moments</div>
    <h1 style="font-size:22px;margin:0 0 12px 0;color:#1A1A1A;">Chapter not found</h1>
    <p style="font-family:'Roboto',sans-serif;font-weight:300;font-size:14px;color:#8a7a6b;margin:0 0 24px 0;">This link may have expired or been removed.</p>
    <a href="https://getlittlemoments.com?utm_source=shared_chapter&amp;utm_medium=web&amp;utm_campaign=chapter_share" style="display:inline-block;font-family:'Roboto',sans-serif;font-weight:500;font-size:14px;color:#1A1A1A;background:#f0d7ff;padding:14px 32px;border-radius:9999px;text-decoration:none;border:2px solid #1A1A1A;">Visit Little Moments</a>
  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  // URL pattern: /shared-chapter/TOKEN (last segment is the token).
  const token = pathParts[pathParts.length - 1];

  if (!token || token === "shared-chapter") {
    return new Response(render404(), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const { data: share, error: shareErr } = await supabase
    .from("shared_chapters")
    .select("chapter_id, user_id")
    .eq("share_token", token)
    .single();

  if (shareErr || !share) {
    return new Response(render404(), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const { data: chapter, error: chapterErr } = await supabase
    .from("chapters")
    .select(
      "chapter_number, ref_year, ref_month, ref_week_start_date, moment_count, slides, image_slide"
    )
    .eq("id", share.chapter_id)
    .single();

  if (chapterErr || !chapter) {
    return new Response(render404(), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", share.user_id)
    .single();

  const shareUrl = `${SHARE_PUBLIC_BASE}/${token}`;

  const html = renderPage(
    chapter as ChapterRow,
    {
      displayName: sharerDisplayName(profile?.display_name),
      avatarUrl: profile?.avatar_url ?? null,
    },
    shareUrl
  );

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
});
