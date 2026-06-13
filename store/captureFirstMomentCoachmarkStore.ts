import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type CoachmarkStep = 1 | 2 | 3 | 4 | 5 | 6;

export type CoachmarkTargetRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CoachmarkTargets = {
  pin?: CoachmarkTargetRect;
  digDeeper?: CoachmarkTargetRect;
  captureTab?: CoachmarkTargetRect;
  capsuleTab?: CoachmarkTargetRect;
  chaptersTab?: CoachmarkTargetRect;
  connectTab?: CoachmarkTargetRect;
};

interface CaptureFirstMomentCoachmarkStore {
  visible: boolean;
  step: CoachmarkStep;
  targets: CoachmarkTargets;
  /** Bumped when coachmarks need fresh measureInWindow reads. */
  remeasureTick: number;
  /** Persisted — first-moment coachmarks still owed (survives app restarts). */
  pendingAfterFirstCapture: boolean;
  /** Persisted — user finished or skipped the tour. */
  completedAfterFirstCapture: boolean;
  queueAfterFirstCapture: () => void;
  start: () => void;
  setTargets: (targets: Partial<CoachmarkTargets>) => void;
  bumpRemeasure: () => void;
  advance: () => void;
  dismiss: () => void;
  /** Dev-only: clear persisted completion and launch the 6-step tour. */
  restartForDev: () => void;
}

const TOTAL_STEPS = 6;

function scheduleRemeasure(bumpRemeasure: () => void) {
  requestAnimationFrame(() => {
    bumpRemeasure();
    setTimeout(bumpRemeasure, 120);
    setTimeout(bumpRemeasure, 400);
  });
}

export const useCaptureFirstMomentCoachmarkStore =
  create<CaptureFirstMomentCoachmarkStore>()(
    persist(
      (set, get) => ({
        visible: false,
        step: 1,
        targets: {},
        remeasureTick: 0,
        pendingAfterFirstCapture: false,
        completedAfterFirstCapture: false,
        queueAfterFirstCapture: () => {
          if (get().completedAfterFirstCapture) return;
          set({ pendingAfterFirstCapture: true });
        },
        start: () => {
          set({ visible: true, step: 1 });
          scheduleRemeasure(get().bumpRemeasure);
        },
        setTargets: (targets) =>
          set({ targets: { ...get().targets, ...targets } }),
        bumpRemeasure: () =>
          set({ remeasureTick: get().remeasureTick + 1 }),
        advance: () => {
          const step = get().step;
          if (step >= TOTAL_STEPS) {
            set({
              visible: false,
              step: 1,
              targets: {},
              pendingAfterFirstCapture: false,
              completedAfterFirstCapture: true,
            });
            return;
          }
          set({ step: (step + 1) as CoachmarkStep });
          scheduleRemeasure(get().bumpRemeasure);
        },
        dismiss: () =>
          set({
            visible: false,
            step: 1,
            targets: {},
            pendingAfterFirstCapture: false,
            completedAfterFirstCapture: true,
          }),
        restartForDev: () => {
          set({
            visible: true,
            step: 1,
            targets: {},
            pendingAfterFirstCapture: true,
            completedAfterFirstCapture: false,
          });
          scheduleRemeasure(get().bumpRemeasure);
        },
      }),
      {
        name: "little-moments-capture-first-moment-coachmarks",
        storage: createJSONStorage(() => AsyncStorage),
        partialize: (s) => ({
          pendingAfterFirstCapture: s.pendingAfterFirstCapture,
          completedAfterFirstCapture: s.completedAfterFirstCapture,
        }),
      }
    )
  );

export function coachmarkTargetForStep(
  step: CoachmarkStep,
  targets: CoachmarkTargets
): CoachmarkTargetRect | undefined {
  switch (step) {
    case 1:
      return targets.pin;
    case 2:
      return targets.digDeeper;
    case 3:
      return targets.captureTab;
    case 4:
      return targets.capsuleTab;
    case 5:
      return targets.chaptersTab;
    case 6:
      return targets.connectTab;
    default:
      return undefined;
  }
}
