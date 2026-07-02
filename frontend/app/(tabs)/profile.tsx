import { useCallback } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { sportName, sportIcon } from "@/src/constants/sports";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme/theme";

const COVER = "https://images.unsplash.com/photo-1509486432407-f8fb9cc99acd";

export default function Profile() {
  const { user, signOut, refresh } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const accuracy =
    user && user.total_answers > 0 ? Math.round((user.correct_answers / user.total_answers) * 100) : 0;
  const initial = (user?.name || "P").charAt(0).toUpperCase();

  const onSignOut = async () => {
    await signOut();
    router.replace("/login");
  };

  const stats = [
    { label: "TOTAL POINTS", value: user?.total_score ?? 0, icon: "star" },
    { label: "MATCHES", value: user?.matches ?? 0, icon: "flag-checkered" },
    { label: "ACCURACY", value: `${accuracy}%`, icon: "target" },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false} testID="profile-screen">
      <View style={styles.coverWrap}>
        <Image source={{ uri: COVER }} style={StyleSheet.absoluteFill} contentFit="cover" />
        <LinearGradient colors={["rgba(15,17,21,0.3)", colors.surface]} style={StyleSheet.absoluteFill} />
        <View style={{ height: insets.top }} />
      </View>

      <View style={styles.avatarWrap}>
        {user?.picture ? (
          <Image source={{ uri: user.picture }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
        )}
        <Text style={styles.name}>{user?.name || "Player"}</Text>
        {user?.username ? <Text style={styles.username}>@{user.username}</Text> : null}
        {user?.tagline ? <Text style={styles.tagline}>&ldquo;{user.tagline}&rdquo;</Text> : <Text style={styles.email}>{user?.email}</Text>}
        <Pressable testID="edit-profile-button" style={styles.editBtn} onPress={() => router.push("/profile/edit")}>
          <Ionicons name="create-outline" size={16} color={colors.onSurface} />
          <Text style={styles.editText}>Edit Profile</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>CAREER STATS</Text>
        <View style={styles.statGrid}>
          {stats.map((s) => (
            <View key={s.label} style={styles.statCard} testID={`profile-stat-${s.label}`}>
              <MaterialCommunityIcons name={s.icon as any} size={20} color={colors.brandPrimary} />
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {user?.best_sport && (
          <View style={styles.bestSport}>
            <View style={styles.bestIcon}>
              <MaterialCommunityIcons name={sportIcon(user.best_sport) as any} size={22} color={colors.brandPrimary} />
            </View>
            <View>
              <Text style={styles.bestLabel}>BEST CATEGORY</Text>
              <Text style={styles.bestValue}>{sportName(user.best_sport)}</Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>SETTINGS</Text>
        <Pressable testID="logout-button" style={styles.settingRow} onPress={onSignOut}>
          <Ionicons name="log-out-outline" size={22} color={colors.error} />
          <Text style={[styles.settingText, { color: colors.error }]}>Log Out</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  coverWrap: { height: 160, overflow: "hidden" },
  avatarWrap: { alignItems: "center", marginTop: -44 },
  avatar: { width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: colors.surface, backgroundColor: colors.surfaceTertiary },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.brandPrimary, fontFamily: fonts.displayBold, fontSize: 38 },
  name: { color: colors.onSurface, fontFamily: fonts.bodySemiBold, fontSize: fontSize["2xl"], marginTop: spacing.md },
  username: { color: colors.brandPrimary, fontFamily: fonts.bodyMedium, fontSize: fontSize.base, marginTop: 2 },
  tagline: { color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: fontSize.base, fontStyle: "italic", marginTop: spacing.xs, textAlign: "center", paddingHorizontal: spacing.xl },
  editBtn: { flexDirection: "row", alignItems: "center", gap: spacing.xs, backgroundColor: colors.surfaceTertiary, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.pill, marginTop: spacing.md },
  editText: { color: colors.onSurface, fontFamily: fonts.bodySemiBold, fontSize: fontSize.sm },
  email: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: fontSize.base, marginTop: 2 },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  sectionTitle: { color: colors.onSurfaceSecondary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.sm, letterSpacing: 1.2, marginBottom: spacing.md },
  statGrid: { flexDirection: "row", gap: spacing.md },
  statCard: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg, alignItems: "center", gap: spacing.xs },
  statValue: { color: colors.onSurface, fontFamily: fonts.displayBold, fontSize: 28 },
  statLabel: { color: colors.onSurfaceTertiary, fontFamily: fonts.bodyMedium, fontSize: 9, letterSpacing: 0.6 },
  bestSport: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.md },
  bestIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  bestLabel: { color: colors.onSurfaceTertiary, fontFamily: fonts.bodyMedium, fontSize: 10, letterSpacing: 0.8 },
  bestValue: { color: colors.onSurface, fontFamily: fonts.bodySemiBold, fontSize: fontSize.lg },
  settingRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg },
  settingText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: fontSize.lg },
});
