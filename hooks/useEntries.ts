import { useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useEntryStore, type Entry } from "@/store/entryStore";
import { useAuthStore } from "@/store/authStore";
import { updateStreakAfterEntry } from "@/lib/streak";
import { format } from "date-fns";

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
  const user = useAuthStore((s) => s.user);

  const fetchEntries = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const { data } = await supabase
      .from("entries")
      .select("*, entry_media(*)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (data) {
      const mapped = data.map((e) => ({
        ...e,
        media: e.entry_media ?? [],
      })) as Entry[];
      setEntries(mapped);

      const today = format(new Date(), "yyyy-MM-dd");
      const todayE = mapped.find((e) => e.entry_date === today) ?? null;
      setTodayEntry(todayE);
    }
    setIsLoading(false);
  }, [user]);

  const saveEntry = useCallback(
    async (
      entryData: Omit<
        Entry,
        "id" | "user_id" | "created_at" | "updated_at" | "media"
      >
    ) => {
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("entries")
        .insert({ ...entryData, user_id: user.id })
        .select()
        .single();

      if (error) throw error;
      addEntry(data as Entry);
      await updateStreakAfterEntry(user.id);
      return data as Entry;
    },
    [user]
  );

  const editEntry = useCallback(
    async (id: string, updates: Partial<Entry>) => {
      const { error } = await supabase
        .from("entries")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
      updateEntry(id, updates);
    },
    []
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
