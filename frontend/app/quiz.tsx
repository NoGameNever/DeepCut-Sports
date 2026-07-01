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
import { colors, fonts, fontSize, radius, spacing, tints } from "@/src/theme/theme";

const BASE_POINTS = 100;

type Q = { id: string; question: string; options: string[]; correct_index: number };

export default function Quiz() {
  const { sport, difficulty, timer, era } = useLocalSearchParams<{
    sport: string; difficulty: string; timer: string; era: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const perQuestionSeconds = timerOption(timer).seconds;
  const multiplier = timerOption(timer).mult * eraOption(era).mult;

  const [questions, setQuestions] = useState<Q[] | null>(null);
  const [error, setError] = useState(false);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(perQuestionSeconds);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progress = useSharedValue(0);

  const load = useCallback(async () => {
    setError(false);
    setQuestions(null);
    try {
      const qs = await api.generateQuiz(sport, difficulty, era, 7);
      setQuestions(qs);
    } catch {
      setError(true);
    }
  }, [sport, difficulty, era]);

  useEffect(() => { load(); }, [load]);

  const finish = useCallback(
    (finalScore: number, finalCorrect: number, total: number) => {
      if (intervalRef.current) clearInterval(intervalRef.current);
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
    [router, sport, difficulty, timer, era]
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
      if (isCorrect) {
        const bonus = secondsLeft * 10;
        newScore = score + Math.round((BASE_POINTS + bonus) * multiplier);
        newCorrect = correctCount + 1;
        setScore(newScore);
        setCorrectCount(newCorrect);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      setSelected(index);
      setTimeout(() => advance(newScore, newCorrect), 1100);
    },
    [locked, questions, current, score, correctCount, secondsLeft, advance, multiplier]
  );

  // timer
  useEffect(() => {
    if (!questions || locked) return;
    progress.value = 0;
    progress.value = withTiming((current + 1) / questions.length, { duration: 300 });
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
        <Text style={styles.centerText}>Preparing your {sportName(sport)} match…</Text>
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

      <View style={styles.timerWrap}>
        <View style={[styles.timerCircle, { borderColor: timerColor }]}>
          <Text style={[styles.timerText, { color: timerColor }]} testID="quiz-timer">{secondsLeft}</Text>
        </View>
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
  timerWrap: { alignItems: "center", marginTop: spacing.xl },
  timerCircle: { width: 96, height: 96, borderRadius: 48, borderWidth: 4, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
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
