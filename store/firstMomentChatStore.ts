import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { RememberMostChoice } from "@/lib/rememberMost";
import type { MediaAsset } from "@/hooks/useMediaLibrary";

/**
 * Beats of the post-first-capture chat with Jaryd. Linear apart from the
 * core-memory question, which forks into `coreSaved` or `coreSkipped`; both
 * branches then offer Magic Fill, then Dig Deeper, and rejoin at `outro`.
 */
export type FirstMomentChatStep =
  /** Before any moment exists: pick one from the favorites carousel. */
  | "capturePick"
  /** Picked — explain the 60s caption and offer speaking or typing. */
  | "captureCaption"
  /** Moment preview, core-memory explanation, and the ask. */
  | "intro"
  /** They made it core — celebrate, then offer Magic Fill. */
  | "coreSaved"
  /** They declined — acknowledge, then offer Magic Fill. */
  | "coreSkipped"
  /** Magic Fill is behind them either way; offer Dig Deeper. */
  | "digDeeperOffer"
  /** They said yes with several moments to choose from — show the carousel. */
  | "digDeeperPick"
  /** Jaryd's sign-off, closing on "what do you want to remember most?". */
  | "outro"
  /** Their answer (or skip) acknowledged; the exit CTA lives here. */
  | "rememberAnswered";

/** A transcript entry before the store assigns it a key. */
export type ChatTurnBody =
  | { role: "jaryd"; text: string }
  | { role: "user"; text: string }
  /** Magic Fill's new moments, as list rows. */
  | { role: "momentList"; entryIds: string[] }
  /** The moment they just made core, receipt-style. */
  | { role: "coreMemoryCard"; entryId: string }
  /** The moment they just took through Dig Deeper, the same way. */
  | { role: "digDeeperCard"; entryId: string }
  /** The "pick a moment for Dig Deeper" carousel. */
  | { role: "digDeeperPick" }
  /** The "what do you want to remember most?" option carousel. */
  | { role: "rememberPick" }
  /** The favorites picker shown before their first moment exists. */
  | { role: "capturePick" };

export type ChatTurn = ChatTurnBody & { key: string };

/**
 * A queued beat: either a line Jaryd types out, or an attachment. The `id`
 * makes draining idempotent — see `advanceQueue`.
 */
export type ChatScriptItem = { id: string } & (
  | { text: string }
  | { turn: ChatTurnBody }
);

/** Script beats before the queue assigns them ids. */
export type ChatScriptDraft = { text: string } | { turn: ChatTurnBody };

interface FirstMomentChatStore {
  visible: boolean;
  /** The moment this chat is about. */
  entryId: string | null;
  step: FirstMomentChatStep;
  /**
   * Persisted — the chat is a once-per-account event. Set on close however the
   * chat ends (finished, skipped, or X'd out of).
   */
  completed: boolean;
  /**
   * The conversation so far. Lives here rather than in the host's state so
   * that navigating away — which can remount the host — doesn't wipe it.
   */
  turns: ChatTurn[];
  /** Beats waiting to land, so a remount mid-typing resumes where it left off. */
  pending: ChatScriptItem[];
  /** Steps whose lines are already queued, so they're never narrated twice. */
  narratedSteps: FirstMomentChatStep[];
  turnSeq: number;
  queueSeq: number;
  /**
   * Set when we hand off to Magic Fill, so returning from it reopens the chat
   * rather than dropping the user back on Capture mid-conversation.
   */
  awaitingMagicFillReturn: boolean;
  /** Where to put them back if they abandon Magic Fill without finishing. */
  stepBeforeMagicFill: FirstMomentChatStep | null;
  /** The same hand-off bookkeeping, for the trip out to Dig Deeper. */
  awaitingDigDeeperReturn: boolean;
  /**
   * Hold an opaque screen over the tabs while we're out at Magic Fill or Dig
   * Deeper — see `FirstMomentChatHandoffCover`. Deliberately left out of
   * `partialize`: restored from storage it would cover the app with no trip to
   * come back from.
   */
  coveringHandoff: boolean;
  setCoveringHandoff: (covering: boolean) => void;
  /**
   * Moment ids as they stood when we left for Magic Fill. Anything not in
   * here on the way back is something Magic Fill added, which is how the
   * recap knows what to count and show.
   */
  momentIdsBeforeMagicFill: string[];
  /** Which moment they took into Dig Deeper, so we can tell if it got saved. */
  digDeeperEntryId: string | null;
  /**
   * Their answer to the closing question, or `"skipped"`. Drives Jaryd's reply
   * and locks the carousel, so it has to outlive a remount like the thread does.
   */
  rememberChoice: RememberMostChoice | null;
  /**
   * Set when the chat sends them to Capture to caption their pick. Distinguishes
   * "first moment saved from inside this chat" (resume the thread) from "first
   * moment saved on Capture the classic way" (open a fresh chat).
   */
  awaitingFirstCaptureReturn: boolean;
  /**
   * They backed out of the pre-capture chat. Stops it reopening on top of the
   * Capture screen they asked to be left alone on, without marking the chat
   * done — capturing a first moment still earns them the rest of it.
   */
  declinedBeforeCapture: boolean;
  /**
   * The moment they picked from the favorites carousel, held until they choose
   * how to caption it. Persisted so a remount mid-decision doesn't lose the
   * pick and leave the caption buttons doing nothing.
   */
  pickedAsset: MediaAsset | null;
  setPickedAsset: (asset: MediaAsset | null) => void;

  /**
   * Open before any moment exists, at the favorites picker. The chat drives the
   * first capture from here rather than dropping them on Capture cold.
   */
  startBeforeCapture: () => void;
  /** Off to Capture to caption the pick; we reopen once it saves. */
  handOffToFirstCapture: () => void;
  /**
   * They X'd out before capturing. Wipe back to never-started rather than
   * completing, so capturing later still earns them the chat as it always has.
   */
  exitBeforeCapture: () => void;
  /**
   * Their first moment just saved. Resumes the thread if this chat sent them to
   * capture it, otherwise starts fresh — the classic post-capture entry point.
   */
  start: (entryId: string) => void;
  setStep: (step: FirstMomentChatStep) => void;
  /** Append to the transcript outside the queue (the user's own replies). */
  pushTurn: (turn: ChatTurnBody) => void;
  /**
   * Land the head of the queue as a transcript entry. Ignores anything but the
   * current head, so a re-fired timer or a re-run effect holding a stale
   * closure can't append the same beat twice.
   */
  advanceQueue: (itemId: string, turn: ChatTurnBody) => void;
  enqueue: (items: ChatScriptDraft[], step: FirstMomentChatStep) => void;
  /** Leave for Magic Fill; the chat reopens at the Dig Deeper offer. */
  handOffToMagicFill: (momentIds: string[]) => void;
  returnFromMagicFill: () => void;
  /** Came back without finishing — restore the step that offered it. */
  abandonMagicFill: () => void;
  setRememberChoice: (choice: RememberMostChoice) => void;
  /** Leave for Dig Deeper; the chat reopens at `outro` on the way back. */
  handOffToDigDeeper: (entryId: string) => void;
  returnFromDigDeeper: () => void;
  /** Close for good. Callers should show the paywall after this. */
  close: () => void;
  resetForNewAccount: () => void;
}

const EMPTY_THREAD = {
  turns: [] as ChatTurn[],
  pending: [] as ChatScriptItem[],
  narratedSteps: [] as FirstMomentChatStep[],
  turnSeq: 0,
  queueSeq: 0,
};

export const useFirstMomentChatStore = create<FirstMomentChatStore>()(
  persist(
    (set, get) => ({
      visible: false,
      entryId: null,
      step: "intro",
      completed: false,
      ...EMPTY_THREAD,
      awaitingMagicFillReturn: false,
      stepBeforeMagicFill: null,
      awaitingDigDeeperReturn: false,
      coveringHandoff: false,
      momentIdsBeforeMagicFill: [],
      digDeeperEntryId: null,
      rememberChoice: null,
      awaitingFirstCaptureReturn: false,
      declinedBeforeCapture: false,
      pickedAsset: null,

      setCoveringHandoff: (covering) => set({ coveringHandoff: covering }),
      setPickedAsset: (asset) => set({ pickedAsset: asset }),
      startBeforeCapture: () => {
        const s = get();
        if (s.completed || s.visible || s.awaitingFirstCaptureReturn) return;
        set({
          visible: true,
          entryId: null,
          step: "capturePick",
          ...EMPTY_THREAD,
          momentIdsBeforeMagicFill: [],
          stepBeforeMagicFill: null,
          digDeeperEntryId: null,
          rememberChoice: null,
          declinedBeforeCapture: false,
          pickedAsset: null,
        });
      },
      handOffToFirstCapture: () =>
        set({ visible: false, awaitingFirstCaptureReturn: true }),
      exitBeforeCapture: () =>
        set({
          visible: false,
          completed: false,
          entryId: null,
          step: "intro",
          ...EMPTY_THREAD,
          awaitingFirstCaptureReturn: false,
          declinedBeforeCapture: true,
          pickedAsset: null,
        }),
      start: (entryId) => {
        const s = get();
        if (s.completed) return;
        if (s.awaitingFirstCaptureReturn) {
          // Clear the pre-capture beats. Picking a photo and choosing how to
          // caption it were scaffolding for the capture that just happened, and
          // the saved moment now sitting at the top of the chat says all of it —
          // so the conversation reads as though it starts here. `narratedSteps`
          // is left alone so those beats can't come back.
          set({
            visible: true,
            awaitingFirstCaptureReturn: false,
            entryId,
            step: "intro",
            turns: [],
            pending: [],
            pickedAsset: null,
          });
          return;
        }
        set({
          visible: true,
          entryId,
          step: "intro",
          ...EMPTY_THREAD,
          momentIdsBeforeMagicFill: [],
          stepBeforeMagicFill: null,
          digDeeperEntryId: null,
          rememberChoice: null,
        });
      },
      setStep: (step) => set({ step }),
      pushTurn: (turn) => {
        const { turns, turnSeq } = get();
        set({
          turns: [...turns, { ...turn, key: `t${turnSeq + 1}` }],
          turnSeq: turnSeq + 1,
        });
      },
      advanceQueue: (itemId, turn) => {
        const { turns, turnSeq, pending } = get();
        if (pending[0]?.id !== itemId) return;
        set({
          turns: [...turns, { ...turn, key: `t${turnSeq + 1}` }],
          turnSeq: turnSeq + 1,
          pending: pending.slice(1),
        });
      },
      enqueue: (items, step) => {
        const { pending, narratedSteps, queueSeq } = get();
        if (narratedSteps.includes(step)) return;
        set({
          pending: [
            ...pending,
            ...items.map((item, i) => ({ ...item, id: `q${queueSeq + i + 1}` })),
          ],
          queueSeq: queueSeq + items.length,
          narratedSteps: [...narratedSteps, step],
        });
      },
      handOffToMagicFill: (momentIds) =>
        set({
          visible: false,
          awaitingMagicFillReturn: true,
          coveringHandoff: true,
          stepBeforeMagicFill: get().step,
          momentIdsBeforeMagicFill: momentIds,
        }),
      returnFromMagicFill: () => {
        if (get().completed) return;
        set({
          visible: true,
          awaitingMagicFillReturn: false,
          step: "digDeeperOffer",
        });
      },
      abandonMagicFill: () => {
        const s = get();
        if (s.completed) return;
        // Their "Sure, I'll try Magic Fill" reply no longer reflects what
        // happened, so drop it and put the offer back on the table.
        const turns =
          s.turns.at(-1)?.role === "user" ? s.turns.slice(0, -1) : s.turns;
        set({
          visible: true,
          awaitingMagicFillReturn: false,
          momentIdsBeforeMagicFill: [],
          turns,
          step: s.stepBeforeMagicFill ?? "coreSkipped",
        });
      },
      setRememberChoice: (choice) => set({ rememberChoice: choice }),
      handOffToDigDeeper: (entryId) =>
        set({
          visible: false,
          awaitingDigDeeperReturn: true,
          coveringHandoff: true,
          digDeeperEntryId: entryId,
        }),
      returnFromDigDeeper: () => {
        if (get().completed) return;
        set({ visible: true, awaitingDigDeeperReturn: false, step: "outro" });
      },
      close: () =>
        set({
          visible: false,
          completed: true,
          awaitingMagicFillReturn: false,
          awaitingDigDeeperReturn: false,
          coveringHandoff: false,
          awaitingFirstCaptureReturn: false,
          entryId: null,
          ...EMPTY_THREAD,
        }),
      resetForNewAccount: () =>
        set({
          visible: false,
          entryId: null,
          step: "intro",
          completed: false,
          ...EMPTY_THREAD,
          awaitingMagicFillReturn: false,
          stepBeforeMagicFill: null,
          awaitingDigDeeperReturn: false,
          coveringHandoff: false,
          momentIdsBeforeMagicFill: [],
          digDeeperEntryId: null,
          rememberChoice: null,
          awaitingFirstCaptureReturn: false,
          declinedBeforeCapture: false,
          pickedAsset: null,
        }),
    }),
    {
      name: "little-moments-first-moment-chat",
      storage: createJSONStorage(() => AsyncStorage),
      // The whole conversation persists: hand-offs to Magic Fill and Dig
      // Deeper can remount the host, and losing the thread there would drop
      // the user into a half-finished conversation with no context.
      partialize: (s) => ({
        completed: s.completed,
        step: s.step,
        turns: s.turns,
        pending: s.pending,
        narratedSteps: s.narratedSteps,
        turnSeq: s.turnSeq,
        queueSeq: s.queueSeq,
        awaitingMagicFillReturn: s.awaitingMagicFillReturn,
        stepBeforeMagicFill: s.stepBeforeMagicFill,
        awaitingDigDeeperReturn: s.awaitingDigDeeperReturn,
        momentIdsBeforeMagicFill: s.momentIdsBeforeMagicFill,
        digDeeperEntryId: s.digDeeperEntryId,
        rememberChoice: s.rememberChoice,
        awaitingFirstCaptureReturn: s.awaitingFirstCaptureReturn,
        declinedBeforeCapture: s.declinedBeforeCapture,
        pickedAsset: s.pickedAsset,
        entryId: s.entryId,
      }),
    }
  )
);
