import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useAudioRecorder, AudioModule, RecordingPresets } from "expo-audio";
import { transcribeAudio } from "@/lib/whisper";
import { deleteVoiceClipSnapshot, snapshotVoiceClip } from "@/lib/voiceClip";

export type ContinuousVoiceCaptionHandle = {
  finalizeSegment: () => Promise<string>;
  /** Stop recording and return clip URI without transcribing. */
  stopForHandoff: () => Promise<string | null>;
  startSegment: () => Promise<void>;
  finishSession: () => Promise<string>;
  restartSegment: () => Promise<void>;
  isBusy: () => boolean;
  isRecording: () => boolean;
};

type Props = {
  /** When true, mic permission is requested and segments can be recorded. */
  enabled: boolean;
  /** When true, automatically start the first segment (after countdown). */
  autoStartRecording?: boolean;
  onDurationTick?: (seconds: number) => void;
  onRecordingChange?: (recording: boolean) => void;
  onTranscribingChange?: (transcribing: boolean) => void;
};

export const ContinuousVoiceCaptionSession = forwardRef<
  ContinuousVoiceCaptionHandle,
  Props
>(function ContinuousVoiceCaptionSession(
  { enabled, autoStartRecording = false, onDurationTick, onRecordingChange, onTranscribingChange },
  ref
) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const isRecordingRef = useRef(false);
  /** True from a successful segment start until handoff/stop clears it. */
  const segmentOpenRef = useRef(false);
  const isTranscribingRef = useRef(false);
  const durationRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(false);

  const setRecording = useCallback(
    (val: boolean) => {
      isRecordingRef.current = val;
      setIsRecording(val);
      onRecordingChange?.(val);
    },
    [onRecordingChange]
  );

  const setTranscribing = useCallback(
    (val: boolean) => {
      isTranscribingRef.current = val;
      setIsTranscribing(val);
      onTranscribingChange?.(val);
    },
    [onTranscribingChange]
  );

  const clearTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const startSegment = useCallback(async () => {
    if (!enabled || isRecordingRef.current || isTranscribingRef.current) return;
    try {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) return;

      await AudioModule.setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      segmentOpenRef.current = true;
      clearTimer();
      durationRef.current = 0;
      onDurationTick?.(0);
      setRecording(true);
      intervalRef.current = setInterval(() => {
        durationRef.current += 1;
        onDurationTick?.(durationRef.current);
      }, 1000);
    } catch (err) {
      console.warn("[ContinuousVoiceCaptionSession] start failed:", err);
    }
  }, [enabled, onDurationTick, recorder, setRecording]);

  const stopRecordingInternal = useCallback(async (): Promise<string | null> => {
    if (!isRecordingRef.current && !segmentOpenRef.current) return null;
    isRecordingRef.current = false;
    segmentOpenRef.current = false;
    setIsRecording(false);
    onRecordingChange?.(false);
    clearTimer();
    try {
      await recorder.stop();
      await AudioModule.setAudioModeAsync({ allowsRecording: false });
      if (!recorder.uri) return null;
      // Never let the recorder's own file out of here — the next segment
      // truncates it, which is fatal for anything still uploading it.
      return await snapshotVoiceClip(recorder.uri);
    } catch {
      return null;
    }
  }, [onRecordingChange, recorder]);

  const transcribeUri = useCallback(
    async (uri: string | null) => {
      if (!uri) return "";
      setTranscribing(true);
      try {
        return await transcribeAudio(uri);
      } catch {
        return "";
      } finally {
        setTranscribing(false);
        // Safe to drop only now: the upload holds the file open until it ends.
        await deleteVoiceClipSnapshot(uri);
      }
    },
    [setTranscribing]
  );

  const finalizeSegment = useCallback(async () => {
    const uri = await stopRecordingInternal();
    return transcribeUri(uri);
  }, [stopRecordingInternal, transcribeUri]);

  const stopForHandoff = useCallback(async () => {
    return stopRecordingInternal();
  }, [stopRecordingInternal]);

  const restartSegment = useCallback(async () => {
    if (isRecordingRef.current || segmentOpenRef.current) {
      try {
        isRecordingRef.current = false;
        segmentOpenRef.current = false;
        setIsRecording(false);
        onRecordingChange?.(false);
        clearTimer();
        await recorder.stop();
        await AudioModule.setAudioModeAsync({ allowsRecording: false });
      } catch {
        /* discard partial clip */
      }
    }
    await startSegment();
  }, [onRecordingChange, recorder, setRecording, startSegment]);

  const finishSession = useCallback(async () => {
    clearTimer();
    const text = await finalizeSegment();
    startedRef.current = false;
    durationRef.current = 0;
    return text;
  }, [finalizeSegment]);

  useImperativeHandle(
    ref,
    () => ({
      finalizeSegment,
      stopForHandoff,
      startSegment,
      finishSession,
      restartSegment,
      isBusy: () => isRecordingRef.current || isTranscribingRef.current,
      isRecording: () => isRecordingRef.current,
    }),
    [
      finalizeSegment,
      finishSession,
      restartSegment,
      startSegment,
      stopForHandoff,
    ]
  );

  useEffect(() => {
    if (!autoStartRecording) {
      startedRef.current = false;
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;
    void startSegment();
  }, [autoStartRecording, startSegment]);

  useEffect(() => () => clearTimer(), []);

  return null;
});
