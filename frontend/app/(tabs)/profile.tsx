import { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/api/client";
import { XPBar } from "@/src/components/XPBar";
import { tierColor, rarityColor } from "@/src/constants/progression";
import { sportName, sportIcon } from "@/src/constants/sports";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme/theme";

const COVER = "https://images.unsplash.com/photo-1509486432407-f8fb9cc99acd";

export default function Profile() {
  const { user, signOut, refresh } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [prog, setProg] = useState<any>(null);

  useFocusEffect(useCallback(() => {
    refresh();
    api.progression().then(setProg).catch(() => {});
  }, [refresh]));

  const accuracy =
    user && user.total_answers > 0 ? Math.round((user.correct_answers / user.total_answers) * 100) : 0;
  const initial = (user?.name || "P").charAt(0).toUpperCase();

  const onSignOut = async () => {
    await signOut();
    router.replace("/login");
  };

  const stats = [
    { label: "ACCURACY", value: `${prog?.accuracy ?? accuracy}%`, icon: "target" },
    { label: "ANSWERED", value: prog?.total_answers ?? user?.total_answers ?? 0, icon: "comment-question" },
    { label: "CORRECT", value: prog?.correct_answers ?? user?.correct_answers ?? 0, icon: "check-bold" },
    { label: "STREAK", value: prog?.current_streak ?? 0, icon: "fire" },
    { label: "BEST STREAK", value: prog?.best_streak ?? 0, icon: "trophy-variant" },
    { label: "MATCHES", value: user?.matches ?? 0, icon: "flag-checkered" },
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

      {prog && (
        <>
          {/* ---- Level card ---- */}
          <View style={styles.section}>
            <View style={styles.levelCard} testID="profile-level-card">
              <View style={styles.levelHead}>
                <View style={styles.levelBubble}>
                  <Text style={styles.levelNum}>{prog.level}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.levelLabel}>PLAYER LEVEL</Text>
                  <Text style={styles.levelXpLine}>
                    {prog.current_level_xp}/{prog.level_span} XP · {prog.xp_to_next_level} to Lv {prog.level + 1}
                  </Text>
                </View>
              </View>
              <XPBar progress={prog.level_progress} color={colors.gold} />
              <View style={styles.levelChips}>
                <View style={styles.chip}>
                  <Text style={styles.chipValue}>{prog.lifetime_xp.toLocaleString()}</Text>
                  <Text style={styles.chipLabel}>LIFETIME XP</Text>
                </View>
                <View style={styles.chip}>
                  <Text style={styles.chipValue}>{prog.weekly_xp.toLocaleString()}</Text>
                  <Text style={styles.chipLabel}>THIS WEEK</Text>
                </View>
              </View>
            </View>
          </View>

          {/* ---- Rank tier card ---- */}
          <View style={styles.section}>
            <View style={[styles.tierCard, { borderColor: tierColor(prog.tier.key) }]} testID="profile-rank-card">
              <View style={styles.tierHead}>
                <Text style={styles.tierIcon}>{prog.tier.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.tierName, { color: tierColor(prog.tier.key) }]}>{prog.tier.name}</Text>
                  <Text style={styles.tierTagline}>&ldquo;{prog.tier.tagline}&rdquo;</Text>
                </View>
              </View>
              <XPBar progress={prog.tier_progress} color={tierColor(prog.tier.key)} />
              <Text style={styles.tierNext}>
                {prog.next_tier
                  ? `${(prog.next_tier.min_xp - prog.lifetime_xp).toLocaleString()} XP to ${prog.next_tier.icon} ${prog.next_tier.name}`
                  : "Maximum rank achieved. Touch grass? Never."}
              </Text>
            </View>
          </View>
        </>
      )}

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

      {prog && (
        <>
          {/* ---- Level rewards ---- */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>LEVEL REWARDS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {prog.level_rewards.map((r: any) => (
                <View key={r.id} style={[styles.rewardCard, !r.unlocked && { opacity: 0.45 }]} testID={`profile-reward-${r.id}`}>
                  <Text style={styles.rewardIcon}>{r.unlocked ? r.icon : "🔒"}</Text>
                  <Text style={styles.rewardLevel}>LV {r.level}</Text>
                  <Text style={styles.rewardName} numberOfLines={2}>{r.name}</Text>
                </View>
              ))}
            </ScrollView>
          </View>

          {/* ---- Achievements ---- */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              ACHIEVEMENTS ({prog.achievements.filter((a: any) => a.unlocked).length}/{prog.achievements.length})
            </Text>
            {prog.achievements.map((a: any) => (
              <View
                key={a.id}
                style={[styles.achCard, a.unlocked && { borderColor: rarityColor(a.rarity), borderWidth: 1 }]}
                testID={`profile-achievement-${a.id}`}
              >
                <Text style={[styles.achIcon, !a.unlocked && { opacity: 0.5 }]}>{a.icon}</Text>
                <View style={{ flex: 1 }}>
                  <View style={styles.achNameRow}>
                    <Text style={styles.achName}>{a.name}</Text>
                    <View style={[styles.rarityPill, { backgroundColor: rarityColor(a.rarity) }]}>
                      <Text style={styles.rarityText}>{a.rarity.toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text style={styles.achDesc} numberOfLines={2}>{a.description}</Text>
                  {a.unlocked ? (
                    <Text style={[styles.achStatus, { color: rarityColor(a.rarity) }]}>Unlocked · +{a.reward_xp} XP earned</Text>
                  ) : a.coming_soon ? (
                    <Text style={styles.achStatus}>Coming soon · +{a.reward_xp} XP</Text>
                  ) : (
                    <View style={{ marginTop: spacing.xs }}>
                      <XPBar progress={a.progress} height={5} color={rarityColor(a.rarity)} />
                      <Text style={styles.achProgress}>
                        {a.current.toLocaleString()}/{a.target.toLocaleString()} · +{a.reward_xp} XP
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        </>
      )}

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
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  statCard: { width: "30%", flexGrow: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, alignItems: "center", gap: spacing.xs },
  statValue: { color: colors.onSurface, fontFamily: fonts.displayBold, fontSize: 24 },
  statLabel: { color: colors.onSurfaceTertiary, fontFamily: fonts.bodyMedium, fontSize: 9, letterSpacing: 0.6 },
  bestSport: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.md },
  bestIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  bestLabel: { color: colors.onSurfaceTertiary, fontFamily: fonts.bodyMedium, fontSize: 10, letterSpacing: 0.8 },
  bestValue: { color: colors.onSurface, fontFamily: fonts.bodySemiBold, fontSize: fontSize.lg },
  settingRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg },
  settingText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: fontSize.lg },
  // ---- progression ----
  levelCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg, gap: spacing.md },
  levelHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  levelBubble: { width: 54, height: 54, borderRadius: 27, borderWidth: 3, borderColor: colors.gold, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary },
  levelNum: { color: colors.gold, fontFamily: fonts.displayBold, fontSize: 26 },
  levelLabel: { color: colors.onSurfaceTertiary, fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 1 },
  levelXpLine: { color: colors.onSurface, fontFamily: fonts.bodyMedium, fontSize: fontSize.base, marginTop: 2 },
  levelChips: { flexDirection: "row", gap: spacing.md },
  chip: { flex: 1, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: "center" },
  chipValue: { color: colors.onSurface, fontFamily: fonts.displayBold, fontSize: fontSize.xl },
  chipLabel: { color: colors.onSurfaceTertiary, fontFamily: fonts.bodyMedium, fontSize: 9, letterSpacing: 0.8 },
  tierCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, padding: spacing.lg, gap: spacing.md },
  tierHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  tierIcon: { fontSize: 32 },
  tierName: { fontFamily: fonts.poster, fontSize: 22 },
  tierTagline: { color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: fontSize.sm, fontStyle: "italic" },
  tierNext: { color: colors.onSurfaceTertiary, fontFamily: fonts.bodyMedium, fontSize: fontSize.sm },
  rewardCard: { width: 100, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, alignItems: "center", gap: 2 },
  rewardIcon: { fontSize: 24 },
  rewardLevel: { color: colors.gold, fontFamily: fonts.displayBold, fontSize: fontSize.sm },
  rewardName: { color: colors.onSurfaceSecondary, fontFamily: fonts.bodyMedium, fontSize: 10, textAlign: "center" },
  achCard: { flexDirection: "row", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  achIcon: { fontSize: 28 },
  achNameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  achName: { color: colors.onSurface, fontFamily: fonts.bodySemiBold, fontSize: fontSize.base, flexShrink: 1 },
  rarityPill: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 1 },
  rarityText: { color: "#0A0A0A", fontFamily: fonts.bodySemiBold, fontSize: 8, letterSpacing: 0.5 },
  achDesc: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: fontSize.sm, marginTop: 2 },
  achStatus: { color: colors.onSurfaceTertiary, fontFamily: fonts.bodyMedium, fontSize: fontSize.sm, marginTop: spacing.xs },
  achProgress: { color: colors.onSurfaceTertiary, fontFamily: fonts.bodyMedium, fontSize: 11, marginTop: 3 },
});
