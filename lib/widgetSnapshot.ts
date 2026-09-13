/**
 * Feeds the iOS home screen widget.
 *
 * The widget runs in its own process with no access to Zustand, Supabase or
 * the session, so the app pushes a small precomputed payload into a shared
 * App Group container and the widget only ever renders that. Flow:
 *
 *   stores → buildWidgetSnapshot() → snapshot.json in the App Group → index.swift
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
import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";

import { captureException } from "@/lib/errors";
import { countMomentEntries } from "@/lib/streak";
import { weekCaptureProgress } from "@/lib/yearCapture";
import { useAuthStore } from "@/store/authStore";
import { useEntryStore } from "@/store/entryStore";

/**
 * One file holding the whole payload, so the widget can never read a half-applied
 * write. Read by `loadSnapshot()` in `targets/widget/index.swift`.
 *
 * A file rather than App Group `UserDefaults`, which is what this used to use:
 * the only way to reach those from JS is `@bacons/apple-targets`' native module,
 * and that module doesn't resolve at runtime — every write went nowhere while
 * reporting success. `expo-file-system` can address the same container and is
 * linked and working, so the payload takes a route we can actually verify.
 */
const SNAPSHOT_FILENAME = "snapshot.json";

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
 * The shared App Group directory, or null when the app can't see it.
 *
 * Doubles as the entitlement check: `appleSharedContainers` is keyed by the
 * groups iOS has actually granted this binary, so a missing key means the App
 * Group isn't really attached to the app — no amount of writing will help.
 */
function sharedContainer(): Directory | null {
  if (Platform.OS !== "ios") return null;

  const group = widgetAppGroup();
  if (!group) return null;

  try {
    return Paths.appleSharedContainers[group] ?? null;
  } catch {
    return null;
  }
}

function snapshotFile(): File | null {
  const container = sharedContainer();
  if (!container) return null;

  try {
    return new File(container, SNAPSHOT_FILENAME);
  } catch {
    return null;
  }
}

/**
 * `WidgetCenter.reloadTimelines` is only reachable through
 * `@bacons/apple-targets`' native module, which doesn't currently resolve — so
 * this is attempted and allowed to fail. Without it the widget still picks the
 * new payload up on its own refresh, which `getTimeline` in `index.swift` keeps
 * short for exactly this reason.
 */
function requestWidgetReload(): void {
  if (Platform.OS !== "ios") return;

  try {
    const { requireOptionalNativeModule } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy, matching lib/videoPoster.ts
      require("expo-modules-core") as typeof import("expo-modules-core");
    const native = requireOptionalNativeModule<{
      reloadWidget: (kind?: string | null) => void;
    }>("ExtensionStorage");
    native?.reloadWidget(WIDGET_KIND);
  } catch {
    /* the timeline policy is the fallback */
  }
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
 * backgrounds. Cheap enough to over-call — it's one small file write plus a
 * timeline invalidation, and iOS coalesces the reloads.
 */
export function syncWidgetSnapshot(): void {
  const file = snapshotFile();
  if (!file) return;

  try {
    // Creates the file when it isn't there yet, and replaces it wholesale
    // otherwise, so the widget never sees a partial payload.
    file.write(JSON.stringify(buildWidgetSnapshot()));
    requestWidgetReload();
  } catch (error) {
    captureException(error, { context: "syncWidgetSnapshot" });
  }
}

export interface WidgetDiagnostics {
  /** App Group the app is writing to, or null when `extra` is missing it. */
  appGroup: string | null;
  /**
   * Whether iOS actually granted this binary that App Group. False means the
   * entitlement isn't really in place, whatever the config says.
   */
  containerAvailable: boolean;
  /**
   * Every App Group iOS did grant. Tells apart "no groups at all" (a stale
   * provisioning profile) from "the other groups but not ours" (the identifier
   * not matching the portal character for character).
   */
  grantedGroups: string[];
  /** Whether an immediate WidgetKit reload is possible, as opposed to waiting. */
  reloadAvailable: boolean;
  /** The payload sitting in the container right now. */
  stored: string | null;
  error: string | null;
}

/**
 * Read the widget's plumbing back out, for the row in Settings.
 *
 * Nothing in this file throws by design, so this is the only way to see which
 * end is broken from a device: no container means the App Group isn't granted,
 * an empty file means the write failed, and a payload here with an empty widget
 * puts the problem on the Swift side.
 */
export function inspectWidgetSnapshot(): WidgetDiagnostics {
  const group = widgetAppGroup();
  const container = sharedContainer();
  const grantedGroups = (() => {
    try {
      return Object.keys(Paths.appleSharedContainers);
    } catch {
      return [];
    }
  })();
  const reloadAvailable = (() => {
    try {
      const { requireOptionalNativeModule } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy, matching lib/videoPoster.ts
        require("expo-modules-core") as typeof import("expo-modules-core");
      return Boolean(requireOptionalNativeModule("ExtensionStorage"));
    } catch {
      return false;
    }
  })();

  if (!container) {
    return {
      appGroup: group,
      containerAvailable: false,
      grantedGroups,
      reloadAvailable,
      stored: null,
      error: group
        ? "App Group not granted to this build"
        : "extra.widgetAppGroup missing",
    };
  }

  try {
    const file = new File(container, SNAPSHOT_FILENAME);
    return {
      appGroup: group,
      containerAvailable: true,
      grantedGroups,
      reloadAvailable,
      stored: file.exists ? file.textSync() : null,
      error: null,
    };
  } catch (error) {
    return {
      appGroup: group,
      containerAvailable: true,
      grantedGroups,
      reloadAvailable,
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
  const file = snapshotFile();
  if (!file) return;

  try {
    if (file.exists) file.delete();
    requestWidgetReload();
  } catch (error) {
    captureException(error, { context: "clearWidgetSnapshot" });
  }
}
