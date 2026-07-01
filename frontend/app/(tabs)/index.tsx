import { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import BottomSheet, { BottomSheetScrollView, BottomSheetBackdrop } from "@gorhom/bottom-sheet";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/api/client";
import { SPORTS, DIFFICULTIES, TIMER_OPTIONS, ERA_OPTIONS, timerOption, eraOption, Sport } from "@/src/constants/sports";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme/theme";

export default function Home() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);
  const [selected, setSelected] = useState<Sport | null>(null);
  const [difficulty, setDifficulty] = useState("medium");
  const [timer, setTimer] = useState("standard");
  const [era, setEra] = useState("modern");
  const [rank, setRank] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      refresh();
      api.leaderboard().then((d) => setRank(d.me.rank)).catch(() => {});
    }, [refresh])
  );

  const snapPoints = useMemo(() => ["78%"], []);

  const multiplier = timerOption(timer).mult * eraOption(era).mult;

  const openSheet = (sport: Sport) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelected(sport);
    setDifficulty("medium");
    setTimer("standard");
    setEra("modern");
    sheetRef.current?.expand();
  };

  const startMatch = () => {
    if (!selected) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    sheetRef.current?.close();
    router.push({ pathname: "/quiz", params: { sport: selected.key, difficulty, timer, era } });
  };

  const initial = (user?.name || "P").charAt(0).toUpperCase();

  return (
    <View style={styles.container} testID="home-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.brandRow}>
          <Text style={styles.wordmark}>StatHead</Text>
          <MaterialCommunityIcons name="spray" size={22} color={colors.brandPrimary} />
        </View>
        <View style={styles.profileRow}>
          {user?.picture ? (
            <Image source={{ uri: user.picture }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Welcome back</Text>
            <Text style={styles.name} numberOfLines={1}>{user?.name || "Player"}</Text>
          </View>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.statBox} testID="home-total-score">
            <Text style={styles.statValue}>{user?.total_score ?? 0}</Text>
            <Text style={styles.statLabel}>TOTAL PTS</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox} testID="home-rank">
            <Text style={styles.statValue}>{rank ? `#${rank}` : "—"}</Text>
            <Text style={styles.statLabel}>GLOBAL RANK</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{user?.matches ?? 0}</Text>
            <Text style={styles.statLabel}>MATCHES</Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable testID="play-with-friends" style={styles.mpCard} onPress={() => router.push("/lobby/create")}>
          <View style={styles.mpIcon}>
            <Ionicons name="people" size={24} color={colors.onBrandPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.mpTitle}>Play with Friends</Text>
            <Text style={styles.mpSub}>Create a lobby & invite up to 3 friends</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.onBrandPrimary} />
        </Pressable>

        <Text style={styles.sectionTitle}>QUICK PLAY</Text>
        <View style={styles.grid}>
          {SPORTS.map((sport, i) => (
            <Animated.View key={sport.key} entering={FadeInDown.delay(i * 50)} style={styles.gridItem}>
              <Pressable
                testID={`sport-card-${sport.key}`}
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.85, borderColor: colors.brandPrimary }]}
                onPress={() => openSheet(sport)}
              >
                <View style={styles.iconBox}>
                  <MaterialCommunityIcons name={sport.icon as any} size={26} color={colors.brandPrimary} />
                </View>
                <Text style={styles.cardTitle}>{sport.name}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceTertiary} style={styles.cardArrow} />
              </Pressable>
            </Animated.View>
          ))}
        </View>
      </ScrollView>

      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: colors.surfaceSecondary }}
        handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} />
        )}
      >
        <BottomSheetScrollView
          contentContainerStyle={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}
          showsVerticalScrollIndicator={false}
        >
          {selected && (
            <>
              <View style={styles.sheetHeader}>
                <View style={styles.sheetIcon}>
                  <MaterialCommunityIcons name={selected.icon as any} size={24} color={colors.brandPrimary} />
                </View>
                <View>
                  <Text style={styles.sheetTitle}>{selected.name}</Text>
                  <Text style={styles.sheetSub}>Configure your match</Text>
                </View>
              </View>

              <Text style={styles.segLabel}>DIFFICULTY</Text>
              <View style={styles.segment}>
                {DIFFICULTIES.map((d) => {
                  const active = difficulty === d.key;
                  return (
                    <Pressable
                      key={d.key}
                      testID={`difficulty-${d.key}`}
                      onPress={() => { Haptics.selectionAsync(); setDifficulty(d.key); }}
                      style={[styles.segmentItem, active && styles.segmentItemActive]}
                    >
                      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{d.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.segLabelRow}>
                <Text style={styles.segLabel}>TIME LIMIT</Text>
                <Text style={styles.segHint}>shorter = more points</Text>
              </View>
              <View style={styles.segment}>
                {TIMER_OPTIONS.map((t) => {
                  const active = timer === t.key;
                  return (
                    <Pressable
                      key={t.key}
                      testID={`timer-${t.key}`}
                      onPress={() => { Haptics.selectionAsync(); setTimer(t.key); }}
                      style={[styles.segmentItem, active && styles.segmentItemActive]}
                    >
                      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{t.label}</Text>
                      <Text style={[styles.segMult, active && styles.segMultActive]}>×{t.mult}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.segLabelRow}>
                <Text style={styles.segLabel}>ERA</Text>
                <Text style={styles.segHint}>broader = more points</Text>
              </View>
              <View style={styles.segment}>
                {ERA_OPTIONS.map((e) => {
                  const active = era === e.key;
                  return (
                    <Pressable
                      key={e.key}
                      testID={`era-${e.key}`}
                      onPress={() => { Haptics.selectionAsync(); setEra(e.key); }}
                      style={[styles.segmentItemCol, active && styles.segmentItemActive]}
                    >
                      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{e.label}</Text>
                      <Text style={[styles.segHintSmall, active && styles.segMultActive]}>{e.hint}</Text>
                      <Text style={[styles.segMult, active && styles.segMultActive]}>×{e.mult}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.multRow} testID="points-multiplier">
                <Ionicons name="trending-up" size={16} color={colors.brandPrimary} />
                <Text style={styles.multText}>Points multiplier</Text>
                <Text style={styles.multValue}>×{multiplier.toFixed(2)}</Text>
              </View>

              <Pressable testID="start-match-button" style={styles.startBtn} onPress={startMatch}>
                <Ionicons name="flash" size={20} color={colors.onBrandPrimary} />
                <Text style={styles.startText}>Start Match</Text>
              </Pressable>
            </>
          )}
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  wordmark: { color: colors.onSurface, fontFamily: fonts.logo, fontSize: 30, letterSpacing: 0.5 },
  mpCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  mpIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: "rgba(0,0,0,0.18)", alignItems: "center", justifyContent: "center" },
  mpTitle: { color: colors.onBrandPrimary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.xl },
  mpSub: { color: colors.onBrandPrimary, fontFamily: fonts.body, fontSize: fontSize.sm, opacity: 0.8 },
  profileRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.lg },
  avatar: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.brandPrimary, fontFamily: fonts.displayBold, fontSize: 22 },
  greeting: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: fontSize.sm },
  name: { color: colors.onSurface, fontFamily: fonts.bodySemiBold, fontSize: fontSize.xl },
  statsRow: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  statBox: { flex: 1, alignItems: "center" },
  statDivider: { width: 1, height: 28, backgroundColor: colors.divider },
  statValue: { color: colors.onSurface, fontFamily: fonts.displayBold, fontSize: 26 },
  statLabel: { color: colors.onSurfaceTertiary, fontFamily: fonts.bodyMedium, fontSize: 10, letterSpacing: 0.8, marginTop: 2 },
  sectionTitle: {
    color: colors.onSurface,
    fontFamily: fonts.poster,
    fontSize: 20,
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  gridItem: { width: "47.8%" },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    height: 120,
    justifyContent: "space-between",
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { color: colors.onSurface, fontFamily: fonts.bodySemiBold, fontSize: fontSize.lg },
  cardArrow: { position: "absolute", top: spacing.lg, right: spacing.lg },
  sheet: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.xl },
  sheetIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetTitle: { color: colors.onSurface, fontFamily: fonts.bodySemiBold, fontSize: fontSize.xl },
  sheetSub: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: fontSize.base },
  segment: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.xs,
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  segLabel: { color: colors.onSurfaceSecondary, fontFamily: fonts.bodySemiBold, fontSize: 11, letterSpacing: 1, marginBottom: spacing.sm },
  segLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  segHint: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: 11, marginBottom: spacing.sm },
  segmentItem: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.sm, alignItems: "center", gap: 2 },
  segmentItemCol: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.sm, alignItems: "center", gap: 2 },
  segMult: { color: colors.onSurfaceTertiary, fontFamily: fonts.bodyMedium, fontSize: 10 },
  segMultActive: { color: colors.onBrandPrimary },
  segHintSmall: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: 10 },
  multRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  multText: { flex: 1, color: colors.onBrandTertiary, fontFamily: fonts.bodyMedium, fontSize: fontSize.base },
  multValue: { color: colors.brandPrimary, fontFamily: fonts.displayBold, fontSize: fontSize.xl },
  segmentItemActive: { backgroundColor: colors.brandPrimary },
  segmentText: { color: colors.onSurfaceSecondary, fontFamily: fonts.bodyMedium, fontSize: fontSize.base },
  segmentTextActive: { color: colors.onBrandPrimary, fontFamily: fonts.bodySemiBold },
  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.brandPrimary,
    height: 56,
    borderRadius: radius.md,
  },
  startText: { color: colors.onBrandPrimary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.lg },
});
