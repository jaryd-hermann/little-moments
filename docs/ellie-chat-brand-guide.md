# EllieChat — design and experience guide

**Purpose:** Standalone reference for building a marketing site or other surfaces in the same UX/UI language as Little Moments’ Ellie chat, without access to the app codebase.

**Product:** Little Moments. **Default shell:** dark UI with pink accent.

**Source modules (repo paths for maintainers):** `components/ellie/EllieMessage.tsx`, `EllieChatFlow.tsx`, `PromptCard.tsx`, `MomentPreview.tsx`, `UserMessage.tsx`, `components/dig-deeper/ThinkingDots.tsx`, `constants/Colors.ts`, `app.config.ts` (`userInterfaceStyle: "dark"`), `app/_layout.tsx` (font registration).

---

## Brand idea (what EllieChat feels like)

- **Conversational, not brochure-like:** A vertical chat transcript with generous horizontal padding (~20px), not a generic centered marketing column.
- **Ellie = calm guide:** Assistant copy is **left-aligned, no speech bubble**—plain body text, optionally preceded by a **small rounded app icon** (28×28px, ~8px corner radius). More editorial than “iMessage bubbles.”
- **User = action:** User replies are **right-aligned pills** filled with the accent color.
- **Prompts = hero moments:** The daily word, question, or photo appears as a **card** that breaks chat rhythm (borders, serif headlines, sometimes full-width image).
- **Thinking state:** Three small dots with a subtle bounce—typing / working without blocking layout.
- **Time pressure (capture flow only):** Large **Libre Baskerville** countdown (`m:ss`) turns **red** (`#EF4444`) when overtime.

---

## Typography

### Web font loading

Use Google Fonts (or self-host equivalents):

```html
<link
  href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Roboto:wght@300;400;500;700&display=swap"
  rel="stylesheet"
/>
```

**CSS families:** `'Libre Baskerville', serif` and `'Roboto', sans-serif`.

### Families and roles

- **Libre Baskerville** — display, prompts, titles, timer numerals. Weights: 400 Regular, 700 Bold, 400 Italic.
- **Roboto** — chat body, UI chrome, buttons. Weights: 300 Light, 400 Regular, 500 Medium, 700 Bold.

### Scale (Ellie chat–specific)

| Use | Font | Size | Line height | Notes |
|-----|------|------|-------------|--------|
| Ellie + user message body | Roboto Regular | 15px | 24px | Primary reading size |
| Bold inline in Ellie | Roboto Bold | 15px | 24px | `**markdown**`-style emphasis; optional per-phrase color |
| Word prompt (center) | Libre Baskerville Bold | 36px | — | **lowercase** for the word |
| Question / freetext prompt | Libre Baskerville Regular | 18px | 26px | Centered in bordered card |
| Photo date pill on image | Libre Baskerville Bold | 14px | — | White on dark translucent overlay |
| Timer | Libre Baskerville Bold | 28–36px | — | Red when negative remaining time |
| Hint above CTAs | Roboto Light | 13px | — | Muted color |
| Secondary / skip | Roboto Light | 14px | — | Muted |
| Button labels | Roboto Medium | 14–15px | — | Often **uppercase**, letter-spacing ~0.3–0.5px |
| Preview card title | Libre Baskerville Bold | 18px | — | Moment preview |
| Preview / assembled body | Roboto Regular | 15px / 14px | 24px / 22px | Secondary color when de-emphasized |

**Rich text:** Ellie strings may use `**segments**`; render as **Roboto Bold** at body size, optional custom color per phrase.

---

## Color system

**Marketing default:** **dark** background + **pink** accent. (The app also supports an orange accent.)

### Dark mode (default)

- Background: `#000000`
- Surface (elevated panels, mic sheet): `#0A0A0A`
- Surface secondary (cards, inputs): `#1A1A1A`
- Primary text: `#FFFFFF`
- Secondary text: `rgba(255, 255, 255, 0.7)`
- Muted text: `rgba(255, 255, 255, 0.4)`
- Border: `rgba(255, 255, 255, 0.1)`
- Border light: `rgba(255, 255, 255, 0.05)`
- Icons (default): `rgba(255, 255, 255, 0.7)`

### Pink accent (default)

- Primary: `#f0d7ff`
- Primary light: `#f5e6ff`
- Primary dark: `#d4a8f0`

### Orange accent (alternate)

- Primary: `#E8734A`
- Light: `#F09070`
- Dark: `#C95E38`

### Semantic (both modes)

- Destructive / overtime: `#EF4444`
- Success: `#10B981`
- Warning: `#F59E0B`

### Light mode (optional site toggle)

- Background `#FFFFFF`, surface `#FFFFEB`, surface secondary `#F5F5E4`, text `#1A1A1A`, borders `rgba(0,0,0,0.15)` and `rgba(0,0,0,0.08)`; same accent palettes as above.

### Text on accent fills (user bubbles, primary buttons)

- Dark mode: `#000000` on accent
- Light mode: `#1A1A1A` on accent

### Special spotlight card (onboarding only)

- Solid `#024F46` background, white Libre Baskerville title, light Roboto body—**not** default chat chrome.

### Email / share CTA parity

- Pink fill, `#1A1A1A` label, **2px solid `#1A1A1A`** border on pill buttons—good reference for web primary CTAs.

---

## Layout and spacing

- **Screen padding:** ~20px horizontal; vertical scroll; composer anchored to bottom on mobile.
- **Ellie row:** horizontal flex; optional 28px avatar + 10px gap; text column flex 1; **padding-right ~32px**.
- **User bubble:** max-width 85%, align end, margin-bottom 12px.
- **Vertical rhythm:** ~16px between Ellie blocks; thinking dots ~16px margin below.
- **Cards:** margin-bottom 16px, corner radius **16px** (primary radius).

---

## Buttons and controls

### Primary pill (“Start speaking”, “Add Moment”, photo access, main download CTA)

- Height ~52px (or full-width footer bar)
- `border-radius: 9999px`
- `background`: accent primary (`#f0d7ff` for pink)
- Label: Roboto Medium, **uppercase**, ~15px, letter-spacing ~0.5px, color **`#1A1A1A`** (or `#000000` on smaller send chip)
- Leading icon: `#1A1A1A`, ~20px, ~10px gap from label

### Secondary pill (“Start typing”)

- Height ~48px, `border-radius: 9999px`
- `border: 1.5px` theme border; transparent / background fill
- Label: Roboto Medium, uppercase, **primary text** color
- Icon: primary text, ~18px

### Composer “Done” / “Send”

- Pill, `background: accent`, **`border: 2px solid #000000`**, padding ~10px × 20px
- Roboto Medium 14px, uppercase, **`#000000`**, letter-spacing ~0.3px
- Disabled: opacity ~0.45 when no text (non–follow-up)

### Tertiary / icon

- Mic in composer: ~10px radius rect, `background: surface secondary`, icon color per theme
- Circular controls (shuffle, close): 40px circle, `rgba(0,0,0,0.55)` or surface secondary; white or theme icons
- **Skip:** Roboto Light 14px, muted, ~44px min tap height

### Choice rows (FAQs, feature pickers)

- `border-radius: 14px`, `border: 1.5px` accent
- Padding ~14px vertical, 16px horizontal; icon 20px accent; title Roboto Medium 15px; subtitle Roboto Regular 12px muted; chevron muted

---

## Rich cards and embedded content

### 1. Word prompt card

- Margin bottom 16px
- Optional instruction above: Roboto Light 14px, centered, muted
- Inner: radius 16px, border 1.5px accent, padding ~28px vertical / 20px horizontal
- Word: Libre Baskerville Bold 36px, **lowercase**, centered
- Below: Ellie row (avatar + Roboto 15/24 guidance)

### 2. Question / free-text prompt card

- Radius 16px, border 1.5px accent, padding ~20px
- Copy: Libre Baskerville Regular 18px / line-height 26px, centered

### 3. Photo prompt card

- Container: 16px radius, overflow hidden, 1px border, background surface secondary
- Image: aspect-ratio 1, object-fit cover
- Date badge: top-left, `rgba(0,0,0,0.5)`, radius 8px, padding ~10×5px, Libre Bold 14px white
- Shuffle FAB: bottom-right, 40px circle, `rgba(0,0,0,0.55)`, white icon 20px

### 4. Moment preview card

- 16px radius, 1px border, background surface secondary, overflow hidden
- Optional image: full width, 200px height; remove control: 28px circle, `rgba(0,0,0,0.6)`, white ×
- Body padding 16px: title Libre Bold 18px; body Roboto 15/24
- Footer: 1px top border; primary row full width, accent fill, uppercase “Add moment”, `#1A1A1A`; secondary row: Roboto 14px, **text color = accent**

### 5. Read-only moment snippet

- Same shell, **opacity 0.6**, title Libre Bold 16px, body Roboto 14/22 secondary—clamp lines on web

### 6. Thinking indicator

- Row height ~22px; dots 7×7px, gap 6px, align start
- Dot color: muted text; bounce ~7px, ~320ms phases, staggered delays 0 / 140 / 280ms

---

## Composer (bottom input)

- Top border 1px; background = screen background; padding ~16px × ~8px
- Field container: radius 18px, 1px border, background = screen background; padding ~14px × ~10px/8px
- Input: Roboto Regular 15px, min-height ~44px, max-height ~160px, placeholder muted
- Actions: mic, skip, primary pill aligned end

**Mic sheet:** top corners 20px radius, surface background, top border 1px

---

## Motion and feedback

- Prefer thinking dots over spinners except for media load.
- Staggered first message + typing delay is a core pattern—optional for web hero.
- Web: light transitions (150–200ms) on hover/active; avoid flashy motion.

---

## Icons

- App uses **Ionicons** (e.g. `create-outline`, `mic`, `mic-outline`, `images-outline`, `close`, `shuffle`, `chevron-forward`).
- On web, use a thin-stroke set (Ionicons, Lucide, Phosphor) at the sizes above.

---

## Marketing header (example layout)

- **Left — wordmark:** Libre Baskerville Bold (or logo asset); color = primary text for the theme.
- **Center — value prop** (e.g. “Capture a lifetime of memories, starting with a single word”): Roboto Regular or Light ~14–16px, secondary or muted—or full white if this line is the hero.
- **Right — download CTA:** Primary pill (accent fill, `#1A1A1A` uppercase label, pill radius); optional outline secondary beside it.

---

## CSS variables (starter)

```css
:root {
  --lm-bg: #000000;
  --lm-surface: #0a0a0a;
  --lm-surface-2: #1a1a1a;
  --lm-text: #ffffff;
  --lm-text-secondary: rgba(255, 255, 255, 0.7);
  --lm-text-muted: rgba(255, 255, 255, 0.4);
  --lm-border: rgba(255, 255, 255, 0.1);
  --lm-accent: #f0d7ff;
  --lm-accent-light: #f5e6ff;
  --lm-on-accent: #1a1a1a;
  --lm-danger: #ef4444;
  --lm-radius-card: 16px;
  --lm-radius-pill: 9999px;
  --font-display: "Libre Baskerville", serif;
  --font-ui: "Roboto", sans-serif;
}
```
