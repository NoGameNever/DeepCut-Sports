import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { SPORTS, DIFFICULTIES, TIMER_OPTIONS, ERA_OPTIONS } from "@/src/constants/sports";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme/theme";

export default function CreateLobby() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [sport, setSport] = useState("soccer");
  const [difficulty, setDifficulty] = useState("medium");
  const [timer, setTimer] = useState("standard");
  const [era, setEra] = useState("modern");
  const [creating, setCreating] = useState(false);

  const create = async () => {
    setCreating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      const lobby = await api.createLobby({ sport, difficulty, timer, era });
      router.replace(`/lobby/${lobby.id}`);
    } catch (e: any) {
      toast.show(e.detail || "Couldn't create lobby", "error");
      setCreating(false);
    }
  };

  const Segment = ({ options, value, onChange, testPrefix }: any) => (
    <View style={styles.segment}>
      {options.map((o: any) => {
        const active = value === o.key;
        return (
          <Pressable
            key={o.key}
            testID={`${testPrefix}-${o.key}`}
            onPress={() => { Haptics.selectionAsync(); onChange(o.key); }}
            style={[styles.segItem, active && styles.segItemActive]}
          >
            <Text style={[styles.segText, active && styles.segTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View style={styles.container} testID="create-lobby-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} testID="create-lobby-back">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>CREATE LOBBY</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.label}>SPORT</Text>
        <View style={styles.grid}>
          {SPORTS.map((s) => {
            const active = sport === s.key;
            return (
              <Pressable
                key={s.key}
                testID={`create-sport-${s.key}`}
                style={[styles.sportCard, active && styles.sportCardActive]}
                onPress={() => { Haptics.selectionAsync(); setSport(s.key); }}
              >
                <MaterialCommunityIcons name={s.icon as any} size={24} color={active ? colors.brandPrimary : colors.onSurfaceSecondary} />
                <Text style={[styles.sportText, active && { color: colors.onSurface }]}>{s.name}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>DIFFICULTY</Text>
        <Segment options={DIFFICULTIES} value={difficulty} onChange={setDifficulty} testPrefix="create-difficulty" />
        <Text style={styles.label}>TIME LIMIT</Text>
        <Segment options={TIMER_OPTIONS} value={timer} onChange={setTimer} testPrefix="create-timer" />
        <Text style={styles.label}>ERA</Text>
        <Segment options={ERA_OPTIONS} value={era} onChange={setEra} testPrefix="create-era" />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Pressable testID="create-lobby-button" style={styles.createBtn} onPress={create} disabled={creating}>
          {creating ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <>
              <Ionicons name="people" size={20} color={colors.onBrandPrimary} />
              <Text style={styles.createText}>Create Lobby</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: colors.divider },
  backBtn: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary },
  headerTitle: { color: colors.onSurface, fontFamily: fonts.poster, fontSize: 26, letterSpacing: 0.5 },
  label: { color: colors.onSurfaceSecondary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.sm, letterSpacing: 1, marginBottom: spacing.md, marginTop: spacing.lg },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  sportCard: { width: "31.5%", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: "center", gap: spacing.sm },
  sportCardActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  sportText: { color: colors.onSurfaceSecondary, fontFamily: fonts.bodyMedium, fontSize: fontSize.sm },
  segment: { flexDirection: "row", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.xs, gap: spacing.xs },
  segItem: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.sm, alignItems: "center" },
  segItemActive: { backgroundColor: colors.brandPrimary },
  segText: { color: colors.onSurfaceSecondary, fontFamily: fonts.bodyMedium, fontSize: fontSize.base },
  segTextActive: { color: colors.onBrandPrimary, fontFamily: fonts.bodySemiBold },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider },
  createBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brandPrimary, height: 56, borderRadius: radius.md },
  createText: { color: colors.onBrandPrimary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.lg },
});
