import { create } from "zustand";
import type { MediaAsset } from "@/hooks/useMediaLibrary";

export type MagicFillGapTarget = 5 | 10;
export type MagicFillFillMode =
  | "recent_gaps"
  | "month"
  | "you_pick"
  | "favorites";

export type PickedVideoClip = {
  clipStartSec: number;
  resolvedUri: string;
};

/** @deprecated Use MagicFillGapTarget */
export type MagicFillDaysBack = MagicFillGapTarget;

export type MagicFillDraft = {
  ymd: string;
  date: Date;
  photos: MediaAsset[];
  selectedIndex: number;
  skipped: boolean;
  rawCaption: string;
  title?: string;
  body?: string;
  captionSource?: "text" | "voice";
  /** Voice flow: user advanced past this moment (recording handoff complete). */
  voiceSegmentCaptured?: boolean;
};

interface MagicFillStore {
  gapTarget: MagicFillGapTarget;
  fillMode: MagicFillFillMode;
  /** yyyy-MM when fillMode === "month" */
  targetMonthKey: string | null;
  /** @deprecated alias — use gapTarget */
  daysBack: MagicFillGapTarget;
  drafts: MagicFillDraft[];
  captionMode: "text" | "voice" | null;
  textCaptionIndex: number;
  voiceCaptionIndex: number;
  isProcessing: boolean;
  isSaving: boolean;
  savedCount: number;
  gapCountCache: {
    count: number;
    gapTarget: MagicFillGapTarget;
    at: number;
  } | null;
  pickedVideoClips: Record<string, PickedVideoClip>;

  setGapTarget: (target: MagicFillGapTarget) => void;
  setFillMode: (mode: MagicFillFillMode) => void;
  setTargetMonthKey: (key: string | null) => void;
  /** @deprecated — use setGapTarget */
  setDaysBack: (target: MagicFillGapTarget) => void;
  setDrafts: (drafts: MagicFillDraft[]) => void;
  skipDay: (ymd: string) => void;
  unskipDay: (ymd: string) => void;
  shufflePhoto: (ymd: string) => void;
  setSelectedPhotoIndex: (ymd: string, index: number) => void;
  setRawCaption: (ymd: string, caption: string, source?: "text" | "voice") => void;
  markVoiceSegmentCaptured: (ymd: string) => void;
  setVoiceSegmentCaptured: (ymd: string, captured: boolean) => void;
  setAssembled: (ymd: string, title: string, body: string) => void;
  setCaptionMode: (mode: "text" | "voice" | null) => void;
  setTextCaptionIndex: (index: number) => void;
  setVoiceCaptionIndex: (index: number) => void;
  setIsProcessing: (val: boolean) => void;
  setIsSaving: (val: boolean) => void;
  setSavedCount: (count: number) => void;
  setGapCountCache: (
    cache: {
      count: number;
      gapTarget: MagicFillGapTarget;
      at: number;
    } | null
  ) => void;
  setPickedVideoClip: (assetId: string, clip: PickedVideoClip) => void;
  clearPickedVideoClips: () => void;
  activeDrafts: () => MagicFillDraft[];
  reset: () => void;
  resetForRestart: () => void;
}

const initialState = {
  gapTarget: 5 as MagicFillGapTarget,
  fillMode: "recent_gaps" as MagicFillFillMode,
  targetMonthKey: null as string | null,
  daysBack: 5 as MagicFillGapTarget,
  drafts: [] as MagicFillDraft[],
  captionMode: null as "text" | "voice" | null,
  textCaptionIndex: 0,
  voiceCaptionIndex: 0,
  isProcessing: false,
  isSaving: false,
  savedCount: 0,
  gapCountCache: null as MagicFillStore["gapCountCache"],
  pickedVideoClips: {} as Record<string, PickedVideoClip>,
};

export const useMagicFillStore = create<MagicFillStore>((set, get) => ({
  ...initialState,

  setGapTarget: (gapTarget) => set({ gapTarget, daysBack: gapTarget }),
  setFillMode: (fillMode) => set({ fillMode }),
  setTargetMonthKey: (targetMonthKey) => set({ targetMonthKey }),
  setDaysBack: (gapTarget) => set({ gapTarget, daysBack: gapTarget }),
  setDrafts: (drafts) => set({ drafts }),
  skipDay: (ymd) =>
    set((s) => ({
      drafts: s.drafts.map((d) =>
        d.ymd === ymd ? { ...d, skipped: true } : d
      ),
    })),
  unskipDay: (ymd) =>
    set((s) => ({
      drafts: s.drafts.map((d) =>
        d.ymd === ymd ? { ...d, skipped: false } : d
      ),
    })),
  shufflePhoto: (ymd) =>
    set((s) => ({
      drafts: s.drafts.map((d) => {
        if (d.ymd !== ymd || d.photos.length <= 1) return d;
        const next = (d.selectedIndex + 1) % d.photos.length;
        return { ...d, selectedIndex: next };
      }),
    })),
  setSelectedPhotoIndex: (ymd, index) =>
    set((s) => ({
      drafts: s.drafts.map((d) =>
        d.ymd === ymd ? { ...d, selectedIndex: index } : d
      ),
    })),
  setRawCaption: (ymd, rawCaption, source) =>
    set((s) => ({
      drafts: s.drafts.map((d) =>
        d.ymd === ymd
          ? {
              ...d,
              rawCaption,
              ...(source ? { captionSource: source } : {}),
            }
          : d
      ),
    })),
  markVoiceSegmentCaptured: (ymd) =>
    set((s) => ({
      drafts: s.drafts.map((d) =>
        d.ymd === ymd ? { ...d, voiceSegmentCaptured: true } : d
      ),
    })),
  setVoiceSegmentCaptured: (ymd, captured) =>
    set((s) => ({
      drafts: s.drafts.map((d) =>
        d.ymd === ymd ? { ...d, voiceSegmentCaptured: captured } : d
      ),
    })),
  setAssembled: (ymd, title, body) =>
    set((s) => ({
      drafts: s.drafts.map((d) =>
        d.ymd === ymd ? { ...d, title, body } : d
      ),
    })),
  setCaptionMode: (captionMode) => set({ captionMode }),
  setTextCaptionIndex: (textCaptionIndex) => set({ textCaptionIndex }),
  setVoiceCaptionIndex: (voiceCaptionIndex) => set({ voiceCaptionIndex }),
  setIsProcessing: (isProcessing) => set({ isProcessing }),
  setIsSaving: (isSaving) => set({ isSaving }),
  setSavedCount: (savedCount) => set({ savedCount }),
  setGapCountCache: (gapCountCache) => set({ gapCountCache }),
  setPickedVideoClip: (assetId, clip) =>
    set((s) => ({
      pickedVideoClips: { ...s.pickedVideoClips, [assetId]: clip },
    })),
  clearPickedVideoClips: () => set({ pickedVideoClips: {} }),
  activeDrafts: () => get().drafts.filter((d) => !d.skipped),
  reset: () => set({ ...initialState, pickedVideoClips: {} }),
  resetForRestart: () =>
    set((s) => ({
      drafts: [],
      captionMode: null,
      textCaptionIndex: 0,
      voiceCaptionIndex: 0,
      isProcessing: false,
      isSaving: false,
      savedCount: 0,
      pickedVideoClips: {},
      daysBack: s.gapTarget,
      gapTarget: s.gapTarget,
      gapCountCache: s.gapCountCache,
    })),
}));

export function selectedPhoto(draft: MagicFillDraft): MediaAsset | null {
  if (draft.photos.length === 0) return null;
  const idx = Math.min(draft.selectedIndex, draft.photos.length - 1);
  return draft.photos[idx] ?? null;
}

export function selectedPhotoForDraft(
  draft: MagicFillDraft,
  pickedVideoClips: Record<string, PickedVideoClip>
): MediaAsset | null {
  const photo = selectedPhoto(draft);
  if (!photo) return null;
  const clip = pickedVideoClips[photo.id];
  if (clip?.resolvedUri) {
    return { ...photo, uri: clip.resolvedUri };
  }
  return photo;
}

export function videoClipStartForPhoto(
  photo: MediaAsset | null,
  pickedVideoClips: Record<string, PickedVideoClip>
): number {
  if (!photo || photo.mediaType !== "video") return 0;
  return pickedVideoClips[photo.id]?.clipStartSec ?? 0;
}

export function displayPhotoAsset(
  photo: MediaAsset,
  pickedVideoClips: Record<string, PickedVideoClip>
): MediaAsset {
  const clip = pickedVideoClips[photo.id];
  if (clip?.resolvedUri) {
    return { ...photo, uri: clip.resolvedUri };
  }
  return photo;
}
