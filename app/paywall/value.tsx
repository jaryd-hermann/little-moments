import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Alert,
  Linking,
  Image,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { usePostHog } from "posthog-react-native";
import { useTheme } from "@/hooks/useTheme";
import { bevelShadow, PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";
import { onboardingEventProps } from "@/lib/onboardingEvents";
import { useAuthStore } from "@/store/authStore";
import { useOnboardingQuizStore } from "@/store/onboardingQuizStore";
import { useSubscription } from "@/hooks/useSubscription";
import { mirrorHeadlineForQ5 } from "@/lib/onboardingQuiz";
import { requestPaywallTriggerSkips } from "@/lib/onboardingPaywallSession";
import { routeToFirstMomentScreen } from "@/lib/onboardingRoute";

const TERMS_URL = "https://getlittlemoments.com/terms";
const PRIVACY_URL = "https://getlittlemoments.com/privacy";

const WORDMARK_PREMIUM = require("@/assets/images/wordmark-premium.png");
/** Warm cream accent used for the trial headline + daily price. */
const PREMIUM_ACCENT = "#FECFB4";

/**
 * Pre-purchase "value-anchor / trial start" screen — the onboarding's
 * direct-purchase entry point.
 *
 * Sits between notifications-prompt and Today. Mirrors the user's Q5
 * answer as the value proposition, shows the 2-week trial setup, and
 * anchors the price at $0.22/day (annual price / 365).
 *
 * Routing:
 * - "Start free trial" calls Purchases.purchasePackage(annualPackage)
 *   directly (StoreKit sheet appears in-place). On success we exit to
 *   Today w/ capture params. On error or missing offering we fall back
 *   to /paywall/index?fromOnboarding=1 so the user can still pay.
 * - "Skip for now" → /(tabs)/today?capture=1&onboardingFirstMoment=1.
 *
 * The required pre-purchase disclosures (trial length, post-trial
 * price, auto-renew, Restore, Terms, Privacy) live under the CTA to
 * keep App Store guideline 3.1.2(a) satisfied.
 */
const FALLBACK_ANNUAL_PRICE = 79.99;
const FALLBACK_ANNUAL_PER_DAY = 0.22;

type TrialFeature = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
};

const TRIAL_FEATURES: TrialFeature[] = [
  { icon: "calendar-outline", title: "Quick Daily Capture" },
  { icon: "book-outline", title: "Experience Weekly Chapters" },
  { icon: "git-network-outline", title: "Discover Insightful Connections" },
  { icon: "sparkles-outline", title: "Try Our Dig Deeper AI" },
];

export default function PaywallValueScreen() {
  const { colors, theme } = useTheme();
  const posthog = usePostHog();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ fromOnboarding?: string }>();
  const fromOnboarding = params.fromOnboarding === "1";

  const profile = useAuthStore((s) => s.profile);
  const quizAnswers = useOnboardingQuizStore((s) => s.answers);

  const answers = useMemo(
    () => profile?.quiz_answers ?? quizAnswers ?? {},
    [profile?.quiz_answers, quizAnswers]
  );

  const { annualPackage, isLoadingOfferings, handlePurchase, handleRestore } =
    useSubscription();
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const annualPrice = annualPackage?.product.price ?? FALLBACK_ANNUAL_PRICE;
  const annualPriceString =
    annualPackage?.product.priceString ?? `$${FALLBACK_ANNUAL_PRICE.toFixed(2)}`;
  const annualCurrencyCode =
    annualPackage?.product.currencyCode ?? "USD";
  const annualPerDay = useMemo(() => {
    const computed = annualPrice / 365;
    if (!Number.isFinite(computed) || computed <= 0) return FALLBACK_ANNUAL_PER_DAY;
    return computed;
  }, [annualPrice]);
  // Format the per-day price in the user's store currency. Without this
  // the screen showed `$0.22` even when the annual price was in EUR/GBP/
  // INR/etc — the daily anchor read as a different currency than the
  // "billed yearly" line. Hermes ships full Intl support on RN 0.79+.
  const annualPerDayDisplay = useMemo(() => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: annualCurrencyCode,
        // Most currencies render fine at the locale-default fraction
        // digits (e.g. JPY: 0, USD: 2). For very small per-day numbers
        // we still want 2 dp so "0" doesn't appear (e.g. INR ~₹16 looks
        // wrong rounded). minimumFractionDigits handles that.
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(annualPerDay);
    } catch {
      // Bad currency code (RC rarely returns one), or Intl unavailable.
      // Fall back to the bare number — better to show "0.22" than crash.
      return annualPerDay.toFixed(2);
    }
  }, [annualPerDay, annualCurrencyCode]);

  const mountedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    mountedAtRef.current = Date.now();
    // One paywall-trigger skip — if the user taps "Skip for now" we land
    // on Today and don't want usePaywallTrigger to immediately stack
    // another paywall on top.
    requestPaywallTriggerSkips(1);
    posthog.capture("value_anchor_viewed", {
      ...onboardingEventProps(7),
      q5_option_id: answers["q5_commitment"] ?? null,
      annual_price: annualPrice,
      annual_currency: annualCurrencyCode,
      annual_per_day: annualPerDay,
      from_onboarding: fromOnboarding,
    });
  }, []);

  const headline = mirrorHeadlineForQ5(answers);

  const exitAfterOnboarding = () => {
    if (fromOnboarding) {
      routeToFirstMomentScreen();
      return;
    }
    router.replace({
      pathname: "/(tabs)/today",
      params: { capture: "1", onboardingFirstMoment: "1" },
    });
  };

  /**
   * Hands off straight to Apple's StoreKit sheet via RC's purchasePackage()
   * (the user is opting in HERE, not on a downstream paywall screen). We
   * fall back to the full RC paywall (/paywall/index) when:
   *  - the annual package isn't loaded yet (offerings still fetching),
   *  - the SDK errors out (network, store unavailable, RC misconfig),
   * so the user always has a path to subscribe.
   */
  const handleStartTrial = async () => {
    if (isPurchasing) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (!annualPackage) {
      posthog.capture(
        "value_anchor_trial_no_package",
        onboardingEventProps(7, { is_loading: isLoadingOfferings })
      );
      router.replace({
        pathname: "/paywall",
        params: { fromOnboarding: "1" },
      });
      return;
    }

    posthog.capture(
      "value_anchor_trial_tapped",
      onboardingEventProps(7, {
        ms_on_screen: Date.now() - mountedAtRef.current,
        package_id: annualPackage.identifier,
        price: annualPackage.product.price,
      })
    );

    setIsPurchasing(true);
    try {
      const result = await handlePurchase(annualPackage);
      if (result.success) {
        posthog.capture(
          "value_anchor_trial_started",
          onboardingEventProps(7, {
            package_id: annualPackage.identifier,
            price: annualPackage.product.price,
            source: "value_anchor_direct",
          })
        );
        exitAfterOnboarding();
      } else if (result.cancelled) {
        posthog.capture("value_anchor_trial_cancelled", onboardingEventProps(7));
        // User backed out of the StoreKit sheet — keep them on this screen.
      } else {
        posthog.capture("value_anchor_trial_error", onboardingEventProps(7));
        Alert.alert(
          "Purchase didn't go through",
          "Try again, or see all plans.",
          [
            { text: "Try again", style: "default" },
            {
              text: "See all plans",
              onPress: () =>
                router.replace({
                  pathname: "/paywall",
                  params: { fromOnboarding: "1" },
                }),
            },
          ]
        );
      }
    } catch {
      posthog.capture("value_anchor_trial_threw", onboardingEventProps(7));
      // Hard failure (SDK threw outside the userCancelled branch). Push
      // them to the full paywall as a safety net so they can still pay.
      router.replace({
        pathname: "/paywall",
        params: { fromOnboarding: "1" },
      });
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleRestorePress = async () => {
    if (isRestoring) return;
    posthog.capture("value_anchor_restore_tapped", onboardingEventProps(7));
    setIsRestoring(true);
    const restored = await handleRestore();
    setIsRestoring(false);
    if (restored) {
      posthog.capture(
        "value_anchor_restored",
        onboardingEventProps(7, { source: "value_anchor" })
      );
      exitAfterOnboarding();
    } else {
      Alert.alert(
        "No subscription found",
        "We couldn't find an active subscription on this Apple ID."
      );
    }
  };

  const handleSkip = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    posthog.capture(
      "value_anchor_skipped",
      onboardingEventProps(7, {
        ms_on_screen: Date.now() - mountedAtRef.current,
      })
    );
    exitAfterOnboarding();
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["top"]}
    >
      <StatusBar
        barStyle={theme === "dark" ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 24,
          paddingBottom: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: "center", marginBottom: 14 }}>
          <Image
            source={WORDMARK_PREMIUM}
            style={{ width: 220, height: 36 }}
            resizeMode="contain"
            accessibilityLabel="Little Moments Premium"
          />
        </View>
        <Text
          style={{
            fontFamily: "PMGothicLudington-Text110",
            fontSize: 22,
            lineHeight: 30,
            color: colors.text,
            textAlign: "center",
          }}
        >
          {headline}
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 15,
            lineHeight: 22,
            color: colors.textSecondary,
            textAlign: "center",
            marginTop: 12,
          }}
        >
          Under a minute a day, so the days stop blurring.
        </Text>

        <View
          style={{
            marginTop: 28,
            padding: 20,
            borderRadius: 20,
            backgroundColor: colors.surfaceSecondary,
            borderWidth: 1,
            borderColor: colors.borderLight,
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 11,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: colors.textMuted,
            }}
          >
            Your trial starts today
          </Text>
          <Text
            style={{
              marginTop: 6,
              fontFamily: "PMGothicLudington-Text110",
              fontSize: 22,
              lineHeight: 28,
              color: PREMIUM_ACCENT,
            }}
          >
            2 weeks free
          </Text>
          <Text
            style={{
              marginTop: 4,
              fontFamily: "Roboto-Regular",
              fontSize: 13,
              lineHeight: 20,
              color: colors.textSecondary,
            }}
          >
            Built to help the habit stick before you pay a cent.
          </Text>

          <View style={{ marginTop: 18, gap: 12 }}>
            {TRIAL_FEATURES.map((f) => (
              <View
                key={f.title}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.borderLight,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name={f.icon} size={16} color={colors.text} />
                </View>
                <Text
                  style={{
                    flex: 1,
                    fontFamily: "Roboto-Medium",
                    fontSize: 14,
                    color: colors.text,
                  }}
                >
                  {f.title}
                </Text>
              </View>
            ))}
          </View>
        </View>

      </ScrollView>

      <View
        style={{
          paddingHorizontal: 24,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 16),
          backgroundColor: colors.background,
        }}
      >
        <View style={{ alignItems: "center", marginBottom: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
            <Text
              style={{
                fontFamily: "PMGothicLudington-Text110",
                fontSize: 34,
                lineHeight: 38,
                color: PREMIUM_ACCENT,
              }}
            >
              {annualPerDayDisplay}
            </Text>
            <Text
              style={{
                marginLeft: 6,
                marginBottom: 4,
                fontFamily: "Roboto-Light",
                fontSize: 14,
                color: PREMIUM_ACCENT,
              }}
            >
              a day
            </Text>
          </View>
          <Text
            style={{
              marginTop: 2,
              fontFamily: "Roboto-Regular",
              fontSize: 12,
              color: colors.textMuted,
              textAlign: "center",
            }}
          >
            {annualPriceString} billed yearly
            {isLoadingOfferings ? "" : " — less than a coffee per week"}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Start free trial"
          onPress={() => void handleStartTrial()}
          disabled={isPurchasing}
          style={{
            height: 56,
            borderRadius: 9999,
            backgroundColor: colors.primary,
            borderWidth: 2,
            borderColor: PINK_CTA_BORDER,
            alignItems: "center",
            justifyContent: "center",
            opacity: isPurchasing ? 0.7 : 1,
            ...bevelShadow(theme),
          }}
        >
          {isPurchasing ? (
            <ActivityIndicator color={PINK_CTA_INK} />
          ) : (
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                color: PINK_CTA_INK,
                letterSpacing: 0.8,
                textTransform: "uppercase",
              }}
            >
              Start free trial
            </Text>
          )}
        </Pressable>

        {/*
          App Store guideline 3.1.2(a) — the auto-renewal terms, trial
          length, post-trial price, and links to Terms / Privacy must be
          visible BEFORE the user initiates the purchase. Apple's own
          StoreKit sheet will also show this, but reviewers expect us
          to show it here too.
        */}
        <Text
          style={{
            marginTop: 12,
            fontFamily: "Roboto-Light",
            fontSize: 11,
            lineHeight: 16,
            color: colors.textMuted,
            textAlign: "center",
          }}
        >
          14 days free, then {annualPriceString} per year. Auto-renews unless
          cancelled at least 24h before the period ends. Manage or cancel
          anytime in Settings.
        </Text>

        <View
          style={{
            marginTop: 8,
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Pressable
            accessibilityLabel="Restore purchases"
            onPress={() => void handleRestorePress()}
            disabled={isRestoring}
            hitSlop={8}
          >
            <Text
              style={{
                fontFamily: "Roboto-Light",
                fontSize: 11,
                color: colors.textMuted,
                textDecorationLine: "underline",
              }}
            >
              {isRestoring ? "Restoring…" : "Restore purchases"}
            </Text>
          </Pressable>
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 11,
              color: colors.textMuted,
              marginHorizontal: 8,
            }}
          >
            ·
          </Text>
          <Pressable
            accessibilityLabel="Terms"
            onPress={() => void Linking.openURL(TERMS_URL)}
            hitSlop={8}
          >
            <Text
              style={{
                fontFamily: "Roboto-Light",
                fontSize: 11,
                color: colors.textMuted,
                textDecorationLine: "underline",
              }}
            >
              Terms
            </Text>
          </Pressable>
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 11,
              color: colors.textMuted,
              marginHorizontal: 8,
            }}
          >
            ·
          </Text>
          <Pressable
            accessibilityLabel="Privacy"
            onPress={() => void Linking.openURL(PRIVACY_URL)}
            hitSlop={8}
          >
            <Text
              style={{
                fontFamily: "Roboto-Light",
                fontSize: 11,
                color: colors.textMuted,
                textDecorationLine: "underline",
              }}
            >
              Privacy
            </Text>
          </Pressable>
        </View>

        <Pressable
          accessibilityLabel="Skip for now"
          onPress={handleSkip}
          disabled={isPurchasing}
          style={{ paddingVertical: 12, marginTop: 4 }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 14,
              // Use the high-contrast theme text colour (solid white on
              // dark, solid black on light) so the opt-out is unambiguous.
              color: colors.text,
              textAlign: "center",
              textDecorationLine: "underline",
            }}
          >
            Skip for now
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
