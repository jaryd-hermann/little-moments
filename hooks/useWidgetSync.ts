import { useEffect } from "react";
import { AppState, Platform } from "react-native";

import { clearWidgetSnapshot, syncWidgetSnapshot } from "@/lib/widgetSnapshot";
import { useAuthStore } from "@/store/authStore";
import { useEntryStore } from "@/store/entryStore";

/**
 * Bursts of store writes are common — a save adds an entry, then the profile
 * total lands, then the feed refetches. Coalescing means WidgetKit gets one
 * reload instead of three.
 */
const COALESCE_MS = 400;

/**
 * Keeps the iOS home screen widget in step with the app.
 *
 * Subscribing to the stores rather than calling `syncWidgetSnapshot()` from
 * each save site keeps this to one mount point: adds, edits, deletes, feed
 * refetches and profile updates all flow through `entries` / `total_moments`,
 * so they're all covered here and can't be forgotten in a new capture flow.
 *
 * Mounted once from `app/_layout.tsx`.
 */
export function useWidgetSync(): void {
  useEffect(() => {
    if (Platform.OS !== "ios") return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      // Signed out means the next person to open the phone shouldn't see the
      // previous account's totals sitting on the home screen.
      if (useAuthStore.getState().user) syncWidgetSnapshot();
      else clearWidgetSnapshot();
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, COALESCE_MS);
    };

    schedule();

    const unsubscribeEntries = useEntryStore.subscribe((state, prev) => {
      if (state.entries !== prev.entries) schedule();
    });

    const unsubscribeAuth = useAuthStore.subscribe((state, prev) => {
      const userChanged = state.user?.id !== prev.user?.id;
      const totalChanged =
        state.profile?.total_moments !== prev.profile?.total_moments;
      if (userChanged || totalChanged) schedule();
    });

    const appState = AppState.addEventListener("change", (next) => {
      // Written synchronously rather than debounced — a pending timer isn't
      // guaranteed to run once iOS suspends us, and backgrounding is the
      // moment the widget is most likely to be looked at next.
      if (next !== "active") flush();
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribeEntries();
      unsubscribeAuth();
      appState.remove();
    };
  }, []);
}
