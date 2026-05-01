import { create } from "zustand";

interface CaptureIntent {
  source: "capture_home";
  photoUri?: string;
  photoDate?: number;
}

interface CaptureIntentStore {
  intent: CaptureIntent | null;
  setIntent: (intent: CaptureIntent) => void;
  consumeIntent: () => CaptureIntent | null;
}

export const useCaptureIntentStore = create<CaptureIntentStore>((set, get) => ({
  intent: null,
  setIntent: (intent) => set({ intent }),
  consumeIntent: () => {
    const current = get().intent;
    if (current) set({ intent: null });
    return current;
  },
}));
