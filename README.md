# Little Moments

A journaling app built with Expo (React Native) inspired by Matthew Dicks' *Homework for Life*. Record one small, story-worthy moment each day, use AI to dig deeper into your memories, and build a cinematic timeline of your life.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Expo SDK 54](https://docs.expo.dev/) + [Expo Router](https://docs.expo.dev/router/introduction/) (file-based routing) |
| Language | TypeScript |
| Styling | [NativeWind](https://www.nativewind.dev/) (TailwindCSS) + React Native `StyleSheet` |
| State | [Zustand](https://github.com/pmndrs/zustand) (with `persist` middleware via AsyncStorage) |
| Backend | [Supabase](https://supabase.com/) (Auth, Postgres, Storage, Edge Functions) |
| AI | Anthropic Claude (Dig Deeper conversational AI), OpenAI Whisper (voice transcription) |
| Subscriptions | [RevenueCat](https://www.revenuecat.com/) (`react-native-purchases` + `react-native-purchases-ui`) |
| Auth | Apple Sign-In, Google Sign-In, Email/Password (via Supabase Auth) |
| Animations | React Native Reanimated |
| Rich Text | `react-native-pell-rich-editor` |
| Build | [EAS Build](https://docs.expo.dev/build/introduction/) + [EAS Submit](https://docs.expo.dev/submit/introduction/) |

## Fresh Mac Setup (from scratch)

If setting up on a brand new Mac with nothing installed, follow these steps in order.

### 1. Install Homebrew

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

After it finishes, run the two commands it prints under "Next steps" to add Homebrew to your PATH:

```bash
echo >> ~/.zprofile
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

### 2. Install nvm and Node.js

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.zshrc
nvm install 20
nvm use 20
```

Verify: `node -v` should print `v20.x.x` and `npm -v` should work.

### 3. Install Xcode

Install **Xcode** from the Mac App Store, then open it once to accept the license. Also install the command line tools:

```bash
xcode-select --install
```

Open Xcode → Settings → Platforms → install the **iOS Simulator** runtime if prompted.

### 4. Install global tools

```bash
npm install --global eas-cli
brew install supabase/tap/supabase
```

### 5. Set up SSH for GitHub

```bash
ssh-keygen -t ed25519 -C "your-email@example.com"
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
cat ~/.ssh/id_ed25519.pub
```

Copy the output and add it at [github.com/settings/keys](https://github.com/settings/keys).

### 6. Clone & install

```bash
git clone git@github.com:jaryd-hermann/little-moments.git
cd little-moments
npm install
```

### 7. Environment variables

Copy the example env file and fill in your keys:

```bash
cp .env.example .env
```

Required variables:

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL (`https://<project-id>.supabase.co`) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only, used by Edge Functions) |
| `ANTHROPIC_API_KEY` | Anthropic API key (used by Edge Functions for Dig Deeper AI) |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` | RevenueCat iOS API key |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | *(optional)* Google OAuth Web Client ID |

You can find these in your [Supabase dashboard](https://supabase.com/dashboard), [Anthropic console](https://console.anthropic.com/), and [RevenueCat dashboard](https://app.revenuecat.com/).

### 8. EAS login

```bash
eas login
```

### 9. Build the dev client

This app uses native modules (Apple Auth, RevenueCat, Media Library, Audio, etc.) that require a **development build** — Expo Go is not sufficient.

```bash
eas build --platform ios --profile development
```

After the build completes, the `.app` will install on your simulator automatically.

### 10. Start the dev server

```bash
npx expo start --dev-client --clear
```

Press `i` to open the app in the iOS simulator (the dev client must be installed first).

## Supabase Setup

### Database

The initial schema migration lives in `supabase/migrations/0001_initial_schema.sql`. Apply it via the Supabase dashboard SQL editor or with the Supabase CLI:

```bash
supabase db push
```

### Edge Functions

Deploy from the repo root with the [Supabase CLI](https://supabase.com/docs/guides/cli) linked to your project.

**Threads (embeddings + real-time analysis, and nightly batch):**

```bash
supabase functions deploy process-threads --project-ref smwmkeoljqnifaoqzemb
supabase functions deploy cron-threads-nightly --project-ref smwmkeoljqnifaoqzemb
```

`process-threads` calls **OpenAI** (embeddings) and **Anthropic** (Haiku + Sonnet). `cron-threads-nightly` uses **Anthropic** and existing DB vectors only — no OpenAI call — but secrets are **project-wide**, so set `OPENAI_API_KEY` once for `transcribe`, `process-threads`, and any future use.

Other examples:

```bash
supabase functions deploy dig-deeper --project-ref smwmkeoljqnifaoqzemb
supabase functions deploy transcribe --project-ref smwmkeoljqnifaoqzemb
```

Set Edge Function secrets (these are separate from your `.env`; one set applies to **all** functions on the project):

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref smwmkeoljqnifaoqzemb
supabase secrets set OPENAI_API_KEY=sk-... --project-ref smwmkeoljqnifaoqzemb
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJ... --project-ref smwmkeoljqnifaoqzemb
```

Use the same `OPENAI_API_KEY` you use for Whisper in `transcribe`.

## Build & Deploy

### Development (simulator)

```bash
eas build --platform ios --profile development
```

### Preview (internal distribution)

```bash
eas build --platform ios --profile preview
```

### Production (App Store)

```bash
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

Production builds auto-increment the build number via `appVersionSource: "remote"` in `eas.json`.

### Version Bumping

When shipping a new marketing version (e.g. 1.0.0 → 1.1.0):

1. Update `version` in `app.config.ts`
2. Update `runtimeVersion` in `app.config.ts` to match
3. Reset `ios.buildNumber` to `"1"` in `app.config.ts`
4. Increment `android.versionCode` in `app.config.ts`
5. Update `version` in `package.json`
6. Commit, push, then run `eas build`

## Project Structure

```
little-moments/
├── app/                    # Expo Router pages & layouts
│   ├── (auth)/             # Auth screens (sign-in, trial)
│   ├── (tabs)/             # Tab screens (today, memories, rewind, crash-burn)
│   ├── composer/           # Entry composer
│   ├── dig-deeper/         # AI conversation screen
│   ├── entry/              # Entry detail view
│   ├── paywall/            # Subscription paywall
│   ├── settings/           # Settings screen
│   └── splash.tsx          # Onboarding splash
├── components/             # Reusable UI components
│   ├── auth/               # Auth-related components
│   ├── common/             # Shared components (AppHeader, StreakBadge, CustomTabBar)
│   ├── composer/           # Composer components (MicRecorder, DatePicker, etc.)
│   ├── crash-burn/         # Memory Jog components
│   ├── memories/           # Memories tab components (ListView, ThreeDTimeline)
│   ├── rewind/             # Rewind tab components
│   └── today/              # Today tab components (TodayEntryCard, MarketingStoryCard)
├── constants/              # App constants (Colors, storySlides, words)
├── hooks/                  # Custom hooks (useAuth, useTheme, useStreak, useEntries, useSubscription)
├── lib/                    # Service clients (supabase, anthropic, revenuecat, whisper)
├── store/                  # Zustand stores (authStore, entryStore, settingsStore)
├── supabase/
│   ├── functions/          # Supabase Edge Functions (Deno runtime)
│   └── migrations/         # SQL schema migrations
├── app.config.ts           # Expo config (dynamic)
├── eas.json                # EAS Build profiles
└── tailwind.config.js      # NativeWind / Tailwind config
```

## Key Features

- **Daily Moments** — One entry per day with rich text, photos, and voice recording
- **Dig Deeper** — Multi-round AI conversation that asks storytelling questions to enhance your entries
- **Memory Jog** — 2-minute timed free-writing exercise with random word prompts
- **Rewind** — Browse your camera roll photos with a date wheel and create moments from memories
- **Memories** — Timeline view (list, grouped by day/month/year) and interactive Flipbook view
- **Streaks** — Track daily writing streaks with stats and badges
- **Theming** — Dark/light mode with selectable accent colors (pink, orange)
- **Subscriptions** — RevenueCat-powered monthly, yearly, and lifetime plans

## Troubleshooting

- **Native module errors in Expo Go**: This app requires a dev client build. Run `eas build --platform ios --profile development`.
- **`Network request failed`**: If the iOS simulator can't reach the internet, try resetting the simulator (Device → Erase All Content and Settings).
- **Recording not working on simulator**: Microphone recording requires a physical device.
- **RevenueCat Paywall shows manual UI**: The native RevenueCat UI module needs a fresh dev client build after installation.
- **Stale dev client**: If you see crashes after adding new native packages, rebuild with `eas build --platform ios --profile development`.
