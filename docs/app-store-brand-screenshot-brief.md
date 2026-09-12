# Little Moments — Brand & App Store Screenshot Brief

**For:** Designer  
**Product:** Little Moments (iOS)  
**Version context:** 2.3.x — Magic Fill, Video Montages, Calendar Views, Today in Your Past  
**Deliverables:** 6–8 App Store screenshots (6.7" primary), optional 6.5" + iPad, Figma source file

---

## 1. What the app is

**One-liner:** A photo-first daily journal that helps you capture one real moment from your day in under 60 seconds — then turns those moments into a private archive, AI chapters, and video montages of your life.

**The problem we solve:** Days blur together. People take thousands of photos but forget what actually mattered. Traditional journaling fails because blank pages feel like homework.

**The promise:** Notice one small moment a day. Pick a photo, say or type a few words, save it. Over weeks and months it compounds into something you'll genuinely treasure — not a social feed, a **private Capsule** of your life.

**Inspired by:** *Homework for Life* (Matthew Dicks) — the practice of finding one story-worthy moment every day.

**Core tabs:**

| Tab | Name | What it does |
|-----|------|--------------|
| Capture | CAPTURE | Daily ritual — pick photo, voice/text moment, scroll days, Magic Fill backfill, Today in Your Past |
| Capsule | CAPSULE | Personal vault — flipbook, list, calendar grid; search; pin core memories |
| Chapters | CHAPTERS | AI weekly chapters + auto-generated video montages (week/month/year) |
| Connect | CONNECT | Brain graph + AI-discovered threads linking people, places, themes |

**Key differentiators for marketing:**

- Photo-first (not blank-page journaling)
- Under 60 seconds/day
- Voice or text
- AI chapters + video montages
- Magic Fill (batch backfill from camera roll)
- Private — not social

---

## 2. Brand personality & aesthetic

### Feel

**Warm editorial + playful utility.** Not sterile Apple minimalism. Not cute/kiddie. Think: a thoughtful friend who also has great taste in print design — confident typography, tactile buttons, real photos, human copy.

### Keywords

Intimate · Honest · Unhurried · Tactile · Memory-forward · Slightly retro · Not performative

### Visual language

- **High-contrast ink:** Black `#1A1A1A` strokes on light UI; white strokes on dark UI. 2px borders on photos, cards, CTAs.
- **Sticker/bevel CTAs:** Primary buttons have a hard offset shadow (5px down, no blur) — feels like a physical button layered on the screen.
- **Real photography:** Always use warm, authentic life photos (meals, kids, travel, ordinary Tuesdays). Never stock-smile corporate.
- **Generous type:** Large PMGothic Ludington headlines on tab screens; Roboto for body/UI.
- **Shape-coded navigation:** Tab bar uses geometric shapes (circle, square, triangle, diamond) — each tab has its own fill color.
- **Dark-first:** App defaults to dark mode. App Store screenshots should **lead with dark mode** (matches first-run experience). Light mode (`#FFFFEB` cream) can appear in 1–2 frames for warmth/contrast.

### What to avoid

- Purple gradient SaaS aesthetic
- Generic meditation-app pastels
- Overly glossy 3D mockups
- Fake UI that doesn't match the product
- Therapy/wellness clichés (lotus, zen stones)
- Dense feature lists on screenshots

---

## 3. Color system

### Primary brand palette

| Token | Hex | Usage |
|-------|-----|--------|
| **Pink (primary accent)** | `#F0D7FF` | CTAs, tab Capture, progress fill, user chat bubbles |
| Pink light | `#F5E6FF` | Hover/secondary accent |
| Pink dark | `#D4A8F0` | Accent depth |
| **Cream (light bg)** | `#FFFFEB` | Light mode background, Capsule tab fill, bevel shadow in dark mode |
| Cream secondary | `#F5F5E4` | Light mode cards/surfaces |
| **Ink** | `#1A1A1A` | Text on light, CTA labels on pink, borders in light mode |
| Pure black | `#000000` | Dark mode background, CTA borders |

### Tab / section colors (use in wayfinding graphics)

| Tab | Shape | Fill |
|-----|-------|------|
| Capture | Circle | `#F0D7FF` |
| Capsule | Square | `#FFFFEB` |
| Chapters | Triangle | `#024F46` (deep teal) |
| Connect | Diamond | `#FECFB4` (peach) |

### Secondary accents

| Token | Hex | Usage |
|-------|-----|--------|
| **Peach** | `#FECFB4` | Magic Fill CTAs, Connect tab, premium warmth |
| **Gold** | `#FFC100` | Date pills (Capture + Magic Fill) — black 2px stroke |
| **Cream track** | `#FEEEB1` | Progress bars (month/year captured %) |
| **Deep teal** | `#024F46` | Chapters spotlight cards, chapter branding |
| **Destructive** | `#EF4444` | Overtime timer, errors |
| **Success** | `#10B981` | Confirmations |

### Dark mode (default — use for screenshots)

| Token | Value |
|-------|-------|
| Background | `#000000` |
| Surface | `#0A0A0A` |
| Surface secondary | `#1A1A1A` |
| Text primary | `#FFFFFF` |
| Text secondary | `rgba(255,255,255,0.7)` |
| Text muted | `rgba(255,255,255,0.4)` |
| Border | `rgba(255,255,255,0.1)` |

### Light mode (optional alternate frames)

| Token | Value |
|-------|-------|
| Background | `#FFFFEB` |
| Surface secondary | `#F5F5E4` |
| Text primary | `#1A1A1A` |

---

## 4. Typography

### Font files (in repo: `assets/fonts/`)

| Role | Font | Weights | Usage |
|------|------|---------|--------|
| **Display / screen titles** | PM Gothic Ludington Text 110 | Regular | Tab headings ("Today", "Capsule", "Chapters"), Magic Fill headlines, section titles |
| **Editorial / prompts** | Libre Baskerville | 400, 700, Italic | Ellie prompts, chapter copy, progress bar labels, paywall headlines |
| **UI / body** | Roboto | 300 Light, 400 Regular, 500 Medium, 700 Bold | Body text, buttons, labels, moment titles |

### Scale for App Store overlay copy

| Element | Font | Size | Notes |
|---------|------|------|-------|
| Screenshot headline | PM Gothic Ludington | 52–64px | 2–6 words max, left-aligned |
| Screenshot subhead | Roboto Regular or Light | 22–28px | One sentence, 70% opacity white on dark bg |
| CTA pill (if used) | Roboto Medium | 15px | UPPERCASE, letter-spacing 0.5px |
| Device UI (in-frame) | Match app | — | Don't re-typeset in-frame UI |

### Button typography

- Primary CTAs: **Roboto Medium, 15px, UPPERCASE**, `#1A1A1A` on pink/peach fill
- Always **2px solid `#000000`** border on pink CTAs + bevel shadow

---

## 5. UI components (match in screenshots)

Reference these patterns so frames look like the real app:

**Photo/moment cards**

- 16px corner radius
- 2px border (`#FFFFFF` dark / `#1A1A1A` light)
- Optional bevel shadow beneath

**Date pills**

- Gold `#FFC100` fill, 2px black stroke, pill radius
- Roboto Medium 12px, `#1A1A1A`

**Primary CTA button**

- Height ~52px, pill radius
- Fill `#F0D7FF`, label `#1A1A1A`, border 2px `#000000`
- Bevel: shadow offset `{0, 5}`, color `#FFFFEB` (dark mode) or `#1A1A1A` (light mode), blur 0

**Magic Fill CTA**

- Peach `#FECFB4` fill, black stroke, subtle shimmer animation (optional in static: highlight gradient)

**Progress capsule** (month/year captured)

- Track `#FEEEB1`, fill `#F0D7FF`, 2px ink border

**Tab bar**

- Custom geometric icons with labels: CAPTURE · CAPSULE · CHAPTERS · CONNECT
- Always visible in full-screen captures unless intentionally cropped

**Wordmark**

- Asset: `assets/images/wordmark-little-moments.png` (light on dark)
- Asset: `assets/images/wordmark-little-moments-black.png` (dark on light)
- Use on Frame 1 hero only — not every screenshot

---

## 6. App Store screenshot spec

### Technical requirements

| Spec | Value |
|------|-------|
| **Primary device** | iPhone 6.7" (iPhone 15 Pro Max) — **1290 × 2796 px** |
| Secondary | iPhone 6.5" — 1284 × 2778 px (scale from master) |
| Optional | iPad Pro 12.9" — 2048 × 2732 px |
| Color space | sRGB |
| Format | PNG, no transparency |
| Safe zone | Keep headlines + device within center 90%; avoid top 8% (status bar overlap in preview) |

### Layout template (recommended)

Each screenshot = **full-bleed background** + **headline block (top ~35%)** + **device mockup (bottom ~65%)**

```
┌─────────────────────────────┐
│  [optional wordmark]        │
│                             │
│  HEADLINE                   │  ← PM Gothic, 52–64px
│  One line subhead.          │  ← Roboto 24px, muted
│                             │
│     ┌───────────────┐       │
│     │               │       │
│     │   APP SCREEN  │       │  ← Real UI capture or hi-fi rebuild
│     │               │       │
│     │               │       │
│     └───────────────┘       │
│         device frame        │
└─────────────────────────────┘
```

**Device frame:** Use iPhone 15 Pro / 16 Pro titanium frame, slight 4–8° rotation optional on frames 2–5 (adds energy; Frame 1 should be straight).

**Background treatments (pick one system, use consistently):**

- **Option A (recommended):** Solid `#000000` with subtle radial gradient `#1A1A1A` → `#000000` behind device
- **Option B:** Full-bleed blurred montage of user photos at 20% opacity under black overlay 70%
- **Option C:** Cream `#FFFFEB` background for 1–2 frames only (Capsule / calendar) for visual rhythm

Do **not** mix more than 2 background styles across the set.

---

## 7. Screenshot sequence (6 frames — optimized for conversion)

> **Rule:** Frame 1–2 sell the *hook*. Frame 3–5 sell the *product*. Frame 6 sells *long-term value / differentiation*.  
> Copy below is final-ready; designer can tighten if needed for line breaks.

---

### Frame 1 — Hero hook (most important)

**Goal:** Stop the scroll. Name the problem + promise.

| | |
|---|---|
| **Headline** | Remember what mattered today |
| **Subhead** | One photo. A few words. Under 60 seconds. |
| **Screen** | Capture tab — today with a beautiful moment card saved, photo visible, date pill, pink "Capture another" CTA |
| **Background** | Black + wordmark top-left (small) |
| **Notes** | This is the only frame with wordmark. Show a *saved* moment, not empty state. |

---

### Frame 2 — How it works

**Goal:** Make it feel effortless.

| | |
|---|---|
| **Headline** | Your camera roll, turned into a journal |
| **Subhead** | Pick a photo from your day. Say or type what made it matter. |
| **Screen** | Capture flow mid-capture — photo card with voice recorder or text input visible; Ellie-style prompt optional |
| **Background** | Black |

---

### Frame 3 — The vault

**Goal:** Show compounding value.

| | |
|---|---|
| **Headline** | A private Capsule of your life |
| **Subhead** | Browse by day, flip through memories, or see your month at a glance. |
| **Screen** | Capsule **calendar grid view** — month with filled days (photo thumbnails), progress capsule at top, a few empty days visible |
| **Background** | Cream `#FFFFEB` (light mode Capsule — shows warmth; only frame using this) |

---

### Frame 4 — Catch up (Magic Fill)

**Goal:** Remove "I'm too far behind" objection.

| | |
|---|---|
| **Headline** | Catch up in one sitting |
| **Subhead** | Magic Fill finds days with photos but no moment — then helps you save several at once. |
| **Screen** | Magic Fill review screen — stack of photo cards with gold date pills, peach "✦ Magic fill" CTA |
| **Background** | Black |

---

### Frame 5 — Nostalgia hook

**Goal:** Emotional pull — unique feature.

| | |
|---|---|
| **Headline** | This day, years ago |
| **Subhead** | Rediscover photos from the same date in your past — and log them as moments. |
| **Screen** | Capture tab scrolled to **Today in Your Past** carousel — horizontal cards with year label, location tag, "+ Log Moment" |
| **Background** | Black |

---

### Frame 6 — Cinematic payoff

**Goal:** Show where the habit leads.

| | |
|---|---|
| **Headline** | Your life, as a movie |
| **Subhead** | Auto-generated video montages and AI-written chapters from the moments you capture. |
| **Screen** | Chapters tab — **MashupCard** full-width with gradient overlay, "June 2026" label, play affordance; or full-screen montage player mid-playback |
| **Background** | Black with subtle `#024F46` teal glow behind device (Chapters brand color) |

---

### Frame 7 (optional) — Intelligence layer

**Goal:** Premium/differentiation for users who scroll deep.

| | |
|---|---|
| **Headline** | See the patterns in your life |
| **Subhead** | AI connects people, places, and themes across your moments. |
| **Screen** | Connect tab — Brain graph WebView or thread cards |
| **Background** | Black |

---

### Frame 8 (optional) — Social proof / CTA

**Goal:** Close the loop.

| | |
|---|---|
| **Headline** | Five minutes a day. A lifetime of memories. |
| **Subhead** | Free to start. Your moments, your vault, forever. |
| **Screen** | Splash-style montage background + wordmark OR streak rings from Capture heading (days captured / total moments) |
| **Background** | Dark with photo montage at low opacity |

---

## 8. Screenshot copy principles (what converts on iOS)

Based on top-performing journaling, photo, and habit apps (Day One, 1 Second Everyday, Stoic, Headspace patterns):

1. **Headline = outcome, not feature name.** Say "Remember what mattered today" not "Daily journaling app."
2. **Subhead = mechanism.** One concrete how-it-works line.
3. **Max 6 words in headline** where possible.
4. **Show the product by frame 2.** Users need to see real UI immediately.
5. **One idea per frame.** Don't combine Magic Fill + Montages in one screenshot.
6. **Use light mode sparingly.** One cream frame (Capsule) creates contrast; rest dark.
7. **No bullet lists on screenshots.** Apple editorial picks rarely use them.
8. **Authentic photos.** Brief photographer: candid, mixed ages, domestic + travel, no filters.

---

## 9. Asset checklist for designer

From repo (`/assets/`):

| Asset | Path |
|-------|------|
| Wordmark (light) | `assets/images/wordmark-little-moments.png` |
| Wordmark (dark) | `assets/images/wordmark-little-moments-black.png` |
| App icon | `assets/images/icon.png` |
| Splash hero reference | `assets/images/1.png` |
| Fonts | `assets/fonts/PMGothic/`, `Libre_Baskerville/`, `Roboto/` |

**UI captures:** Request latest TestFlight build on iPhone 15 Pro Max, dark mode, populated account with:

- 30+ moments across multiple months
- At least 1 chapter / montage unlocked
- Magic Fill-eligible days (photos, no moment)
- Today in Your Past photos available

If captures aren't available, rebuild screens in Figma using specs above — match spacing (20px horizontal gutter), real tab bar, real fonts.

---

## 10. Figma file structure (requested deliverables)

```
Little Moments / App Store Screenshots
├── 🎨 Brand tokens (colors, type styles)
├── 📱 6.7" Master (1290×2796) × 6–8 frames
├── 📱 6.5" Export artboards
├── 🖼 Background variants (dark, cream, teal glow)
├── 📲 Device frame component (iPhone 15/16 Pro)
└── 📝 Copy doc (headlines + subheads, editable text layers)
```

Export: PNG @1x per artboard, named `01-hero-remember.png`, etc.

---

## 11. Quick reference — brand in one glance

```
Aesthetic:  Warm editorial journal · tactile stickers · real photos
Default UI: Dark (#000) + pink accent (#F0D7FF)
Light UI:   Cream (#FFFFEB) + ink (#1A1A1A)
Display:    PM Gothic Ludington
Body:       Roboto
Borders:    2px, high contrast
CTAs:       Pink/peach pill + black stroke + bevel shadow
Promise:    One moment a day · under 60 seconds · private · compounds over time
```

---

## Related docs

- [Ellie chat brand guide](./ellie-chat-brand-guide.md) — conversational UI, marketing site parity
- Source tokens: `constants/Colors.ts`, `lib/themedShadow.ts`, `lib/magicFillTypography.ts`
