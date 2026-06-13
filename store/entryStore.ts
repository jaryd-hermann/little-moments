import { create } from "zustand";
import type { PhotoBucket } from "@/lib/photoBucket";

export interface Entry {
  id: string;
  user_id: string;
  title: string | null;
  body: string;
  ai_enhanced_body: string | null;
  original_body: string | null;
  entry_type: "moment" | "crash_and_burn" | "chapter";
  entry_date: string | null;
  entry_month: number | null;
  entry_year: number;
  date_precision: "exact" | "month_only" | "year_only";
  word_of_day: string | null;
  ai_conversation: Record<string, unknown> | null;
  is_ai_enhanced: boolean;
  streak_day_number: number | null;
  chapter_id: string | null;
  is_pinned: boolean;
  /** Recency bucket of the photo behind this moment (null if no photo). */
  photo_bucket_at_save?: PhotoBucket | null;
  /** Days between photo capture and save time (null if no photo). */
  photo_age_days_at_save?: number | null;
  created_at: string;
  updated_at: string;
  media?: EntryMedia[];
}

export interface EntryMedia {
  id: string;
  entry_id: string;
  user_id: string;
  storage_path: string;
  storage_url: string | null;
  media_type: "image" | "video";
  display_order: number;
  created_at: string;
  /** Original capture time of the photo (EXIF / MediaLibrary creationTime). */
  taken_at?: string | null;
  /** Paired video for iOS Live Photos. The image row stores both. */
  paired_video_storage_path?: string | null;
  paired_video_storage_url?: string | null;
  /** Human-readable location label (e.g. "Tel Aviv, Israel") derived from
   *  the photo's EXIF geo. Nullable — most photos won't have geo metadata. */
  location_name?: string | null;
  location_latitude?: number | null;
  location_longitude?: number | null;
}

interface EntryStore {
  entries: Entry[];
  selectedDate: Date;
  todayEntry: Entry | null;
  isLoading: boolean;
  setEntries: (entries: Entry[]) => void;
  setSelectedDate: (date: Date) => void;
  setTodayEntry: (entry: Entry | null) => void;
  setIsLoading: (loading: boolean) => void;
  addEntry: (entry: Entry) => void;
  updateEntry: (id: string, updates: Partial<Entry>) => void;
  deleteEntry: (id: string) => void;
}

export const useEntryStore = create<EntryStore>((set) => ({
  entries: [],
  selectedDate: new Date(),
  todayEntry: null,
  isLoading: false,
  setEntries: (entries) => set({ entries }),
  setSelectedDate: (selectedDate) => set({ selectedDate }),
  setTodayEntry: (todayEntry) => set({ todayEntry }),
  setIsLoading: (isLoading) => set({ isLoading }),
  addEntry: (entry) =>
    set((state) => ({
      entries: [
        {
          ...entry,
          media: entry.media ?? [],
          is_pinned: Boolean(entry.is_pinned),
        },
        ...state.entries,
      ],
    })),
  updateEntry: (id, updates) =>
    set((state) => ({
      entries: state.entries.map((e) =>
        e.id === id ? { ...e, ...updates } : e
      ),
    })),
  deleteEntry: (id) =>
    set((state) => ({
      entries: state.entries.filter((e) => e.id !== id),
    })),
}));
