import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import { api } from "@/src/api/client";
import { BETA_MODE } from "@/src/config/beta";
import { useAuth } from "@/src/context/AuthContext";
import { ProgressionModal } from "@/src/components/ProgressionModal";
import { Sticker } from "@/src/components/Sticker";
import { consumePendingProgression } from "@/src/state/progressionEvent";
import { sportName, timerOption, eraOption } from "@/src/constants/sports";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme/theme";

const STAT_FILLS = ["#FF9F1C", "#2EC4B6", "#00B8FF"];

export default function Results() {
  const { sport, difficulty, timer, era, score, correct, total, answers, sports, count, serverAuthoritative } = useLocalSearchParams<{
    sport: string;
    difficulty: string;
    timer: string;
    era: string;
    score: string;
    correct: string;
    total: string;
    answers?: string;
    sports?: string;
    count?: string;
    serverAuthoritative?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refresh } = useAuth();

  const scoreN = parseInt(score || "0", 10);
  const correctN = parseInt(correct || "0", 10);
  const totalN = parseInt(total || "0", 10);
  const accuracy = totalN > 0 ? Math.round((correctN / totalN) * 100) : 0;
  const authoritative = serverAuthoritative === "1";

  const [rank, setRank] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(true);
  const [progression, setProgression] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (authoritative) {
          // v2 quiz completion already wrote score, stats and progression on the server.
          // Never call the legacy submit endpoint here or the match would be counted twice.
          const pending = consumePendingProgression();
          if (pending) {
            setProgression(pending);
            if (pending.leveled_up || pending.tier_changed || pending.unlocked_achievements?.length) {
              setShowModal(true);
            }
          }
          await refresh();
          return;
        }

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
          <Ionicons name={authoritative ? "shield-checkmark" : "flame"} size={15} color={colors.brandPrimary} />
          <Text style={styles.multBadgeText}>
            {authoritative ? "Server-verified score" : `×${multiplier.toFixed(2)} multiplier applied`}
          </Text>
        </Animated.View>

        {progression && progression.xp_gained > 0 && (
          <Animated.View entering={FadeInDown.delay(250)} style={styles.xpBadge} testID="results-xp-gained">
            <Text style={styles.xpBadgeText}>+{progression.xp_gained} Knowledge XP</Text>
            <Text style={styles.xpBadgeSub}>Lv {progression.level} · {progression.tier?.icon} {progression.tier?.name}</Text>
          </Animated.View>
        )}
      </View>

      <Animated.View entering={FadeInDown.delay(250)} style={styles.statGrid}>
        <Sticker fill={STAT_FILLS[0]} radius={radius.lg} style={{ flex: 1 }} contentStyle={styles.statCard}>
          <Text style={styles.statValue}>{correctN}/{totalN}</Text>
          <Text style={styles.statLabel}>CORRECT</Text>
        </Sticker>
        <Sticker fill={STAT_FILLS[1]} radius={radius.lg} style={{ flex: 1 }} contentStyle={styles.statCard}>
          <Text style={styles.statValue}>{accuracy}%</Text>
          <Text style={styles.statLabel}>ACCURACY</Text>
        </Sticker>
        <Sticker fill={STAT_FILLS[2]} radius={radius.lg} style={{ flex: 1 }} contentStyle={styles.statCard}>
          {syncing ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.statValue}>{rank ? `#${rank}` : "—"}</Text>}
          <Text style={styles.statLabel}>GLOBAL RANK</Text>
        </Sticker>
      </Animated.View>

      <View style={styles.actions}>
        <Sticker
          fill={colors.brandPrimary}
          radius={radius.lg}
          style={{ flex: 1 }}
          contentStyle={styles.btn}
          testID="play-again-button"
          onPress={() => router.replace({ pathname: "/quiz", params: { sport, sports: sports || sport, count: count || "7", difficulty, timer, era } })}
        >
          <Ionicons name="refresh" size={20} color={colors.ink} />
          <Text style={styles.btnText}>Play Again</Text>
        </Sticker>
        <Sticker
          fill={colors.gold}
          radius={radius.lg}
          style={{ flex: 1 }}
          contentStyle={styles.btn}
          testID={BETA_MODE ? "results-feedback-button" : "results-leaderboard-button"}
          onPress={() => router.replace(BETA_MODE ? "/beta-feedback" : "/(tabs)/leaderboard")}
        >
          <Ionicons name={BETA_MODE ? "chatbubble-ellipses" : "trophy"} size={20} color={colors.ink} />
          <Text style={styles.btnText}>{BETA_MODE ? "Feedback" : "Ranks"}</Text>
        </Sticker>
      </View>
      <Pressable testID="results-home-button" onPress={() => router.replace(BETA_MODE ? "/beta" : "/(tabs)")} style={styles.homeLink}>
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
  xpBadge: { alignItems: "center", marginTop: spacing.md, backgroundColor: colors.gold, borderWidth: 3, borderColor: colors.ink, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  xpBadgeText: { color: colors.ink, fontFamily: fonts.cartoon, fontSize: 22, letterSpacing: 1 },
  xpBadgeSub: { color: colors.ink, fontFamily: fonts.bodySemiBold, fontSize: fontSize.sm, marginTop: 2, opacity: 0.8 },
  statGrid: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xxl },
  statCard: { paddingVertical: spacing.lg, alignItems: "center", gap: spacing.xs, minHeight: 78, justifyContent: "center" },
  statValue: { color: colors.ink, fontFamily: fonts.displayBold, fontSize: 26 },
  statLabel: { color: colors.ink, fontFamily: fonts.bodySemiBold, fontSize: 9, letterSpacing: 0.8, opacity: 0.75 },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: "auto" },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 56 },
  btnText: { color: colors.ink, fontFamily: fonts.cartoon, fontSize: 20, letterSpacing: 1 },
  homeLink: { alignItems: "center", marginTop: spacing.lg },
  homeText: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: fontSize.base },
});
