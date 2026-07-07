import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Switch } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import {
  GAME_TYPES, DIFFICULTIES, CATEGORIES, ERAS, ANSWER_FORMATS, TIMERS, QUESTION_PRESETS, DEFAULT_SETTINGS, Opt,
} from "@/src/constants/lobbySettings";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme/theme";

export default function LobbySettings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const [settings, setSettings] = useState<any>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getLobbySettings(id);
        setSettings(res.settings);
        setReadOnly(!res.is_host || res.locked);
      } catch {
        toast.show("Couldn't load settings", "error");
        router.back();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k: string, v: any) => {
    if (readOnly) return;
    Haptics.selectionAsync();
    setSettings((s: any) => ({ ...s, [k]: v }));
  };

  const toggleCat = (key: string) => {
    if (readOnly) return;
    Haptics.selectionAsync();
    setSettings((s: any) => {
      const has = s.selected_categories.includes(key);
      const next = has ? s.selected_categories.filter((c: string) => c !== key) : [...s.selected_categories, key];
      return { ...s, selected_categories: next.length ? next : s.selected_categories };
    });
  };

  const step = (k: string, delta: number, min: number, max: number) => {
    if (readOnly) return;
    setSettings((s: any) => ({ ...s, [k]: Math.max(min, Math.min(max, (s[k] || min) + delta)) }));
  };

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      await api.updateLobbySettings(id, settings);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show("Settings saved!", "success");
      router.back();
    } catch (e: any) {
      setError(e.detail || "Couldn't save settings");
      setSaving(false);
    }
  };

  if (!settings) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  }

  const Chips = ({ opts, value, onPick, testPrefix }: { opts: Opt[]; value: string; onPick: (k: string) => void; testPrefix: string }) => (
    <View style={styles.chipWrap}>
      {opts.map((o) => {
        const active = value === o.key;
        return (
          <Pressable
            key={o.key}
            testID={`${testPrefix}-${o.key}`}
            disabled={o.soon || readOnly}
            onPress={() => onPick(o.key)}
            style={[styles.chip, active && styles.chipActive, o.soon && styles.chipSoon]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive, o.soon && styles.chipTextSoon]}>
              {o.label}{o.soon ? " · soon" : ""}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const Toggle = ({ label, k }: { label: string; k: string }) => (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        testID={`toggle-${k}`}
        value={!!settings[k]}
        onValueChange={(v) => set(k, v)}
        disabled={readOnly}
        trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }}
        thumbColor={colors.onSurface}
      />
    </View>
  );

  const Stepper = ({ label, k, min, max, delta = 1 }: { label: string; k: string; min: number; max: number; delta?: number }) => (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable testID={`step-${k}-minus`} style={styles.stepBtn} onPress={() => step(k, -delta, min, max)} disabled={readOnly}>
          <Ionicons name="remove" size={18} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.stepValue}>{settings[k]}</Text>
        <Pressable testID={`step-${k}-plus`} style={styles.stepBtn} onPress={() => step(k, delta, min, max)} disabled={readOnly}>
          <Ionicons name="add" size={18} color={colors.onSurface} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.container} testID="lobby-settings-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} testID="settings-back">
          <Ionicons name="close" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>GAME SETTINGS</Text>
        {readOnly ? <View style={{ width: 40 }} /> : (
          <Pressable testID="reset-defaults-button" onPress={() => setSettings({ ...DEFAULT_SETTINGS })} style={styles.resetBtn}>
            <Ionicons name="refresh" size={18} color={colors.onSurfaceSecondary} />
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        {readOnly && (
          <View style={styles.roBanner} testID="settings-readonly-banner">
            <Ionicons name="lock-closed" size={16} color={colors.onSurfaceSecondary} />
            <Text style={styles.roText}>Only the host can edit settings.</Text>
          </View>
        )}

        <Text style={styles.group}>GAME MODE</Text>
        <Chips opts={GAME_TYPES} value={settings.game_type} onPick={(k) => set("game_type", k)} testPrefix="gametype" />
        <Text style={styles.sub}>Difficulty</Text>
        <Chips opts={DIFFICULTIES} value={settings.difficulty} onPick={(k) => set("difficulty", k)} testPrefix="difficulty" />
        <Text style={styles.sub}>Answer Format</Text>
        <Chips opts={ANSWER_FORMATS} value={settings.answer_format} onPick={(k) => set("answer_format", k)} testPrefix="format" />

        <Text style={styles.group}>QUESTIONS</Text>
        <Chips opts={QUESTION_PRESETS} value={String(settings.question_count)} onPick={(k) => set("question_count", parseInt(k, 10))} testPrefix="qcount" />
        <Stepper label="Custom count" k="question_count" min={5} max={50} />
        <Text style={styles.sub}>Categories</Text>
        <View style={styles.chipWrap}>
          {CATEGORIES.map((c) => {
            const active = settings.selected_categories.includes(c.key);
            return (
              <Pressable key={c.key} testID={`category-${c.key}`} disabled={readOnly} onPress={() => toggleCat(c.key)} style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.sub}>Era</Text>
        <Chips opts={ERAS} value={settings.era_filter} onPick={(k) => set("era_filter", k)} testPrefix="era" />

        <Text style={styles.group}>TIMER</Text>
        <Chips opts={TIMERS} value={String(settings.timer_seconds)} onPick={(k) => set("timer_seconds", parseInt(k, 10))} testPrefix="timer" />
        <Stepper label="Custom timer (sec)" k="timer_seconds" min={0} max={120} delta={5} />

        <Text style={styles.group}>SCORING</Text>
        <Toggle label="Speed bonus" k="speed_bonus_enabled" />
        <Toggle label="Streak bonus" k="streak_bonus_enabled" />
        <Toggle label="Wrong-answer penalty" k="wrong_answer_penalty_enabled" />
        <Toggle label="Final question multiplier" k="final_question_multiplier_enabled" />

        <Text style={styles.group}>LOBBY RULES</Text>
        <Stepper label="Max players" k="max_players" min={2} max={4} />
        <Toggle label="Invite-only" k="invite_only" />
        <Toggle label="Friends-only" k="friends_only" />
        <Toggle label="Allow rematch" k="allow_rematch" />

        {error && (
          <View style={styles.errorBox} testID="settings-error">
            <Ionicons name="alert-circle" size={16} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </ScrollView>

      {!readOnly && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Pressable testID="save-settings-button" style={styles.saveBtn} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.saveText}>Save Settings</Text>}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: colors.divider },
  backBtn: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary },
  resetBtn: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary },
  headerTitle: { color: colors.onSurface, fontFamily: fonts.poster, fontSize: 24, letterSpacing: 0.5 },
  roBanner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  roText: { color: colors.onSurfaceSecondary, fontFamily: fonts.bodyMedium, fontSize: fontSize.base },
  group: { color: colors.brandPrimary, fontFamily: fonts.poster, fontSize: 18, letterSpacing: 0.5, marginTop: spacing.xl, marginBottom: spacing.md },
  sub: { color: colors.onSurfaceSecondary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.sm, letterSpacing: 0.5, marginTop: spacing.lg, marginBottom: spacing.sm },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipSoon: { opacity: 0.4 },
  chipText: { color: colors.onSurfaceSecondary, fontFamily: fonts.bodyMedium, fontSize: fontSize.base },
  chipTextActive: { color: colors.onBrandPrimary, fontFamily: fonts.bodySemiBold },
  chipTextSoon: { color: colors.onSurfaceTertiary },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  toggleLabel: { color: colors.onSurface, fontFamily: fonts.bodyMedium, fontSize: fontSize.lg },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stepBtn: { width: 34, height: 34, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  stepValue: { color: colors.onSurface, fontFamily: fonts.displayBold, fontSize: fontSize.xl, minWidth: 32, textAlign: "center" },
  errorBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: "rgba(255,59,48,0.12)", borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg },
  errorText: { flex: 1, color: colors.error, fontFamily: fonts.bodyMedium, fontSize: fontSize.base },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider },
  saveBtn: { backgroundColor: colors.brandPrimary, height: 56, borderRadius: radius.md, borderWidth: 3, borderColor: colors.ink, alignItems: "center", justifyContent: "center" },
  saveText: { color: colors.onBrandPrimary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.lg },
});
