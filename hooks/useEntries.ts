import { useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useEntryStore, type Entry } from "@/store/entryStore";
import { useAuthStore } from "@/store/authStore";
import { updateStreakAfterEntry } from "@/lib/streak";
import { format } from "date-fns";
import { scheduleReviewAfterMomentMilestone } from "@/lib/ratingPrompt";
import { enqueueEntriesForPrefetch } from "@/lib/mediaPrefetch";

export function useEntries() {
  const {
    entries,
    selectedDate,
    todayEntry,
    isLoading,
    setEntries,
    setTodayEntry,
    setIsLoading,
    addEntry,
    updateEntry,
    deleteEntry: removeEntry,
  } = useEntryStore();
  const userId = useAuthStore((s) => s.user?.id ?? null);

  const fetchEntries = useCallback(async (pinnedEntryId?: string) => {
    if (!userId) return;
    setIsLoading(true);
    const { data } = await supabase
      .from("entries")
      .select("*, entry_media(*)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (data) {
      const mapped = data.map((e) => ({
        ...e,
        media: e.entry_media ?? [],
        is_pinned: Boolean((e as { is_pinned?: boolean }).is_pinned),
      })) as Entry[];
      const prev = useEntryStore.getState().entries;
      const serverIds = new Set(mapped.map((e) => e.id));
      let merged: Entry[];
      if (pinnedEntryId && !serverIds.has(pinnedEntryId)) {
        const pinned = prev.find((e) => e.id === pinnedEntryId);
        merged = pinned ? [pinned, ...mapped] : mapped;
      } else {
        merged = mapped;
      }
      merged.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setEntries(merged);

      const today = format(new Date(), "yyyy-MM-dd");
      const todayE = merged.find((e) => e.entry_date === today) ?? null;
      setTodayEntry(todayE);

      // Warm the media cache in the background. The prefetcher is a singleton
      // priority worker (lib/mediaPrefetch.ts) — calling this from every
      // `fetchEntries` is cheap because completed items are de-duped. By
      // doing this as soon as entries land we give the Chapters grid the
      // best chance of hitting the disk cache on first paint.
      enqueueEntriesForPrefetch(merged);
    }
    setIsLoading(false);
  }, [userId]);

  const saveEntry = useCallback(
    async (
      entryData: Omit<
        Entry,
        "id" | "user_id" | "created_at" | "updated_at" | "media" | "is_pinned"
      >
    ) => {
      if (!userId) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("entries")
        .insert({ ...entryData, user_id: userId })
        .select()
        .single();

      if (error) throw error;
      addEntry({
        ...(data as Entry),
        is_pinned: Boolean((data as { is_pinned?: boolean }).is_pinned),
      });
      const streakMeta = await updateStreakAfterEntry(userId);
      scheduleReviewAfterMomentMilestone({
        newTotalMoments: streakMeta.newTotalMoments,
        streakJustHitMilestone: streakMeta.streakJustHitMilestone,
      });
      void supabase.functions
        .invoke("process-threads", { body: { entry_id: data.id } })
        .catch(() => {});
      return {
        ...(data as Entry),
        is_pinned: Boolean((data as { is_pinned?: boolean }).is_pinned),
      };
    },
    [userId]
  );

  const editEntry = useCallback(
    async (id: string, updates: Partial<Entry>) => {
      const prev = useEntryStore.getState().entries.find((e) => e.id === id);
      updateEntry(id, updates);
      const { error } = await supabase
        .from("entries")
        .update(updates)
        .eq("id", id);
      if (error) {
        if (prev) {
          const revert = Object.fromEntries(
            Object.keys(updates).map((key) => [
              key,
              prev[key as keyof Entry],
            ])
          ) as Partial<Entry>;
          updateEntry(id, revert);
        }
        throw error;
      }
    },
    [updateEntry]
  );

  const deleteEntry = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("entries")
        .delete()
        .eq("id", id);
      if (error) throw error;
      removeEntry(id);
    },
    []
  );

  return {
    entries,
    selectedDate,
    todayEntry,
    isLoading,
    fetchEntries,
    saveEntry,
    editEntry,
    deleteEntry,
  };
}
