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
 * Resolved lazily rather than at module scope. This file is reachable from JS
 * that can ship over EAS Update to a binary built before the widget target
 * existed, where the native module is absent — the package itself falls back
 * to no-ops in that case, and the try/catch covers anything it doesn't.
 */
function extensionStorage(): {
  storage: { set: (key: string, value: string) => void; remove: (key: string) => void };
  reload: (kind?: string) => void;
} | null {
  if (Platform.OS !== "ios") return null;

  const group = widgetAppGroup();
  if (!group) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- must stay lazy; a static import would evaluate the native module at bundle load
    const { ExtensionStorage } = require("@bacons/apple-targets");
    return {
      storage: new ExtensionStorage(group),
      reload: ExtensionStorage.reloadWidget,
    };
  } catch {
    return null;
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
 * backgrounds. Cheap enough to over-call — it's a `UserDefaults` write plus a
 * timeline invalidation, and iOS coalesces the reloads.
 */
export function syncWidgetSnapshot(): void {
  const target = extensionStorage();
  if (!target) return;

  try {
    target.storage.set(SNAPSHOT_KEY, JSON.stringify(buildWidgetSnapshot()));
    // Without this the widget keeps rendering its last timeline.
    target.reload(WIDGET_KIND);
  } catch (error) {
    captureException(error, { context: "syncWidgetSnapshot" });
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
    target.storage.remove(SNAPSHOT_KEY);
    target.reload(WIDGET_KIND);
  } catch (error) {
    captureException(error, { context: "clearWidgetSnapshot" });
  }
}
