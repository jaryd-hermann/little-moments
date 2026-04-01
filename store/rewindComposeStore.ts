import { create } from "zustand";

interface RewindComposeStore {
  photoUri: string | null;
  photoDate: string | null;
  setRewindComposeContext: (uri: string | null, date: string | null) => void;
}

export const useRewindComposeStore = create<RewindComposeStore>((set) => ({
  photoUri: null,
  photoDate: null,
  setRewindComposeContext: (uri, date) =>
    set({ photoUri: uri, photoDate: date }),
}));
