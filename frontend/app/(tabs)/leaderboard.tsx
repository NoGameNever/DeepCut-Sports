import { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme/theme";

type Row = { rank: number; user_id: string; name: string; picture?: string; total_score: number; matches: number };

const PODIUM_BG = "https://images.unsplash.com/flagged/photo-1578928534298-9747fc52ec97";

function Avatar({ uri, name, size }: { uri?: string; name: string; size: number }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.42 }]}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

export default function Leaderboard() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [data, setData] = useState<{ top: Row[]; me: Row } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.leaderboard();
      setData(d);
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const podium = data?.top.slice(0, 3) ?? [];
  const rest = data?.top.slice(3) ?? [];
  const order = [1, 0, 2]; // left(2nd), center(1st), right(3rd)
  const medal = ["#FFD24D", "#C6CCD8", "#E08A4B"];

  return (
    <View style={styles.container} testID="leaderboard-screen">
      <View style={{ paddingTop: insets.top }}>
        <View style={styles.podiumWrap}>
          <Image source={{ uri: PODIUM_BG }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient colors={["rgba(15,17,21,0.6)", colors.surface]} style={StyleSheet.absoluteFill} />
          <Text style={styles.headerTitle}>LEADERBOARD</Text>
          {podium.length > 0 && (
            <View style={styles.podiumRow}>
              {order.map((idx) => {
                const p = podium[idx];
                if (!p) return <View key={idx} style={styles.podiumItem} />;
                const isFirst = idx === 0;
                return (
                  <View key={p.user_id} style={styles.podiumItem}>
                    <View style={[styles.podiumAvatarRing, { borderColor: medal[idx] }]}>
                      <Avatar uri={p.picture} name={p.name} size={isFirst ? 64 : 52} />
                      {isFirst && <MaterialCommunityIcons name="crown" size={22} color={medal[0]} style={styles.crown} />}
                    </View>
                    <Text style={styles.podiumName} numberOfLines={1}>{p.name}</Text>
                    <Text style={styles.podiumScore}>{p.total_score}</Text>
                    <View style={[styles.podiumRank, { backgroundColor: medal[idx] }]}>
                      <Text style={styles.podiumRankText}>{p.rank}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xxl }} />
      ) : (
        <FlatList
          data={rest}
          keyExtractor={(item) => item.user_id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brandPrimary} />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>No rankings yet — be the first to play!</Text>
          }
          renderItem={({ item }) => {
            const mine = item.user_id === user?.user_id;
            return (
              <View style={[styles.row, mine && styles.rowMine]} testID={`leaderboard-row-${item.rank}`}>
                <Text style={styles.rowRank}>{item.rank}</Text>
                <Avatar uri={item.picture} name={item.name} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName} numberOfLines={1}>{item.name}{mine ? " (You)" : ""}</Text>
                  <Text style={styles.rowMatches} numberOfLines={1}>{item.tagline || `${item.matches} matches`}</Text>
                </View>
                <Text style={styles.rowScore}>{item.total_score}</Text>
              </View>
            );
          }}
        />
      )}

      {data?.me && (
        <View style={[styles.stickyMe, { paddingBottom: insets.bottom + 72 }]} testID="leaderboard-my-rank">
          <View style={[styles.row, styles.rowSticky]}>
            <Text style={[styles.rowRank, { color: colors.brandPrimary }]}>{data.me.rank}</Text>
            <Avatar uri={data.me.picture} name={data.me.name} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName} numberOfLines={1}>You</Text>
              <Text style={styles.rowMatches}>Your position</Text>
            </View>
            <Text style={[styles.rowScore, { color: colors.brandPrimary }]}>{data.me.total_score}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  podiumWrap: { height: 260, paddingTop: spacing.md, overflow: "hidden" },
  headerTitle: {
    color: colors.onSurface,
    fontFamily: fonts.poster,
    fontSize: 38,
    textAlign: "center",
    letterSpacing: 1,
  },
  podiumRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: spacing.md, marginTop: spacing.lg, paddingHorizontal: spacing.lg },
  podiumItem: { alignItems: "center", flex: 1 },
  podiumAvatarRing: { borderWidth: 2, borderRadius: radius.pill, padding: 3 },
  crown: { position: "absolute", top: -18, alignSelf: "center" },
  podiumName: { color: colors.onSurface, fontFamily: fonts.bodyMedium, fontSize: fontSize.base, marginTop: spacing.sm, maxWidth: 90 },
  podiumScore: { color: colors.brandPrimary, fontFamily: fonts.displayBold, fontSize: fontSize.xl },
  podiumRank: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", marginTop: spacing.xs },
  podiumRankText: { color: colors.surface, fontFamily: fonts.displayBold, fontSize: 13 },
  avatarFallback: { backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.brandPrimary, fontFamily: fonts.displayBold },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowMine: { borderWidth: 1, borderColor: colors.brandPrimary },
  rowRank: { color: colors.onSurfaceSecondary, fontFamily: fonts.displayBold, fontSize: fontSize.xl, width: 28, textAlign: "center" },
  rowName: { color: colors.onSurface, fontFamily: fonts.bodySemiBold, fontSize: fontSize.lg },
  rowMatches: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: fontSize.sm },
  rowScore: { color: colors.onSurface, fontFamily: fonts.displayBold, fontSize: fontSize.xl },
  stickyMe: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm },
  rowSticky: { backgroundColor: colors.surfaceTertiary, marginBottom: 0 },
  empty: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, textAlign: "center", marginTop: spacing.xxl, fontSize: fontSize.base },
});
