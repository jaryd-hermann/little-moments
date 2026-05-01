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
          name="capture"
          options={{ title: "Capture" }}
        />
        <Tabs.Screen
          name="memories"
          options={{ title: "Capsule" }}
        />
        <Tabs.Screen
          name="brain"
          options={{ title: "Brain" }}
        />
        {/* Hidden routes — still navigable programmatically, but not shown in the tab bar */}
        <Tabs.Screen
          name="today"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="add"
          options={{ href: null }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
            },
          }}
        />
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
