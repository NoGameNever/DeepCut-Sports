import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { BETA_MODE } from "@/src/config/beta";
import { colors } from "@/src/theme/theme";

export default function Index() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user?.credential_migration_required) {
      router.replace("/credential-migration");
    } else if (user) {
      router.replace(BETA_MODE && !user.full_app_access ? "/beta" : "/(tabs)");
    } else {
      router.replace(BETA_MODE ? "/beta-login" : "/login");
    }
  }, [user, loading, router]);

  return (
    <View style={styles.container} testID="splash-loading">
      <ActivityIndicator color={colors.brandPrimary} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
});
