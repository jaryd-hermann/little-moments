/**
 * Deep-link entry point for every link that brings the app to the foreground:
 *
 *  - Universal Links / Android App Links: `https://getlittlemoments.com/app/*`
 *  - Custom URL scheme (legacy + dev client): `littlemoments://*`
 *
 * `expo-router` invokes `redirectSystemPath` BEFORE rendering the matched
 * route, giving us one place to rewrite incoming paths into the in-app
 * destination + persist any state the destination screen consumes on mount
 * (e.g. the chapter id stash that `app/(tabs)/chapters.tsx` reads via
 * `useChapterNotifStore.consume()`).
 *
 * The path passed in is ALREADY normalized by expo-router to start with `/`
 * — both `littlemoments:///app/foo` and `https://.../app/foo` arrive here
 * as `/app/foo`.
 *
 * Auth-aware routing: we do NOT block here on whether the user is signed
 * in. Routes that need auth (chapters, threads, paywall) bounce through
 * `app/index.tsx`, which already handles "signed out → splash" + "signed in
 * → routeAfterAuth" correctly. For the chapter deep link in particular we
 * stash the chapter id in a persisted-style store so the Chapters tab can
 * pop the right chapter once the user lands on it, mirroring the existing
 * push-notification chapter-open pattern in `_layout.tsx`.
 */
import { useChapterNotifStore } from "@/store/chapterNotifStore";

const APP_PATH_PREFIX = "/app";

function stripQuery(path: string): { path: string; query: string } {
  const i = path.indexOf("?");
  if (i === -1) return { path, query: "" };
  return { path: path.slice(0, i), query: path.slice(i) };
}

function routeForAppPath(rawPath: string): string {
  const { path, query } = stripQuery(rawPath);

  // `/app` and `/app/` → just open the app; let the root index decide where
  // the user belongs (signed-out splash, mid-onboarding step, or Today).
  if (path === APP_PATH_PREFIX || path === `${APP_PATH_PREFIX}/`) {
    return "/";
  }

  // `/app/chapter/<id>` → stash id, hand off to Chapters tab which consumes
  // pendingChapterId on mount and opens the matching chapter (same surface
  // the OneSignal chapter-ready push uses).
  const chapterMatch = path.match(/^\/app\/chapter\/([^/?#]+)$/);
  if (chapterMatch) {
    const id = decodeURIComponent(chapterMatch[1]);
    useChapterNotifStore.getState().setPendingChapterId(id);
    return "/(tabs)/chapters";
  }

  switch (path) {
    case "/app/today":
      return "/(tabs)/today";
    case "/app/today/capture":
      return `/(tabs)/today?capture=1${query ? `&${query.slice(1)}` : ""}`;
    case "/app/today/capture/camera":
      return "/(tabs)/today?capture=1&openCamera=1";
    case "/app/threads":
      return "/(tabs)/brain?tab=ellie";
    case "/app/chapters":
      return "/(tabs)/chapters";
    case "/app/memories":
      return "/(tabs)/memories";
    case "/app/memories/pinned":
    case "/app/memories/core":
      return "/(tabs)/memories?filter=core";
    case "/app/paywall":
      return "/paywall/upgrade";
    default:
      // Unknown app subpath — fall through to root rather than 404'ing,
      // so a future link our older clients don't recognize still opens the
      // app instead of bouncing the user back to Safari.
      return "/";
  }
}

export function redirectSystemPath({
  path,
  initial: _initial,
}: {
  path: string;
  initial: boolean;
}): string | Promise<string> {
  try {
    if (typeof path !== "string") return "/";
    if (path.startsWith(APP_PATH_PREFIX)) {
      return routeForAppPath(path);
    }
    return path;
  } catch {
    // Never let a redirect failure swallow the deep link entirely — if our
    // mapping throws (e.g. corrupted store), just open the app on root.
    return "/";
  }
}
