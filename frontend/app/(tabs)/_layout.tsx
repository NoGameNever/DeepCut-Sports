import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { StickerTabBar } from "@/src/components/StickerTabBar";
import { BETA_MODE } from "@/src/config/beta";
import { useAuth } from "@/src/context/AuthContext";
import { colors } from "@/src/theme/theme";

export default function TabsLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  }

  if (!user) return <Redirect href={BETA_MODE ? "/beta-login" : "/login"} />;
  if (BETA_MODE && !user.full_app_access) return <Redirect href="/beta" />;

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

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
});
