import { Tabs } from "expo-router";
import { CustomTabBar } from "@/components/common/CustomTabBar";

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen
        name="today"
        options={{ title: "Home" }}
      />
      <Tabs.Screen
        name="crash-burn"
        options={{ title: "Race" }}
      />
      <Tabs.Screen
        name="compose-placeholder"
        options={{ title: "" }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
          },
        }}
      />
      <Tabs.Screen
        name="rewind"
        options={{ title: "Rewind" }}
      />
      <Tabs.Screen
        name="memories"
        options={{ title: "Memories" }}
      />
    </Tabs>
  );
}
