import { Tabs } from "expo-router";

import { StickerTabBar } from "@/src/components/StickerTabBar";

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <StickerTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Play",
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: "Friends",
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: "Ranks",
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
        }}
      />
    </Tabs>
  );
}
