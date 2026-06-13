import { Tabs } from "expo-router";
import { CustomTabBar } from "@/components/common/CustomTabBar";
import { MomentCelebrationHost } from "@/components/today/MomentCelebrationHost";
import { FirstPinCelebrationHost } from "@/components/common/FirstPinCelebrationHost";
import { CoreMemoryAddedToasterHost } from "@/components/common/CoreMemoryAddedToasterHost";
import { FirstMomentOnboardingSheetHost } from "@/components/common/FirstMomentOnboardingSheetHost";
import { usePushRegistration } from "@/hooks/usePushRegistration";
import { useUnseenBootstrap } from "@/hooks/useUnseenBootstrap";
import { useOneSignalMomentSync } from "@/hooks/useOneSignalMomentSync";
import { useOneSignalEngagementSync } from "@/hooks/useOneSignalEngagementSync";

function PushRegistrationHost() {
  usePushRegistration();
  return null;
}

function UnseenBootstrapHost() {
  useUnseenBootstrap();
  return null;
}

function OneSignalMomentSyncHost() {
  useOneSignalMomentSync();
  return null;
}

function OneSignalEngagementSyncHost() {
  useOneSignalEngagementSync();
  return null;
}

export default function TabLayout() {
  return (
    <>
      <PushRegistrationHost />
      <UnseenBootstrapHost />
      <OneSignalMomentSyncHost />
      <OneSignalEngagementSyncHost />
      <MomentCelebrationHost />
      <FirstPinCelebrationHost />
      <CoreMemoryAddedToasterHost />
      <FirstMomentOnboardingSheetHost />
      <Tabs
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
        <Tabs.Screen
          name="today"
          options={{ title: "Capture" }}
        />
        <Tabs.Screen
          name="memories"
          options={{ title: "Capsule" }}
        />
        <Tabs.Screen
          name="chapters"
          options={{ title: "Chapters" }}
        />
        <Tabs.Screen
          name="brain"
          options={{ title: "Connect" }}
        />
        {/* Hidden tabs — kept for backward compat but not shown */}
        <Tabs.Screen
          name="add"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="crash-burn"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="compose-placeholder"
          options={{ href: null }}
        />
      </Tabs>
    </>
  );
}
