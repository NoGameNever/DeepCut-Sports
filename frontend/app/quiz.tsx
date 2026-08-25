import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { api } from "@/src/api/client";
import { sportName, timerOption } from "@/src/constants/sports";
import { useToast } from "@/src/components/Toast";
import { UserAvatar } from "@/src/components/UserAvatar";
import { Sticker } from "@/src/components/Sticker";
import { useAuth } from "@/src/context/AuthContext";
import { setPendingProgression } from "@/src/state/progressionEvent";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme/theme";

const OPTION_FILLS = ["#FF9F1C", "#2EC4B6", "#9B5DE5", "#00B8FF"];
const BASE_POINTS = 100;

type PublicQ = {
  id: string;
  question: string;
  options: string[];
  difficulty?: string;
  tags?: string[];
  deep_cut?: boolean;
};

type LobbyQ = PublicQ & { correct_index: number };

type QuizStartResponse = {
  session_id: string;
  total: number;
  question_index: number;
  question: PublicQ;
};

type QuizAnswerResponse = {
  correct: boolean;
  correct_index: number;
  score: number;
  correct_count: number;
  question_index: number;
  total: number;
  complete: boolean;
  next_question?: PublicQ | null;
  progression?: any;
  user?: any;
};

export default function Quiz() {
  const { sport, difficulty, timer, era, lobbyId, sports, count } = useLocalSearchParams<{
    sport: string; difficulty: string; timer: string; era: string; lobbyId?: string; sports?: string; count?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user } = useAuth();

  const isLobby = !!lobbyId;
  const [lobbySettings, setLobbySettings] = useState<any>(null);
  const [streak, setStreak] = useState(0);
  const [cfgTimer] = useState(timer || "standard");
  const lobbyTimer = lobbySettings?.timer_seconds ?? 15;
  const noTimer = isLobby && lobbyTimer === 0;
  const perQuestionSeconds = isLobby ? (lobbyTimer > 0 ? lobbyTimer : 999) : timerOption(cfgTimer).seconds;

  const [questions, setQuestions] = useState<LobbyQ[] | null>(null);
  const [singleQuestion, setSingleQuestion] = useState<PublicQ | null>(null);
  const [singleSessionId, setSingleSessionId] = useState<string | null>(null);
  const [singleTotal, setSingleTotal] = useState(0);
  const [error, setError] = useState(false);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealedCorrectIndex, setRevealedCorrectIndex] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(perQuestionSeconds);
  const [livePlayers, setLivePlayers] = useState<any[]>([]);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const answersRef = useRef<any[]>([]);
  const progress = useSharedValue(0);

  const load = useCallback(async () => {
    setError(false);
    setQuestions(null);
    setSingleQuestion(null);
    setSingleSessionId(null);
    setSingleTotal(0);
    setCurrent(0);
    setScore(0);
    setCorrectCount(0);
    setSelected(null);
    setRevealedCorrectIndex(null);
    setLocked(false);
    answersRef.current = [];
    try {
      if (lobbyId) {
        const g = await api.lobbyGame(lobbyId);
        setLobbySettings(g.settings);
        const secs = g.settings.timer_seconds || 0;
        setSecondsLeft(secs > 0 ? secs : 999);
        setQuestions(g.questions);
      } else {
        const started: QuizStartResponse = await api.startQuizSession({
          sports: sports ? sports.split(",") : [sport],
          difficulty,
          era,
          count: parseInt(count || "7", 10) || 7,
        });
        setSingleSessionId(started.session_id);
        setSingleTotal(started.total);
        setSingleQuestion(started.question);
        setSecondsLeft(timerOption(cfgTimer).seconds);
      }
    } catch {
      setError(true);
    }
  }, [sport, difficulty, era, lobbyId, sports, count, cfgTimer]);

  useEffect(() => { load(); }, [load]);

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
      setLivePlayers((prev) => {
        const next = prev.map((p) => (p.user_id === user?.user_id ? { ...p, score: curScore } : p));
        next.sort((a, b) => b.score - a.score);
        return next;
      });
    },
    [lobbyId, user?.user_id]
  );

  const finishSinglePlayer = useCallback(
    (finalScore: number, finalCorrect: number, total: number, progression?: any) => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (progression) setPendingProgression(progression);
      router.replace({
        pathname: "/results",
        params: {
          sport,
          sports: sports || sport,
          count: count || String(total),
          difficulty,
          timer,
          era,
          score: String(finalScore),
          correct: String(finalCorrect),
          total: String(total),
          serverAuthoritative: "1",
        },
      });
    },
    [router, sport, sports, count, difficulty, timer, era]
  );

  const finishLobby = useCallback(
    (finalScore: number, finalCorrect: number, total: number) => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (!lobbyId) return;
      api
        .submitLobbyScore(lobbyId, { score: finalScore, correct: finalCorrect, total, answers: answersRef.current })
        .then((res) => { if (res?.progression) setPendingProgression(res.progression); })
        .catch(() => {})
        .finally(() => router.replace(`/lobby/${lobbyId}`));
    },
    [lobbyId, router]
  );

  const advanceLobby = useCallback(
    (curScore: number, curCorrect: number) => {
      if (!questions) return;
      if (current + 1 >= questions.length) {
        finishLobby(curScore, curCorrect, questions.length);
      } else {
        setCurrent((c) => c + 1);
        setSelected(null);
        setRevealedCorrectIndex(null);
        setLocked(false);
        setSecondsLeft(perQuestionSeconds);
      }
    },
    [questions, current, finishLobby, perQuestionSeconds]
  );

  const handleLobbyAnswer = useCallback(
    (index: number | null) => {
      if (locked || !questions) return;
      setLocked(true);
      if (intervalRef.current) clearInterval(intervalRef.current);
      const q = questions[current];
      const isCorrect = index === q.correct_index;
      answersRef.current.push({
        correct: isCorrect,
        difficulty: q.difficulty || difficulty,
        tags: q.tags || [],
        deep_cut: !!q.deep_cut,
      });
      let newScore = score;
      let newCorrect = correctCount;
      let newStreak = streak;
      if (isCorrect) {
        newCorrect = correctCount + 1;
        newStreak = streak + 1;
        if (lobbySettings) {
          let pts = BASE_POINTS;
          if (lobbySettings.speed_bonus_enabled && !noTimer) pts += secondsLeft * 5;
          if (lobbySettings.streak_bonus_enabled) pts += 25 * newStreak;
          if (lobbySettings.final_question_multiplier_enabled && current === questions.length - 1) pts *= 2;
          newScore = score + Math.round(pts);
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        newStreak = 0;
        if (lobbySettings?.wrong_answer_penalty_enabled) newScore = Math.max(0, score - 50);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      setScore(newScore);
      setCorrectCount(newCorrect);
      setStreak(newStreak);
      setSelected(index);
      setRevealedCorrectIndex(q.correct_index);
      reportProgress(newScore, current + 1);
      setTimeout(() => advanceLobby(newScore, newCorrect), 1100);
    },
    [locked, questions, current, score, correctCount, secondsLeft, advanceLobby, streak, lobbySettings, noTimer, reportProgress, difficulty]
  );

  const handleSingleAnswer = useCallback(
    async (index: number | null) => {
      if (locked || !singleSessionId || !singleQuestion) return;
      setLocked(true);
      if (intervalRef.current) clearInterval(intervalRef.current);
      setSelected(index);
      try {
        const result: QuizAnswerResponse = await api.answerQuizSession(singleSessionId, index);
        setRevealedCorrectIndex(result.correct_index);
        setScore(result.score);
        setCorrectCount(result.correct_count);
        answersRef.current.push({
          correct: result.correct,
          difficulty: singleQuestion.difficulty || difficulty,
          tags: singleQuestion.tags || [],
          deep_cut: !!singleQuestion.deep_cut,
        });
        Haptics.notificationAsync(
          result.correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
        );

        if (result.complete) {
          setTimeout(
            () => finishSinglePlayer(result.score, result.correct_count, result.total, result.progression),
            1100
          );
          return;
        }

        setTimeout(() => {
          setCurrent(result.question_index + 1);
          setSingleQuestion(result.next_question || null);
          setSelected(null);
          setRevealedCorrectIndex(null);
          setLocked(false);
          setSecondsLeft(timerOption(cfgTimer).seconds);
        }, 1100);
      } catch {
        setLocked(false);
        toast.show?.("Couldn't submit answer", "error");
      }
    },
    [locked, singleSessionId, singleQuestion, difficulty, finishSinglePlayer, cfgTimer, toast]
  );

  const handleAnswer = useCallback(
    (index: number | null) => {
      if (isLobby) handleLobbyAnswer(index);
      else void handleSingleAnswer(index);
    },
    [isLobby, handleLobbyAnswer, handleSingleAnswer]
  );

  const totalQuestions = isLobby ? (questions?.length || 0) : singleTotal;
  const activeQuestion: (PublicQ | LobbyQ) | null = isLobby ? (questions?.[current] || null) : singleQuestion;

  useEffect(() => {
    if (!activeQuestion || locked || totalQuestions < 1) return;
    progress.value = 0;
    progress.value = withTiming((current + 1) / totalQuestions, { duration: 300 });
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
  }, [current, activeQuestion, locked, totalQuestions, noTimer, handleAnswer]);

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

  if (!activeQuestion) {
    return (
      <View style={styles.centered} testID="quiz-loading">
        <ActivityIndicator size="large" color={colors.brandPrimary} />
        <Text style={styles.centerText}>{lobbyId ? "Loading your match…" : `Preparing your ${sportName(sport)} match…`}</Text>
      </View>
    );
  }

  const q = activeQuestion;
  const urgent = secondsLeft <= 5;
  const correctIndex = isLobby ? (q as LobbyQ).correct_index : revealedCorrectIndex;

  const optionFill = (i: number) => {
    if (!locked) return OPTION_FILLS[i % OPTION_FILLS.length];
    if (correctIndex !== null && i === correctIndex) return colors.success;
    if (i === selected) return colors.error;
    return colors.surfaceTertiary;
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md }]} testID="quiz-screen">
      <View style={styles.topRow}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="close" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressBar, progressStyle]} />
        </View>
        <View style={[styles.timerPill, urgent && styles.timerUrgent]}>
          <Ionicons name="time-outline" size={16} color={urgent ? colors.error : colors.onSurfaceSecondary} />
          <Text style={[styles.timerText, urgent && styles.timerTextUrgent]}>{noTimer ? "∞" : secondsLeft}</Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.metaText}>Q{current + 1}/{totalQuestions}</Text>
        <Text style={styles.scoreText}>{score.toLocaleString()} pts</Text>
      </View>

      {isLobby && livePlayers.length > 0 && (
        <View style={styles.liveRow}>
          {livePlayers.slice(0, 4).map((p, i) => (
            <View key={p.user_id || i} style={styles.liveChip}>
              <UserAvatar user={p} size={24} />
              <Text numberOfLines={1} style={styles.liveName}>{p.username || p.name || "Player"}</Text>
              <Text style={styles.liveScore}>{p.score || 0}</Text>
            </View>
          ))}
        </View>
      )}

      <Animated.View entering={FadeIn.duration(180)} style={styles.questionCard}>
        <Sticker label={q.deep_cut ? "DEEP CUT" : difficulty?.toUpperCase()} />
        <Text style={styles.questionText}>{q.question}</Text>
      </Animated.View>

      <View style={styles.optionsWrap}>
        {q.options.map((option, i) => (
          <Pressable
            key={`${q.id}-${i}`}
            disabled={locked}
            onPress={() => handleAnswer(i)}
            style={[styles.optionBtn, { backgroundColor: optionFill(i) }]}
            testID={`quiz-option-${i}`}
          >
            <Text style={styles.optionLetter}>{String.fromCharCode(65 + i)}</Text>
            <Text style={styles.optionText}>{option}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  centered: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  centerText: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: fontSize.lg, marginTop: spacing.md, textAlign: "center" },
  retryBtn: { marginTop: spacing.lg, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.lg },
  retryText: { color: "#fff", fontFamily: fonts.bold },
  quitText: { color: colors.onSurfaceSecondary, fontFamily: fonts.semibold },
  topRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: colors.surfaceSecondary },
  progressTrack: { flex: 1, height: 10, borderRadius: 999, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  progressBar: { height: "100%", backgroundColor: colors.brandPrimary, borderRadius: 999 },
  timerPill: { minWidth: 58, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, flexDirection: "row", gap: 5, alignItems: "center", justifyContent: "center" },
  timerUrgent: { backgroundColor: colors.surfaceTertiary },
  timerText: { color: colors.onSurfaceSecondary, fontFamily: fonts.bold },
  timerTextUrgent: { color: colors.error },
  metaRow: { marginTop: spacing.md, flexDirection: "row", justifyContent: "space-between" },
  metaText: { color: colors.onSurfaceSecondary, fontFamily: fonts.semibold },
  scoreText: { color: colors.brandPrimary, fontFamily: fonts.bold },
  liveRow: { marginTop: spacing.md, flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  liveChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, paddingVertical: 6, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, maxWidth: "48%" },
  liveName: { color: colors.onSurface, fontFamily: fonts.semibold, maxWidth: 90 },
  liveScore: { color: colors.brandPrimary, fontFamily: fonts.bold },
  questionCard: { marginTop: spacing.xl, backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl, minHeight: 180, justifyContent: "center" },
  questionText: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: fontSize.xl, lineHeight: 32, marginTop: spacing.md },
  optionsWrap: { marginTop: spacing.xl, gap: spacing.md },
  optionBtn: { minHeight: 72, borderRadius: radius.xl, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md },
  optionLetter: { color: "#fff", fontFamily: fonts.bold, fontSize: fontSize.lg, width: 24 },
  optionText: { color: "#fff", fontFamily: fonts.bold, fontSize: fontSize.md, flex: 1 },
});
