import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface DraftMedia {
  uri: string;
  type: "image" | "video";
}

export interface Draft {
  title: string;
  body: string;
  media: DraftMedia[];
  dateISO: string;
  precision: "exact" | "month_only" | "year_only";
  isCrashAndBurn: boolean;
  savedAt: number;
}

interface DraftStore {
  /** Keyed by date string "yyyy-MM-dd" (or "undated" for imprecise entries). */
  drafts: Record<string, Draft>;
  saveDraft: (dateKey: string, draft: Draft) => void;
  getDraft: (dateKey: string) => Draft | undefined;
  clearDraft: (dateKey: string) => void;
  clearAll: () => void;
}

export const useDraftStore = create<DraftStore>()(
  persist(
    (set, get) => ({
      drafts: {},
      saveDraft: (dateKey, draft) =>
        set({ drafts: { ...get().drafts, [dateKey]: draft } }),
      getDraft: (dateKey) => get().drafts[dateKey],
      clearDraft: (dateKey) => {
        const { [dateKey]: _, ...rest } = get().drafts;
        set({ drafts: rest });
      },
      clearAll: () => set({ drafts: {} }),
    }),
    {
      name: "little-moments-drafts",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
