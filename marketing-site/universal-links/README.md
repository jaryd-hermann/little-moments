# Universal Links / Android App Links — marketing site deploy

This folder holds the **static files the marketing site (Vercel) must serve** so
that the native app's `associatedDomains` entitlement (iOS) and
`intentFilters` with `autoVerify` (Android) successfully claim
`https://getlittlemoments.com/app/*` URLs.

Without these files in the right place, iOS/Android will silently fall back to
opening the URL in the user's browser instead of the app — which is exactly the
"white error page" bug this whole change is fixing.

## What needs to ship to Vercel

Three files / routes on `getlittlemoments.com`:

| Live URL | Source file in this folder | Notes |
|---|---|---|
| `https://getlittlemoments.com/.well-known/apple-app-site-association` | `.well-known/apple-app-site-association` | **No file extension.** Must be served as `application/json` (Apple). |
| `https://getlittlemoments.com/.well-known/assetlinks.json` | `.well-known/assetlinks.json` | Must be served as `application/json` over HTTPS with a valid cert. |
| `https://getlittlemoments.com/app` and `https://getlittlemoments.com/app/*` | `app-fallback.html` | Same HTML for every `/app/*` route (catch-all). Only shown when the app isn't installed; otherwise iOS / Android intercept the URL before the browser ever fetches. |

## Two values you MUST fill in before deploying

The two static JSON files have placeholders. Fill them in BEFORE pushing to
Vercel — wrong values fail-closed (Apple's `swcd` daemon and Google's
`Statements API` cache for ~24h, so a bad value is painful to roll back).

### 1. `__APPLE_TEAM_ID__` in `apple-app-site-association`

Your 10-character Apple Developer Team ID. Find it via either:

```bash
# Easiest: from EAS, against the iOS prod profile
eas credentials -p ios
# Then choose: production → look at "Team ID" in the printed credentials

# Or: Apple Developer portal
# https://developer.apple.com/account → Membership details → Team ID
```

Replace BOTH occurrences (the `applinks.details[0].appIDs[0]` and
`webcredentials.apps[0]` entries).

### 2. `__ANDROID_SHA256_PROD__` in `assetlinks.json`

The SHA-256 fingerprint of the keystore EAS uses to sign the production
Android build, formatted as 32 colon-separated hex bytes
(e.g. `14:6D:E9:83:C5:73:06:50:D8:EE:74:91:51:7C:35:69:97:0E:78:F0...`).

Find it via:

```bash
eas credentials -p android
# Then: production → "Application Identifiers" → look for
# "SHA-256 Fingerprint:" in the printed keystore credentials.
```

If you also build internally with a different keystore (preview / staging),
add its fingerprint as a second string in the `sha256_cert_fingerprints`
array so test builds also resolve App Links cleanly.

## Vercel-specific deploy steps

Assuming the marketing site is a standard Next.js / static site on Vercel:

1. Copy `apple-app-site-association` to `public/.well-known/apple-app-site-association`
   in the marketing repo.
2. Copy `assetlinks.json` to `public/.well-known/assetlinks.json`.
3. Add a header rule to force the AASA file to be served as `application/json`
   (Vercel will guess `application/octet-stream` because of the missing
   extension, which Apple's `swcd` accepts but is fussy about). In
   `vercel.json`:

   ```json
   {
     "headers": [
       {
         "source": "/.well-known/apple-app-site-association",
         "headers": [
           { "key": "Content-Type", "value": "application/json" }
         ]
       },
       {
         "source": "/.well-known/assetlinks.json",
         "headers": [
           { "key": "Content-Type", "value": "application/json" }
         ]
       }
     ]
   }
   ```

4. Route `/app` and `/app/*` to the fallback HTML (catch-all). In Next.js
   `app router`, the simplest version is a single `app/app/[[...slug]]/page.tsx`
   that renders the `app-fallback.html` content (or imports it as a static
   asset). In `vercel.json` rewrites it would be:

   ```json
   {
     "rewrites": [
       { "source": "/app", "destination": "/app-fallback.html" },
       { "source": "/app/:path*", "destination": "/app-fallback.html" }
     ]
   }
   ```

   (Place `app-fallback.html` under `public/` in the marketing repo.)

## Verification after deploy

Always verify BOTH files load correctly before bumping the EAS build:

```bash
# Apple — must return 200, JSON body, no redirect (HTTPS, no auth required).
curl -sIv https://getlittlemoments.com/.well-known/apple-app-site-association
# Look for: HTTP/2 200, content-type containing "json"

# Apple also publishes a CDN tester that mirrors what swcd does on-device.
# Useful when a device stubbornly refuses to recognize the association:
open "https://app-site-association.cdn-apple.com/a/v1/getlittlemoments.com"

# Google — assetlinks must validate via Google's official tester:
open "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://getlittlemoments.com&relation=delegate_permission/common.handle_all_urls"
# Look for: {"statements":[...]} with package_name + sha256
```

On-device verification:

```bash
# iOS — once the EAS build with `associatedDomains` is installed, open
# Settings → Safari → Advanced → Universal Links and look for "Little
# Moments getlittlemoments.com" with the toggle ON.
#
# Or, faster: in a fresh Safari tab, type the URL by hand and tap Go.
# Should open the app. Tapping a link inside Mail / Gmail / Notes should
# behave identically.

# Android — App Links verification status:
adb shell pm get-app-links com.jarydhermann.littlemoments
# Look for: getlittlemoments.com: verified
```

## Rollout order (important — wrong order = broken in prod)

1. Fill in `__APPLE_TEAM_ID__` + `__ANDROID_SHA256_PROD__`.
2. Deploy the marketing site changes to Vercel and verify via the curl
   commands above. **Do this first.**
3. Cut a new EAS production build of the app (the entitlement and intent
   filter were added in this PR — without a rebuild they aren't on user
   devices, even via EAS Update).
4. Submit to the App Store / Play Store as usual.
5. Existing TestFlight / Play Console internal-track users get the new
   association on next app install (re-install required — entitlements
   are baked into the binary).
6. Once distributed, the next chapter email cron will produce CTAs that
   open the app directly. Old emails still in users' inboxes will also
   start working without any change on their end, because the URL hasn't
   changed — only what the OS does with it has.
