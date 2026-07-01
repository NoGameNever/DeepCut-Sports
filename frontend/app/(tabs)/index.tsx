import { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import BottomSheet, { BottomSheetView, BottomSheetBackdrop } from "@gorhom/bottom-sheet";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/api/client";
import { SPORTS, DIFFICULTIES, Sport } from "@/src/constants/sports";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme/theme";

export default function Home() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);
  const [selected, setSelected] = useState<Sport | null>(null);
  const [difficulty, setDifficulty] = useState("medium");
  const [rank, setRank] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      refresh();
      api.leaderboard().then((d) => setRank(d.me.rank)).catch(() => {});
    }, [refresh])
  );

  const snapPoints = useMemo(() => [340], []);

  const openSheet = (sport: Sport) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelected(sport);
    setDifficulty("medium");
    sheetRef.current?.expand();
  };

  const startMatch = () => {
    if (!selected) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    sheetRef.current?.close();
    router.push({ pathname: "/quiz", params: { sport: selected.key, difficulty } });
  };

  const initial = (user?.name || "P").charAt(0).toUpperCase();

  return (
    <View style={styles.container} testID="home-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
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
        <Text style={styles.sectionTitle}>SELECT A SPORT</Text>
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
        <BottomSheetView style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          {selected && (
            <>
              <View style={styles.sheetHeader}>
                <View style={styles.sheetIcon}>
                  <MaterialCommunityIcons name={selected.icon as any} size={24} color={colors.brandPrimary} />
                </View>
                <View>
                  <Text style={styles.sheetTitle}>{selected.name}</Text>
                  <Text style={styles.sheetSub}>Choose your difficulty</Text>
                </View>
              </View>

              <View style={styles.segment}>
                {DIFFICULTIES.map((d) => {
                  const active = difficulty === d.key;
                  return (
                    <Pressable
                      key={d.key}
                      testID={`difficulty-${d.key}`}
                      onPress={() => setDifficulty(d.key)}
                      style={[styles.segmentItem, active && styles.segmentItemActive]}
                    >
                      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{d.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable testID="start-match-button" style={styles.startBtn} onPress={startMatch}>
                <Ionicons name="flash" size={20} color={colors.onBrandPrimary} />
                <Text style={styles.startText}>Start Match</Text>
              </Pressable>
            </>
          )}
        </BottomSheetView>
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
    color: colors.onSurfaceSecondary,
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    letterSpacing: 1.2,
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
    marginBottom: spacing.xl,
  },
  segmentItem: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.sm, alignItems: "center" },
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
