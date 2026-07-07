import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, Pressable } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { tierColor } from "@/src/constants/progression";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme/theme";

type Row = {
  rank: number; user_id: string; name: string; picture?: string; tagline?: string;
  level: number; xp: number; tier: { key: string; name: string; icon: string };
  accuracy: number; streak: number; badge_count: number;
  featured?: { icon: string; name: string; rarity: string } | null;
};

const PODIUM_BG = "https://images.unsplash.com/flagged/photo-1578928534298-9747fc52ec97";
const MEDALS = ["#FFD24D", "#C6CCD8", "#E08A4B"];

function Avatar({ uri, name, size }: { uri?: string; name: string; size: number }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.42 }]}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

function LeaderRow({ item, mine, weekly }: { item: Row; mine: boolean; weekly: boolean }) {
  const medal = item.rank <= 3 ? MEDALS[item.rank - 1] : null;
  return (
    <View
      style={[styles.row, medal ? { backgroundColor: medal, borderColor: "#000" } : null, mine && styles.rowMine]}
      testID={`leaderboard-row-${item.rank}`}
    >
      <Text style={[styles.rowRank, medal ? styles.inkText : null]}>{item.rank}</Text>
      <View style={medal ? styles.medalAvatarRing : null}>
        <Avatar uri={item.picture} name={item.name} size={40} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.nameLine}>
          <Text style={[styles.rowName, medal ? styles.inkText : null]} numberOfLines={1}>{item.name}{mine ? " (You)" : ""}</Text>
          <View style={[styles.levelPill, medal ? { backgroundColor: "#000" } : null]}>
            <Text style={styles.levelPillText}>Lv {item.level}</Text>
          </View>
        </View>
        <Text style={[styles.rowTier, { color: medal ? "#000" : tierColor(item.tier.key) }]} numberOfLines={1}>
          {item.tier.icon} {item.tier.name} · {item.accuracy}% acc
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={[styles.rowScore, medal ? styles.inkText : null]}>{item.xp.toLocaleString()}</Text>
        <Text style={[styles.rowXpLabel, medal ? { color: "#000", opacity: 0.7 } : null]}>{item.featured ? `${item.featured.icon} ` : ""}{weekly ? "WK XP" : "XP"}</Text>
      </View>
    </View>
  );
}

export default function Leaderboard() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [scope, setScope] = useState<"global" | "friends">("global");
  const [period, setPeriod] = useState<"alltime" | "weekly">("alltime");
  const [data, setData] = useState<{ top: Row[]; me: Row } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const board = `${scope}_${period}`;
  const weekly = period === "weekly";

  const load = useCallback(async () => {
    try {
      const d = await api.leaderboard(board);
      setData(d);
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [board]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { setLoading(true); load(); }, [board, load]);

  return (
    <View style={styles.container} testID="leaderboard-screen">
      <View style={{ paddingTop: insets.top }}>
        <View style={styles.headerWrap}>
          <Image source={{ uri: PODIUM_BG }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient colors={["rgba(15,17,21,0.6)", colors.surface]} style={StyleSheet.absoluteFill} />
          <Text style={styles.headerTitle}>LEADERBOARD</Text>

          <View style={styles.tabRow}>
            {(["global", "friends"] as const).map((s) => (
              <Pressable
                key={s}
                testID={`lb-scope-${s}`}
                style={[styles.tab, scope === s && styles.tabActive]}
                onPress={() => setScope(s)}
              >
                <Text style={[styles.tabText, scope === s && styles.tabTextActive]}>
                  {s === "global" ? "GLOBAL" : "FRIENDS"}
                </Text>
              </Pressable>
            ))}
            <View style={styles.tabDivider} />
            {(["alltime", "weekly"] as const).map((p) => (
              <Pressable
                key={p}
                testID={`lb-period-${p}`}
                style={[styles.tab, period === p && styles.tabActive]}
                onPress={() => setPeriod(p)}
              >
                <Text style={[styles.tabText, period === p && styles.tabTextActive]}>
                  {p === "alltime" ? "ALL-TIME" : "WEEKLY"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xxl }} />
      ) : (
        <FlatList
          data={scope === "friends" && (data?.top?.length ?? 0) <= 1 ? [] : data?.top ?? []}
          keyExtractor={(item) => item.user_id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 200 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brandPrimary} />
          }
          ListEmptyComponent={
            <Text style={styles.empty} testID="leaderboard-empty">
              {scope === "friends"
                ? "Add friends to see who really knows ball."
                : weekly
                  ? "Nobody has scored this week yet — get that first bucket!"
                  : "No rankings yet — be the first to play!"}
            </Text>
          }
          renderItem={({ item }) => (
            <LeaderRow item={item} mine={item.user_id === user?.user_id} weekly={weekly} />
          )}
        />
      )}

      {data?.me && (
        <View style={[styles.stickyMe, { paddingBottom: insets.bottom + 72 }]} testID="leaderboard-my-rank">
          <View style={styles.rowSticky}>
            <LeaderRow item={{ ...data.me, name: "You" }} mine={false} weekly={weekly} />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  headerWrap: { paddingTop: spacing.md, paddingBottom: spacing.md, overflow: "hidden" },
  headerTitle: {
    color: colors.onSurface,
    fontFamily: fonts.poster,
    fontSize: 38,
    textAlign: "center",
    letterSpacing: 1,
  },
  tabRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.md, paddingHorizontal: spacing.lg },
  tab: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: "rgba(26,26,26,0.9)", borderWidth: 2, borderColor: "#000", minHeight: 36, justifyContent: "center" },
  tabActive: { backgroundColor: colors.brandPrimary, borderColor: "#000" },
  tabText: { color: colors.onSurfaceSecondary, fontFamily: fonts.cartoon, fontSize: 13, letterSpacing: 1 },
  tabTextActive: { color: "#000" },
  tabDivider: { width: 1, height: 20, backgroundColor: colors.borderStrong },
  avatarFallback: { backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.brandPrimary, fontFamily: fonts.displayBold },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: "#000",
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowMine: { borderWidth: 3, borderColor: colors.brandPrimary },
  inkText: { color: "#000" },
  medalAvatarRing: { borderWidth: 2, borderColor: "#000", borderRadius: 22 },
  rowRank: { color: colors.onSurfaceSecondary, fontFamily: fonts.displayBold, fontSize: fontSize.xl, width: 28, textAlign: "center" },
  nameLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowName: { color: colors.onSurface, fontFamily: fonts.bodySemiBold, fontSize: fontSize.lg, flexShrink: 1 },
  levelPill: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 1 },
  levelPillText: { color: colors.gold, fontFamily: fonts.displayBold, fontSize: 11 },
  rowTier: { fontFamily: fonts.bodyMedium, fontSize: fontSize.sm, marginTop: 1 },
  rowScore: { color: colors.onSurface, fontFamily: fonts.displayBold, fontSize: fontSize.xl },
  rowXpLabel: { color: colors.onSurfaceTertiary, fontFamily: fonts.bodyMedium, fontSize: 9, letterSpacing: 0.6 },
  stickyMe: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm },
  rowSticky: { marginBottom: -spacing.sm },
  empty: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, textAlign: "center", marginTop: spacing.xxl, fontSize: fontSize.base, paddingHorizontal: spacing.xl },
});
