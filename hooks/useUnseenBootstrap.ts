import { useEffect } from "react";
import { AppState } from "react-native";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import { useUnseenStore } from "@/store/unseenStore";

/**
 * Lightweight bootstrap for the tab-bar attention animation.
 *
 * `useThreads` / `useChapters` only mount on their own tabs, so without this
 * hook the unseen counts in `useUnseenStore` would stay at zero until the
 * user actually visited Connect or Chapters — defeating the whole point of
 * the shimmer cue.
 *
 * This hook (mounted once at the (tabs) layout root):
 *   1. Pulls just the unseen counts on first auth, using head-only queries
 *      so it costs nothing on the wire.
 *   2. Re-pulls when the app comes back to the foreground (e.g. a server-side
 *      cron may have produced new chapters / threads while the app was
 *      backgrounded).
 *
 * It does NOT subscribe in real-time — the per-tab hooks already overwrite
 * the same store keys after they fetch the full lists, so any divergence is
 * corrected the moment the user lands on Connect / Chapters.
 */
export function useUnseenBootstrap() {
  const userId = useAuthStore((s) => s.user?.id ?? null);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const refresh = async () => {
      try {
        const [{ count: tCount }, { count: cCount }] = await Promise.all([
          supabase
            .from("threads")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("dismissed", false)
            .is("viewed_at", null),
          supabase
            .from("chapters")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .is("viewed_at", null),
        ]);
        if (cancelled) return;
        useUnseenStore.getState().setUnseenThreadCount(tCount ?? 0);
        useUnseenStore.getState().setUnseenChapterCount(cCount ?? 0);
      } catch (err) {
        console.warn(
          "[useUnseenBootstrap] count refresh failed:",
          err instanceof Error ? err.message : err
        );
      }
    };

    void refresh();

    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void refresh();
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [userId]);
}
