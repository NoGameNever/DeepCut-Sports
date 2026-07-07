import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { ProgressionModal } from "@/src/components/ProgressionModal";
import { sportName, timerOption, eraOption } from "@/src/constants/sports";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme/theme";

export default function Results() {
  const { sport, difficulty, timer, era, score, correct, total, answers } = useLocalSearchParams<{
    sport: string; difficulty: string; timer: string; era: string; score: string; correct: string; total: string; answers?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refresh } = useAuth();

  const scoreN = parseInt(score || "0", 10);
  const correctN = parseInt(correct || "0", 10);
  const totalN = parseInt(total || "0", 10);
  const accuracy = totalN > 0 ? Math.round((correctN / totalN) * 100) : 0;

  const [rank, setRank] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(true);
  const [progression, setProgression] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        let parsed: any[] | undefined;
        try { parsed = answers ? JSON.parse(answers) : undefined; } catch {}
        const res = await api.submitQuiz({ sport, difficulty, score: scoreN, correct: correctN, total: totalN, answers: parsed });
        setRank(res.rank);
        if (res.progression) {
          setProgression(res.progression);
          if (res.progression.leveled_up || res.progression.tier_changed || res.progression.unlocked_achievements?.length) {
            setShowModal(true);
          }
        }
        await refresh();
      } catch {}
      finally {
        setSyncing(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const perfect = accuracy === 100;
  const good = accuracy >= 60;
  const multiplier = timerOption(timer).mult * eraOption(era).mult;

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl }]} testID="results-screen">
      <View style={styles.top}>
        <Animated.View entering={ZoomIn.duration(400)} style={[styles.trophy, { backgroundColor: good ? colors.brandTertiary : colors.surfaceSecondary }]}>
          <Ionicons name={perfect ? "trophy" : good ? "ribbon" : "flag"} size={44} color={good ? colors.brandPrimary : colors.onSurfaceSecondary} />
        </Animated.View>
        <Text style={styles.title}>MATCH OVER</Text>
        <Text style={styles.subtitle}>{sportName(sport)} · {String(difficulty).toUpperCase()}</Text>

        <Animated.View entering={FadeInDown.delay(150)} style={styles.scoreBlock}>
          <Text style={styles.scoreValue} testID="results-score">{scoreN}</Text>
          <Text style={styles.scoreLabel}>POINTS EARNED</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200)} style={styles.multBadge} testID="results-multiplier">
          <Ionicons name="flame" size={15} color={colors.brandPrimary} />
          <Text style={styles.multBadgeText}>×{multiplier.toFixed(2)} multiplier applied</Text>
        </Animated.View>

        {progression && progression.xp_gained > 0 && (
          <Animated.View entering={FadeInDown.delay(250)} style={styles.xpBadge} testID="results-xp-gained">
            <Text style={styles.xpBadgeText}>+{progression.xp_gained} Knowledge XP</Text>
            <Text style={styles.xpBadgeSub}>Lv {progression.level} · {progression.tier?.icon} {progression.tier?.name}</Text>
          </Animated.View>
        )}
      </View>

      <Animated.View entering={FadeInDown.delay(250)} style={styles.statGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{correctN}/{totalN}</Text>
          <Text style={styles.statLabel}>CORRECT</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{accuracy}%</Text>
          <Text style={styles.statLabel}>ACCURACY</Text>
        </View>
        <View style={styles.statCard}>
          {syncing ? <ActivityIndicator color={colors.brandPrimary} /> : <Text style={styles.statValue}>{rank ? `#${rank}` : "—"}</Text>}
          <Text style={styles.statLabel}>GLOBAL RANK</Text>
        </View>
      </Animated.View>

      <View style={styles.actions}>
        <Pressable
          testID="play-again-button"
          style={[styles.btn, styles.btnPrimary]}
          onPress={() => router.replace({ pathname: "/quiz", params: { sport, difficulty, timer, era } })}
        >
          <Ionicons name="refresh" size={20} color={colors.onBrandPrimary} />
          <Text style={styles.btnPrimaryText}>Play Again</Text>
        </Pressable>
        <Pressable testID="results-leaderboard-button" style={[styles.btn, styles.btnSecondary]} onPress={() => router.replace("/(tabs)/leaderboard")}>
          <Ionicons name="trophy-outline" size={20} color={colors.onSurface} />
          <Text style={styles.btnSecondaryText}>Ranks</Text>
        </Pressable>
      </View>
      <Pressable testID="results-home-button" onPress={() => router.replace("/(tabs)")} style={styles.homeLink}>
        <Text style={styles.homeText}>Back to Home</Text>
      </Pressable>

      {showModal && <ProgressionModal summary={progression} onClose={() => setShowModal(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.xl },
  top: { alignItems: "center" },
  trophy: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center" },
  title: { color: colors.onSurface, fontFamily: fonts.poster, fontSize: 52, letterSpacing: 1, marginTop: spacing.lg },
  subtitle: { color: colors.onSurfaceSecondary, fontFamily: fonts.bodyMedium, fontSize: fontSize.base, letterSpacing: 1 },
  scoreBlock: { alignItems: "center", marginTop: spacing.xl },
  scoreValue: { color: colors.brandPrimary, fontFamily: fonts.displayBold, fontSize: 72, lineHeight: 74 },
  scoreLabel: { color: colors.onSurfaceTertiary, fontFamily: fonts.bodyMedium, fontSize: fontSize.sm, letterSpacing: 1.5 },
  multBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  multBadgeText: { color: colors.onBrandTertiary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.sm },
  xpBadge: { alignItems: "center", marginTop: spacing.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.gold, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  xpBadgeText: { color: colors.gold, fontFamily: fonts.displayBold, fontSize: fontSize.xl },
  xpBadgeSub: { color: colors.onSurfaceSecondary, fontFamily: fonts.bodyMedium, fontSize: fontSize.sm, marginTop: 2 },
  statGrid: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xxl },
  statCard: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: "center", gap: spacing.xs, minHeight: 78, justifyContent: "center" },
  statValue: { color: colors.onSurface, fontFamily: fonts.displayBold, fontSize: 26 },
  statLabel: { color: colors.onSurfaceTertiary, fontFamily: fonts.bodyMedium, fontSize: 9, letterSpacing: 0.8 },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: "auto" },
  btn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 56, borderRadius: radius.md },
  btnPrimary: { backgroundColor: colors.brandPrimary },
  btnPrimaryText: { color: colors.onBrandPrimary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.lg },
  btnSecondary: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  btnSecondaryText: { color: colors.onSurface, fontFamily: fonts.bodySemiBold, fontSize: fontSize.lg },
  homeLink: { alignItems: "center", marginTop: spacing.lg },
  homeText: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: fontSize.base },
});
