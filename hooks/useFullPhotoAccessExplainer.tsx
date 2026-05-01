import { useState, useCallback, useRef } from "react";
import { Linking } from "react-native";
import { FullPhotoLibraryAccessModal } from "@/components/common/FullPhotoLibraryAccessModal";

type ExplainerOpts = {
  checkPermission: () => Promise<boolean>;
  requestPermission: () => Promise<boolean>;
};

/**
 * Shows {@link FullPhotoLibraryAccessModal} before the first system photo-library prompt
 * when the app does not yet have **full** library access (iOS limited library is treated as insufficient).
 */
export function useFullPhotoAccessExplainer(opts: ExplainerOpts) {
  const [visible, setVisible] = useState(false);
  const [followUpVisible, setFollowUpVisible] = useState(false);
  const pending = useRef<((ok: boolean) => void) | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const ensureFullPhotoAccess = useCallback(async (): Promise<boolean> => {
    const ok = await optsRef.current.checkPermission();
    if (ok) return true;
    return await new Promise<boolean>((resolve) => {
      pending.current = resolve;
      setVisible(true);
    });
  }, []);

  /** Dev/test helper: open the first explainer modal regardless of current permission state. */
  const showPhotoAccessExplainerForTesting = useCallback(() => {
    setFollowUpVisible(false);
    setVisible(true);
  }, []);

  /** Dev/test helper: open the limited/no-access follow-up modal directly. */
  const showLimitedPhotoAccessForTesting = useCallback(() => {
    setVisible(false);
    setFollowUpVisible(true);
  }, []);

  const finishPending = useCallback((ok: boolean) => {
    pending.current?.(ok);
    pending.current = null;
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    setFollowUpVisible(false);
    finishPending(false);
  }, [finishPending]);

  const handleAllowAccess = useCallback(async () => {
    setVisible(false);
    await optsRef.current.requestPermission();
    const ok = await optsRef.current.checkPermission();
    if (!ok) {
      setFollowUpVisible(true);
      return;
    }
    finishPending(ok);
  }, [finishPending]);

  const handleFollowUpClose = useCallback(() => {
    setFollowUpVisible(false);
    finishPending(false);
  }, [finishPending]);

  const handleOpenSettings = useCallback(async () => {
    setFollowUpVisible(false);
    try {
      // Prefer direct app-settings deep link for faster path to Photos permission controls.
      const canOpenAppSettings = await Linking.canOpenURL("app-settings:");
      if (canOpenAppSettings) {
        await Linking.openURL("app-settings:");
      } else {
        await Linking.openSettings();
      }
    } catch {
      await Linking.openSettings();
    }
    finishPending(false);
  }, [finishPending]);

  const modal = (
    <>
      <FullPhotoLibraryAccessModal
        visible={visible}
        onClose={handleClose}
        onAllowAccess={handleAllowAccess}
      />
      <FullPhotoLibraryAccessModal
        visible={followUpVisible}
        onClose={handleFollowUpClose}
        onAllowAccess={handleOpenSettings}
        title="Looks like you have limitted or no access to photos"
        body="Little Moments won't work unless you give full access."
        primaryCtaLabel="Update access"
        secondaryCtaLabel="That's fine"
        onSecondaryCtaPress={handleFollowUpClose}
      />
    </>
  );

  return {
    ensureFullPhotoAccess,
    fullPhotoAccessModal: modal,
    showPhotoAccessExplainerForTesting,
    showLimitedPhotoAccessForTesting,
  };
}
