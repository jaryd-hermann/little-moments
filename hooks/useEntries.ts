import { useCallback, useRef } from "react";
import { InteractionManager } from "react-native";
import { supabase } from "@/lib/supabase";
import {
  useEntryStore,
  type Entry,
  type EntryMetadata,
} from "@/store/entryStore";
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
  const lastFetchAtRef = useRef(0);

  const fetchEntries = useCallback(
    async (
      pinnedEntryId?: string,
      opts?: { force?: boolean; background?: boolean }
    ) => {
    if (!userId) return;
    const force = opts?.force ?? Boolean(pinnedEntryId);
    if (
      !force &&
      Date.now() - lastFetchAtRef.current < 60_000 &&
      useEntryStore.getState().entries.length > 0
    ) {
      return;
    }
    if (!opts?.background) {
      setIsLoading(true);
    }
    // `entry_metadata` rides along for the People / Themes movie buckets on
    // Chapters. It's two small columns per moment — cheaper than a second
    // round trip on a screen that already has every entry in hand.
    const { data } = await supabase
      .from("entries")
      .select("*, entry_media(*), entry_metadata(people, primary_theme)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (data) {
      const mapped = data.map((e) => {
        const { entry_metadata, ...rest } = e as typeof e & {
          entry_metadata?: EntryMetadata | EntryMetadata[] | null;
        };
        const meta = Array.isArray(entry_metadata)
          ? (entry_metadata[0] ?? null)
          : (entry_metadata ?? null);
        return {
          ...rest,
          media: e.entry_media ?? [],
          is_pinned: Boolean((e as { is_pinned?: boolean }).is_pinned),
          metadata: meta
            ? { people: meta.people ?? [], primary_theme: meta.primary_theme }
            : null,
        };
      }) as Entry[];
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
      lastFetchAtRef.current = Date.now();

      const today = format(new Date(), "yyyy-MM-dd");
      const todayE = merged.find((e) => e.entry_date === today) ?? null;
      setTodayEntry(todayE);

      // Still-only warm — defer until after navigation/scroll so Capture stays snappy.
      InteractionManager.runAfterInteractions(() => {
        enqueueEntriesForPrefetch(merged);
      });
    }
    if (!opts?.background) {
      setIsLoading(false);
    }
  },
    [userId, setEntries, setTodayEntry, setIsLoading]
  );

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
