import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { api } from "@/src/api/client";
import { sportName, timerOption, eraOption } from "@/src/constants/sports";
import { useToast } from "@/src/components/Toast";
import { UserAvatar } from "@/src/components/UserAvatar";
import { useAuth } from "@/src/context/AuthContext";
import { colors, fonts, fontSize, radius, spacing, tints } from "@/src/theme/theme";

const BASE_POINTS = 100;

type Q = { id: string; question: string; options: string[]; correct_index: number };

export default function Quiz() {
  const { sport, difficulty, timer, era, lobbyId } = useLocalSearchParams<{
    sport: string; difficulty: string; timer: string; era: string; lobbyId?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user } = useAuth();

  const isLobby = !!lobbyId;
  const [lobbySettings, setLobbySettings] = useState<any>(null);
  const [streak, setStreak] = useState(0);
  const [cfgTimer, setCfgTimer] = useState(timer || "standard");
  const [cfgEra, setCfgEra] = useState(era || "modern");
  const lobbyTimer = lobbySettings?.timer_seconds ?? 15;
  const noTimer = isLobby && lobbyTimer === 0;
  const perQuestionSeconds = isLobby ? (lobbyTimer > 0 ? lobbyTimer : 999) : timerOption(cfgTimer).seconds;
  const multiplier = timerOption(cfgTimer).mult * eraOption(cfgEra).mult;

  const [questions, setQuestions] = useState<Q[] | null>(null);
  const [error, setError] = useState(false);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(perQuestionSeconds);
  const [livePlayers, setLivePlayers] = useState<any[]>([]);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progress = useSharedValue(0);

  const load = useCallback(async () => {
    setError(false);
    setQuestions(null);
    try {
      if (lobbyId) {
        const g = await api.lobbyGame(lobbyId);
        setLobbySettings(g.settings);
        const secs = g.settings.timer_seconds || 0;
        setSecondsLeft(secs > 0 ? secs : 999);
        setQuestions(g.questions);
      } else {
        const qs = await api.generateQuiz(sport, difficulty, era, 7);
        setQuestions(qs);
      }
    } catch {
      setError(true);
    }
  }, [sport, difficulty, era, lobbyId]);

  useEffect(() => { load(); }, [load]);

  // live standings polling (multiplayer only)
  useEffect(() => {
    if (!lobbyId || !questions) return;
    let alive = true;
    const fetchLive = () =>
      api.lobbyLive(lobbyId).then((d) => { if (alive) setLivePlayers(d.players); }).catch(() => {});
    fetchLive();
    const iv = setInterval(fetchLive, 3000);
    return () => { alive = false; clearInterval(iv); };
  }, [lobbyId, questions]);

  const reportProgress = useCallback(
    (curScore: number, questionIndex: number) => {
      if (!lobbyId) return;
      api.lobbyProgress(lobbyId, { score: curScore, question_index: questionIndex }).catch(() => {});
      // optimistic local update so my chip moves instantly
      setLivePlayers((prev) => {
        const next = prev.map((p) => (p.user_id === user?.user_id ? { ...p, score: curScore } : p));
        next.sort((a, b) => b.score - a.score);
        return next;
      });
    },
    [lobbyId, user?.user_id]
  );

  const finish = useCallback(
    (finalScore: number, finalCorrect: number, total: number) => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (lobbyId) {
        api
          .submitLobbyScore(lobbyId, { score: finalScore, correct: finalCorrect, total })
          .catch(() => {})
          .finally(() => router.replace(`/lobby/${lobbyId}`));
        return;
      }
      router.replace({
        pathname: "/results",
        params: {
          sport,
          difficulty,
          timer,
          era,
          score: String(finalScore),
          correct: String(finalCorrect),
          total: String(total),
        },
      });
    },
    [router, sport, difficulty, timer, era, lobbyId]
  );

  const advance = useCallback(
    (curScore: number, curCorrect: number) => {
      if (!questions) return;
      if (current + 1 >= questions.length) {
        finish(curScore, curCorrect, questions.length);
      } else {
        setCurrent((c) => c + 1);
        setSelected(null);
        setLocked(false);
        setSecondsLeft(perQuestionSeconds);
      }
    },
    [questions, current, finish, perQuestionSeconds]
  );

  const handleAnswer = useCallback(
    (index: number | null) => {
      if (locked || !questions) return;
      setLocked(true);
      if (intervalRef.current) clearInterval(intervalRef.current);
      const q = questions[current];
      const isCorrect = index === q.correct_index;
      let newScore = score;
      let newCorrect = correctCount;
      let newStreak = streak;
      if (isCorrect) {
        newCorrect = correctCount + 1;
        newStreak = streak + 1;
        if (isLobby && lobbySettings) {
          let pts = BASE_POINTS;
          if (lobbySettings.speed_bonus_enabled && !noTimer) pts += secondsLeft * 5;
          if (lobbySettings.streak_bonus_enabled) pts += 25 * newStreak;
          if (lobbySettings.final_question_multiplier_enabled && current === questions.length - 1) pts *= 2;
          newScore = score + Math.round(pts);
        } else {
          newScore = score + Math.round((BASE_POINTS + secondsLeft * 10) * multiplier);
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        newStreak = 0;
        if (isLobby && lobbySettings?.wrong_answer_penalty_enabled) newScore = Math.max(0, score - 50);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      setScore(newScore);
      setCorrectCount(newCorrect);
      setStreak(newStreak);
      setSelected(index);
      reportProgress(newScore, current + 1);
      setTimeout(() => advance(newScore, newCorrect), 1100);
    },
    [locked, questions, current, score, correctCount, secondsLeft, advance, multiplier, streak, isLobby, lobbySettings, noTimer, reportProgress]
  );

  // timer
  useEffect(() => {
    if (!questions || locked) return;
    progress.value = 0;
    progress.value = withTiming((current + 1) / questions.length, { duration: 300 });
    if (noTimer) return;
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          handleAnswer(null);
          return 0;
        }
        if (s <= 6) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return s - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, questions, locked]);

  const progressStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  if (error) {
    return (
      <View style={styles.centered} testID="quiz-error">
        <Ionicons name="cloud-offline" size={48} color={colors.onSurfaceTertiary} />
        <Text style={styles.centerText}>Couldn&apos;t load questions</Text>
        <Pressable style={styles.retryBtn} onPress={load} testID="quiz-retry">
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={{ marginTop: spacing.md }}>
          <Text style={styles.quitText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  if (!questions) {
    return (
      <View style={styles.centered} testID="quiz-loading">
        <ActivityIndicator size="large" color={colors.brandPrimary} />
        <Text style={styles.centerText}>{lobbyId ? "Loading your match…" : `Preparing your ${sportName(sport)} match…`}</Text>
      </View>
    );
  }

  const q = questions[current];
  const timerColor = secondsLeft <= 5 ? colors.error : colors.brandPrimary;

  const optionStyle = (i: number) => {
    if (!locked) return [styles.option];
    if (i === q.correct_index) return [styles.option, styles.optionCorrect];
    if (i === selected) return [styles.option, styles.optionWrong];
    return [styles.option, { opacity: 0.5 }];
  };
  const optionTextStyle = (i: number) => {
    if (!locked) return styles.optionText;
    if (i === q.correct_index || i === selected) return [styles.optionText, { color: colors.onSurface, fontFamily: fonts.bodySemiBold }];
    return styles.optionText;
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md }]} testID="quiz-screen">
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} testID="quiz-quit" hitSlop={10} style={styles.quitBtn}>
          <Ionicons name="close" size={22} color={colors.onSurfaceSecondary} />
        </Pressable>
        <Text style={styles.qCounter}>{current + 1} / {questions.length}</Text>
        <View style={styles.scorePill}>
          <Ionicons name="star" size={13} color={colors.brandPrimary} />
          <Text style={styles.scoreText} testID="quiz-score">{score}</Text>
        </View>
      </View>

      {isLobby && livePlayers.length > 0 && (
        <View style={styles.liveBar} testID="quiz-live-bar">
          {livePlayers.map((p, i) => {
            const isMe = p.user_id === user?.user_id;
            const isLeader = i === 0 && p.score > 0;
            return (
              <View
                key={p.user_id}
                style={[styles.livePlayer, isMe && styles.livePlayerMe]}
                testID={`quiz-live-player-${i}`}
              >
                <View>
                  <UserAvatar uri={p.picture} name={p.name} size={26} />
                  {isLeader && (
                    <Ionicons name="trophy" size={12} color={colors.gold} style={styles.liveCrown} />
                  )}
                </View>
                <View>
                  <Text style={[styles.liveName, isMe && { color: colors.brandPrimary }]} numberOfLines={1}>
                    {isMe ? "You" : p.name}
                  </Text>
                  <Text style={[styles.liveScore, isLeader && { color: colors.gold }]}>
                    {p.score}{p.finished ? " ✓" : ""}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.timerWrap}>
        {noTimer ? (
          <View style={[styles.timerCircle, { borderColor: colors.brandSecondary }]}>
            <Ionicons name="infinite" size={40} color={colors.brandSecondary} />
          </View>
        ) : (
          <View style={[styles.timerCircle, { borderColor: timerColor }]}>
            <Text style={[styles.timerText, { color: timerColor }]} testID="quiz-timer">{secondsLeft}</Text>
          </View>
        )}
        {streak > 1 && (
          <View style={styles.streakPill} testID="quiz-streak">
            <Ionicons name="flame" size={13} color={colors.gold} />
            <Text style={styles.streakText}>{streak} streak</Text>
          </View>
        )}
      </View>

      <Animated.View key={q.id} entering={FadeIn.duration(300)} style={styles.questionWrap}>
        <Text style={styles.question}>{q.question}</Text>
      </Animated.View>

      <View style={styles.options}>
        {q.options.map((opt, i) => (
          <Pressable
            key={i}
            testID={`quiz-option-${i}`}
            style={optionStyle(i)}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              handleAnswer(i);
            }}
            disabled={locked}
          >
            <Text style={optionTextStyle(i)}>{opt}</Text>
            {locked && i === q.correct_index && <Ionicons name="checkmark-circle" size={22} color={colors.success} />}
            {locked && i === selected && i !== q.correct_index && <Ionicons name="close-circle" size={22} color={colors.error} />}
          </Pressable>
        ))}
      </View>

      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, progressStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.lg },
  centered: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  centerText: { color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: fontSize.lg, textAlign: "center" },
  retryBtn: { backgroundColor: colors.brandPrimary, paddingVertical: spacing.md, paddingHorizontal: spacing.xxl, borderRadius: radius.md, marginTop: spacing.md },
  retryText: { color: colors.onBrandPrimary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.lg },
  quitText: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: fontSize.base },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  quitBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  qCounter: { color: colors.onSurfaceSecondary, fontFamily: fonts.bodyMedium, fontSize: fontSize.base },
  scorePill: { flexDirection: "row", alignItems: "center", gap: spacing.xs, backgroundColor: colors.surfaceSecondary, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.pill },
  scoreText: { color: colors.onSurface, fontFamily: fonts.displayBold, fontSize: fontSize.lg },
  liveBar: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  livePlayer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "transparent",
  },
  livePlayerMe: { borderColor: colors.brandPrimary, backgroundColor: colors.surfaceTertiary },
  liveCrown: { position: "absolute", top: -7, right: -4 },
  liveName: { color: colors.onSurfaceSecondary, fontFamily: fonts.bodyMedium, fontSize: 11, maxWidth: 64 },
  liveScore: { color: colors.onSurface, fontFamily: fonts.displayBold, fontSize: fontSize.sm },
  timerWrap: { alignItems: "center", marginTop: spacing.xl },
  streakPill: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm, backgroundColor: colors.surfaceTertiary, paddingVertical: 4, paddingHorizontal: spacing.md, borderRadius: radius.pill },
  streakText: { color: colors.gold, fontFamily: fonts.bodySemiBold, fontSize: fontSize.sm },  timerCircle: { width: 96, height: 96, borderRadius: 48, borderWidth: 4, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  timerText: { fontFamily: fonts.displayBold, fontSize: 46 },
  questionWrap: { marginTop: spacing.xl, minHeight: 90, justifyContent: "center" },
  question: { color: colors.onSurface, fontFamily: fonts.bodyMedium, fontSize: fontSize["2xl"], lineHeight: 32, textAlign: "center" },
  options: { flex: 1, gap: spacing.md, marginTop: spacing.lg },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    minHeight: 60,
  },
  optionCorrect: { borderColor: colors.success, backgroundColor: tints.correct },
  optionWrong: { borderColor: colors.error, backgroundColor: tints.wrong },
  optionText: { color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: fontSize.lg, flex: 1 },
  progressTrack: { height: 4, backgroundColor: colors.surfaceTertiary, borderRadius: 2, marginBottom: spacing.lg },
  progressFill: { height: 4, backgroundColor: colors.brandPrimary, borderRadius: 2 },
});
