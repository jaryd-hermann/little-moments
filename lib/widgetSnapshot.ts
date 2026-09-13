/**
 * Feeds the iOS home screen widget.
 *
 * The widget runs in its own process with no access to Zustand, Supabase or
 * the session, so the app pushes a small precomputed payload into a shared
 * App Group container and the widget only ever renders that. Flow:
 *
 *   stores → buildWidgetSnapshot() → App Group UserDefaults → index.swift
 *
 * Two rules worth keeping:
 *
 *  1. Totals come from the same expression `getStreakDisplayFromStores()` uses,
 *     so the widget can never disagree with the app's own stats.
 *  2. Only raw counts and the week-start date are stored, never a rendered
 *     percentage. The widget recomputes at midnight, so a device that doesn't
 *     open the app still rolls its week over correctly.
 *
 * Every entry point here is best-effort. A widget that shows stale numbers is
 * a much better outcome than a save path that throws, so nothing in this file
 * is allowed to propagate.
 */
import Constants from "expo-constants";
import { Platform } from "react-native";

import { captureException } from "@/lib/errors";
import { countMomentEntries } from "@/lib/streak";
import { weekCaptureProgress } from "@/lib/yearCapture";
import { useAuthStore } from "@/store/authStore";
import { useEntryStore } from "@/store/entryStore";

/** Single key, so the widget can never observe a half-written payload. */
const SNAPSHOT_KEY = "snapshot";

/** Must match `LittleMomentsCaptureWidget.kind` in `targets/widget/index.swift`. */
const WIDGET_KIND = "LittleMomentsCaptureWidget";

/** Shape decoded by `Snapshot` in `targets/widget/index.swift`. */
export interface WidgetSnapshot {
  totalMoments: number;
  capturedDays: number;
  /** Monday-first, always 7 long. */
  days: boolean[];
  /** `yyyy-MM-dd` Monday the `days` flags describe. */
  weekStart: string;
}

function widgetAppGroup(): string | null {
  const group = Constants.expoConfig?.extra?.widgetAppGroup;
  return typeof group === "string" && group.length > 0 ? group : null;
}

/**
 * The App Group container, as exposed by `@bacons/apple-targets`' native module.
 * A `group` of `null` means the default suite, which is not what we ever want.
 */
interface ExtensionStorageNative {
  setString: (key: string, value: string, group: string | null) => void;
  remove: (key: string, group: string | null) => void;
  get: (key: string, group: string | null) => string | null;
  reloadWidget: (kind?: string | null) => void;
}

let extensionStorageNative: ExtensionStorageNative | null | undefined;

/**
 * The native module, resolved directly rather than through the package's JS
 * wrapper.
 *
 * That wrapper reads `expo.modules.ExtensionStorage` into a `const` at import
 * time and substitutes no-op stubs when it isn't there yet — so a write reports
 * success while going nowhere, which is impossible to tell apart from an empty
 * widget. It also never calls `ensureNativeModulesAreInstalled()`, so whether it
 * finds anything depends on when it happens to be first imported.
 * `requireOptionalNativeModule` installs the host object before looking, and
 * returns null honestly when the module really is absent — which it will be on a
 * binary built before the widget target existed.
 */
function getExtensionStorageNative(): ExtensionStorageNative | null {
  if (extensionStorageNative !== undefined) return extensionStorageNative;
  if (Platform.OS !== "ios") {
    extensionStorageNative = null;
    return null;
  }
  try {
    const { requireOptionalNativeModule } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy, matching lib/videoPoster.ts
      require("expo-modules-core") as typeof import("expo-modules-core");
    extensionStorageNative =
      requireOptionalNativeModule<ExtensionStorageNative>("ExtensionStorage");
  } catch {
    extensionStorageNative = null;
  }
  return extensionStorageNative;
}

/** The module plus the group to write into, or null when either is missing. */
function extensionStorage(): {
  native: ExtensionStorageNative;
  group: string;
} | null {
  const native = getExtensionStorageNative();
  if (!native) return null;

  const group = widgetAppGroup();
  if (!group) return null;

  return { native, group };
}

/** Reads the live stores synchronously. Safe to call from any save path. */
export function buildWidgetSnapshot(now: Date = new Date()): WidgetSnapshot {
  const entries = useEntryStore.getState().entries;
  const profile = useAuthStore.getState().profile;

  const week = weekCaptureProgress(entries, now);

  return {
    // Same reconciliation as `getStreakDisplayFromStores()` — the server total
    // can lead the local list right after a save, and the local list can lead
    // the server while an update is still in flight.
    totalMoments: Math.max(profile?.total_moments ?? 0, countMomentEntries(entries)),
    capturedDays: week.capturedDays,
    days: week.days,
    weekStart: week.weekStart,
  };
}

/**
 * Push current numbers to the widget and ask WidgetKit to redraw.
 *
 * Call after a moment saves, once entries finish loading, and when the app
 * backgrounds. Cheap enough to over-call — it's a `UserDefaults` write plus a
 * timeline invalidation, and iOS coalesces the reloads.
 */
export function syncWidgetSnapshot(): void {
  const target = extensionStorage();
  if (!target) return;

  try {
    target.native.setString(
      SNAPSHOT_KEY,
      JSON.stringify(buildWidgetSnapshot()),
      target.group
    );
    // Without this the widget keeps rendering its last timeline.
    target.native.reloadWidget(WIDGET_KIND);
  } catch (error) {
    captureException(error, { context: "syncWidgetSnapshot" });
  }
}

export interface WidgetDiagnostics {
  /** App Group the app is writing to, or null when `extra` is missing it. */
  appGroup: string | null;
  /** Whether the `ExtensionStorage` native module resolved at all. */
  nativeModuleAvailable: boolean;
  /** What's in the container right now, read back through the same API. */
  stored: string | null;
  error: string | null;
}

/**
 * Read the widget's plumbing back out, for the Dev Tools row in Settings.
 *
 * The three states worth telling apart, since none of them raise anything on
 * their own: the native module is missing (autolinking), the module is there
 * but nothing reads back after a write (the App Group isn't actually granted to
 * the app — usually the identifier in the Apple portal not matching character
 * for character), or the payload is present and the problem is on the Swift
 * side instead.
 */
export function inspectWidgetSnapshot(): WidgetDiagnostics {
  const group = widgetAppGroup();
  const native = getExtensionStorageNative();

  if (!native || !group) {
    return {
      appGroup: group,
      nativeModuleAvailable: Boolean(native),
      stored: null,
      error: native ? "extra.widgetAppGroup missing" : "ExtensionStorage module not found",
    };
  }

  try {
    const stored = native.get(SNAPSHOT_KEY, group);
    return {
      appGroup: group,
      nativeModuleAvailable: true,
      stored: typeof stored === "string" ? stored : null,
      error: null,
    };
  } catch (error) {
    return {
      appGroup: group,
      nativeModuleAvailable: true,
      stored: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Wipe the shared container on sign-out, so the widget falls back to its
 * "capture your first moment" state instead of showing the previous account's
 * numbers to whoever signs in next.
 */
export function clearWidgetSnapshot(): void {
  const target = extensionStorage();
  if (!target) return;

  try {
    target.native.remove(SNAPSHOT_KEY, target.group);
    target.native.reloadWidget(WIDGET_KIND);
  } catch (error) {
    captureException(error, { context: "clearWidgetSnapshot" });
  }
}
