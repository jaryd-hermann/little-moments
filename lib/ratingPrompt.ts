/**
 * In-app store review (SKStoreReview / Play In-App Review).
 *
 * - One coordinator: cooldown + lifetime cap so we don’t fight Apple/Google
 *   quotas or annoy users.
 * - Triggers are “value moments” from distinct call sites; each schedules
 *   off the UI thread (InteractionManager + delay).
 * - Never throws to callers.
 *
 * See: https://docs.expo.dev/versions/latest/sdk/storereview/
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { InteractionManager, Platform } from "react-native";

type StoreReviewModule = {
  isAvailableAsync: () => Promise<boolean>;
  hasAction: () => Promise<boolean>;
  requestReview: () => Promise<void>;
};

/**
 * Null when unavailable; undefined = not yet resolved.
 * The package can load in JS while native calls still throw (stale dev client)
 * — `runStoreReviewRequest` invalidates the cache on any failure.
 */
let storeReview: StoreReviewModule | null | undefined;

function invalidateStoreReviewModule(): void {
  storeReview = null;
}

function getStoreReview(): StoreReviewModule | null {
  if (storeReview !== undefined) return storeReview;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    storeReview = require("expo-store-review") as StoreReviewModule;
  } catch {
    storeReview = null;
    if (__DEV__) {
      console.warn(
        "[ratingPrompt] expo-store-review unavailable — rebuild dev client or run prebuild."
      );
    }
  }
  return storeReview;
}

const STORAGE_STATE = "@lm/in_app_review_state_v1";
const FLAG_FIRST_CHAPTER = "@lm/review_done_first_chapter_v1";
const FLAG_FIRST_THREAD = "@lm/review_done_first_thread_v1";
const FLAG_FIRST_SHARE = "@lm/review_done_post_share_v1";

/** Conservative: Apple heavily rate-limits the dialog; spacing avoids no-ops. */
const MIN_MS_BETWEEN_REQUESTS = 120 * 24 * 60 * 60 * 1000;

const MAX_LIFETIME_REQUESTS = 4;

const DEFAULT_DELAY_MS = 2500;

type ReviewState = {
  lastRequestedAt: number | null;
  lifetimeRequestCount: number;
};

export type ReviewTrigger =
  | "first_chapter_viewed"
  | "first_thread_viewed"
  | "moment_count_10"
  | "post_share";

async function loadState(): Promise<ReviewState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_STATE);
    if (!raw) return { lastRequestedAt: null, lifetimeRequestCount: 0 };
    const parsed = JSON.parse(raw) as ReviewState;
    return {
      lastRequestedAt:
        typeof parsed.lastRequestedAt === "number"
          ? parsed.lastRequestedAt
          : null,
      lifetimeRequestCount:
        typeof parsed.lifetimeRequestCount === "number"
          ? parsed.lifetimeRequestCount
          : 0,
    };
  } catch {
    return { lastRequestedAt: null, lifetimeRequestCount: 0 };
  }
}

async function persistState(s: ReviewState): Promise<void> {
  await AsyncStorage.setItem(STORAGE_STATE, JSON.stringify(s));
}

async function runStoreReviewRequest(trigger: ReviewTrigger): Promise<void> {
  if (Platform.OS === "web") return;

  try {
    const StoreReview = getStoreReview();
    if (!StoreReview) return;

    const state = await loadState();
    const now = Date.now();

    if (state.lifetimeRequestCount >= MAX_LIFETIME_REQUESTS) return;
    if (
      state.lastRequestedAt != null &&
      now - state.lastRequestedAt < MIN_MS_BETWEEN_REQUESTS
    ) {
      return;
    }

    if (!(await StoreReview.isAvailableAsync())) return;
    if (!(await StoreReview.hasAction())) return;

    await StoreReview.requestReview();

    await persistState({
      lastRequestedAt: now,
      lifetimeRequestCount: state.lifetimeRequestCount + 1,
    });

    if (__DEV__) {
      console.log("[ratingPrompt] requestReview completed:", trigger);
    }
  } catch (e) {
    invalidateStoreReviewModule();
    if (__DEV__) {
      console.warn("[ratingPrompt] requestReview skipped:", e);
    }
  }
}

/**
 * Schedules `requestReview` after navigation/save work settles.
 */
export function scheduleStoreReviewRequest(
  trigger: ReviewTrigger,
  opts?: {
    delayMs?: number;
    /** e.g. streak milestone push fired this tick — skip stacking prompts */
    skip?: boolean;
  },
): void {
  if (opts?.skip) return;
  if (Platform.OS === "web") return;
  if (!getStoreReview()) return;

  const delayMs = opts?.delayMs ?? DEFAULT_DELAY_MS;

  InteractionManager.runAfterInteractions(() => {
    setTimeout(() => {
      void runStoreReviewRequest(trigger).catch(() => {
        invalidateStoreReviewModule();
      });
    }, delayMs);
  });
}

/** First time any chapter gets a first `viewed_at` — one shot per install. */
export async function scheduleReviewAfterFirstChapterOpened(): Promise<void> {
  try {
    const k = await AsyncStorage.getItem(FLAG_FIRST_CHAPTER);
    if (k === "1") return;
    await AsyncStorage.setItem(FLAG_FIRST_CHAPTER, "1");
    scheduleStoreReviewRequest("first_chapter_viewed");
  } catch {
    // ignore
  }
}

/** First time any thread gets a first `viewed_at` — one shot per install. */
export async function scheduleReviewAfterFirstThreadOpened(): Promise<void> {
  try {
    const k = await AsyncStorage.getItem(FLAG_FIRST_THREAD);
    if (k === "1") return;
    await AsyncStorage.setItem(FLAG_FIRST_THREAD, "1");
    scheduleStoreReviewRequest("first_thread_viewed");
  } catch {
    // ignore
  }
}

/**
 * After the first successful creation of a share link (not idempotent fetch).
 * Delayed slightly so the user finishes the share sheet / toast mental model first.
 */
export async function scheduleReviewAfterFirstShare(): Promise<void> {
  try {
    const k = await AsyncStorage.getItem(FLAG_FIRST_SHARE);
    if (k === "1") return;
    await AsyncStorage.setItem(FLAG_FIRST_SHARE, "1");
    scheduleStoreReviewRequest("post_share", { delayMs: 8000 });
  } catch {
    // ignore
  }
}

/** 10th lifetime moment captured — skipped if a streak milestone push fires same save. */
export function scheduleReviewAfterMomentMilestone(args: {
  newTotalMoments: number;
  streakJustHitMilestone: boolean;
}): void {
  const { newTotalMoments, streakJustHitMilestone } = args;
  if (newTotalMoments !== 10) return;
  scheduleStoreReviewRequest("moment_count_10", {
    skip: streakJustHitMilestone,
    delayMs: 4500,
  });
}
