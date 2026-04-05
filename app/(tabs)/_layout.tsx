import { Tabs } from "expo-router";
import { CustomTabBar } from "@/components/common/CustomTabBar";
import { MomentCelebrationHost } from "@/components/today/MomentCelebrationHost";
import { usePushRegistration } from "@/hooks/usePushRegistration";

function PushRegistrationHost() {
  usePushRegistration();
  return null;
}

export default function TabLayout() {
  return (
    <>
      <PushRegistrationHost />
      <MomentCelebrationHost />
      <Tabs
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
        <Tabs.Screen
          name="today"
          options={{ title: "Today" }}
        />
        <Tabs.Screen
          name="add"
          options={{ title: "" }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
            },
          }}
        />
        <Tabs.Screen
          name="memories"
          options={{ title: "Capsule" }}
        />
        {/* Hidden tabs — kept for backward compat but not shown */}
        <Tabs.Screen
          name="crash-burn"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="rewind"
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
