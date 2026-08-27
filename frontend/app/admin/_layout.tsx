import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { BETA_MODE } from "@/src/config/beta";
import { useAuth } from "@/src/context/AuthContext";
import { colors, fonts, fontSize, spacing } from "@/src/theme/theme";

export default function AdminLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.centered} testID="admin-auth-loading">
        <ActivityIndicator size="large" color={colors.brandPrimary} />
        <Text style={styles.message}>Checking admin session…</Text>
      </View>
    );
  }

  if (!user) {
    return <Redirect href={BETA_MODE ? "/beta-login" : "/login"} />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.surface },
      }}
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.surface,
  },
  message: {
    color: colors.onSurfaceSecondary,
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    textAlign: "center",
  },
});
