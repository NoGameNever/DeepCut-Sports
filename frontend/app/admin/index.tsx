import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/api/client";
import { Sticker } from "@/src/components/Sticker";
import { StickerButton, StickerMenuCard } from "@/src/components/StickerControls";
import { useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme/theme";

export default function AdminPortal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [stats, setStats] = useState({ questions: 0, drafts: 0, users: 0, fullApp: 0 });

  useEffect(() => {
    (async () => {
      try {
        const [questions, users] = await Promise.all([
          api.questionBankSummary(),
          api.adminUserAccess({ limit: 1 }),
        ]);
        setStats({
          questions: questions.total,
          drafts: questions.statuses.draft || 0,
          users: users.counts.users,
          fullApp: users.counts.full_app,
        });
      } catch (error: any) {
        if (error?.status === 403) setForbidden(true);
        else toast.show(error?.detail || "Couldn't load admin portal", "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
        <Text style={styles.muted}>Loading DeepCut Admin…</Text>
      </View>
    );
  }

  if (forbidden) {
    return (
      <View style={styles.centered}>
        <Ionicons name="lock-closed" size={48} color={colors.error} />
        <Text style={styles.title}>ADMIN ACCESS REQUIRED</Text>
        <Text style={styles.muted}>Your account is not listed in ADMIN_EMAILS or ADMIN_USER_IDS.</Text>
        <StickerButton label="Back to App" icon="home" tone="dark" onPress={() => router.replace(user?.full_app_access ? "/(tabs)" : "/beta")} />
      </View>
    );
  }

  return (
    <View style={styles.container} testID="admin-portal-screen">
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text style={styles.eyebrow}>DEEPCUT SPORTS</Text>
          <Text style={styles.title}>ADMIN PORTAL</Text>
          <Text style={styles.subtitle}>Content, tester access, and the levers behind the curtain.</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.brandPrimary }]}>
            <Text style={styles.statValue}>{stats.questions}</Text>
            <Text style={styles.statLabel}>QUESTIONS</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.warning }]}>
            <Text style={styles.statValue}>{stats.drafts}</Text>
            <Text style={styles.statLabel}>DRAFTS</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.cyan }]}>
            <Text style={styles.statValue}>{stats.users}</Text>
            <Text style={styles.statLabel}>USERS</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.success }]}>
            <Text style={styles.statValue}>{stats.fullApp}</Text>
            <Text style={styles.statLabel}>FULL APP</Text>
          </View>
        </View>

        <View style={styles.menuStack}>
          <StickerMenuCard
            title="Question Bank"
            description="Generate campaigns, review drafts, approve questions, and monitor quality."
            icon="help-circle"
            iconFill={colors.brandPrimary}
            fill={colors.surfaceSecondary}
            onPress={() => router.push("/admin/questions")}
            testID="admin-questions-link"
          />
          <StickerMenuCard
            title="User Access"
            description="Grant or revoke the complete app without changing admin privileges."
            icon="key"
            iconFill={colors.success}
            fill={colors.surfaceSecondary}
            badge="User Only"
            badgeFill={colors.gold}
            onPress={() => router.push("/admin/users")}
            testID="admin-user-access-link"
          />
        </View>

        <Sticker fill={colors.surfaceSecondary} radius={radius.lg} contentStyle={styles.notice}>
          <Ionicons name="shield-checkmark" size={24} color={colors.success} />
          <Text style={styles.noticeText}>
            Full-app access and admin access are separate permissions. The User Access screen cannot create another admin.
          </Text>
        </Sticker>

        <StickerButton
          label="Back to App"
          icon="home"
          tone="dark"
          fullWidth
          onPress={() => router.replace(user?.full_app_access ? "/(tabs)" : "/beta")}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", gap: spacing.lg, padding: spacing.xl },
  content: { paddingHorizontal: spacing.lg, gap: spacing.xl },
  eyebrow: { color: colors.brandPrimary, fontFamily: fonts.bodySemiBold, fontSize: 11, letterSpacing: 1.5 },
  title: { color: colors.onSurface, fontFamily: fonts.poster, fontSize: 40, letterSpacing: 0.8 },
  subtitle: { color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: fontSize.base, lineHeight: 21, marginTop: spacing.xs },
  muted: { color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: fontSize.base, textAlign: "center" },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  statCard: { width: "46%", flexGrow: 1, minHeight: 90, borderWidth: 3, borderColor: colors.ink, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  statValue: { color: colors.ink, fontFamily: fonts.displayBold, fontSize: 32 },
  statLabel: { color: colors.ink, fontFamily: fonts.cartoon, fontSize: 14, letterSpacing: 0.7 },
  menuStack: { gap: spacing.lg },
  notice: { minHeight: 88, flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
  noticeText: { flex: 1, color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: fontSize.sm, lineHeight: 19 },
});
