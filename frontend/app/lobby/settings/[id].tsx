import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { api } from "@/src/api/client";
import {
  StickerButton,
  StickerChip,
  StickerIconButton,
} from "@/src/components/StickerControls";
import { useToast } from "@/src/components/Toast";
import {
  GAME_TYPES,
  DIFFICULTIES,
  CATEGORIES,
  ERAS,
  ANSWER_FORMATS,
  TIMERS,
  QUESTION_PRESETS,
  DEFAULT_SETTINGS,
  Opt,
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

  const set = (key: string, value: any) => {
    if (readOnly) return;
    Haptics.selectionAsync();
    setSettings((current: any) => ({ ...current, [key]: value }));
  };

  const toggleCat = (key: string) => {
    if (readOnly) return;
    Haptics.selectionAsync();
    setSettings((current: any) => {
      const has = current.selected_categories.includes(key);
      const next = has
        ? current.selected_categories.filter((category: string) => category !== key)
        : [...current.selected_categories, key];
      return { ...current, selected_categories: next.length ? next : current.selected_categories };
    });
  };

  const step = (key: string, delta: number, min: number, max: number) => {
    if (readOnly) return;
    setSettings((current: any) => ({
      ...current,
      [key]: Math.max(min, Math.min(max, (current[key] || min) + delta)),
    }));
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

  const Chips = ({ opts, value, onPick, testPrefix }: { opts: Opt[]; value: string; onPick: (key: string) => void; testPrefix: string }) => (
    <View style={styles.chipWrap}>
      {opts.map((option, index) => (
        <StickerChip
          key={option.key}
          label={`${option.label}${option.soon ? " · soon" : ""}`}
          selected={value === option.key}
          tone={index % 2 === 0 ? "brand" : "cyan"}
          disabled={option.soon || readOnly}
          onPress={() => onPick(option.key)}
          testID={`${testPrefix}-${option.key}`}
        />
      ))}
    </View>
  );

  const Toggle = ({ label, k }: { label: string; k: string }) => (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        testID={`toggle-${k}`}
        value={!!settings[k]}
        onValueChange={(value) => set(k, value)}
        disabled={readOnly}
        trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }}
        thumbColor={settings[k] ? colors.gold : colors.onSurface}
      />
    </View>
  );

  const Stepper = ({ label, k, min, max, delta = 1 }: { label: string; k: string; min: number; max: number; delta?: number }) => (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <View style={styles.stepper}>
        <StickerIconButton
          icon="remove"
          tone="dark"
          size={36}
          disabled={readOnly}
          onPress={() => step(k, -delta, min, max)}
          testID={`step-${k}-minus`}
          accessibilityLabel={`Decrease ${label}`}
        />
        <Text style={styles.stepValue}>{settings[k]}</Text>
        <StickerIconButton
          icon="add"
          tone="brand"
          size={36}
          disabled={readOnly}
          onPress={() => step(k, delta, min, max)}
          testID={`step-${k}-plus`}
          accessibilityLabel={`Increase ${label}`}
        />
      </View>
    </View>
  );

  return (
    <View style={styles.container} testID="lobby-settings-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <StickerIconButton
          icon="close"
          tone="dark"
          onPress={() => router.back()}
          testID="settings-back"
          accessibilityLabel="Close settings"
        />
        <Text style={styles.headerTitle}>GAME SETTINGS</Text>
        {readOnly ? (
          <View style={{ width: 46 }} />
        ) : (
          <StickerIconButton
            icon="refresh"
            tone="gold"
            onPress={() => setSettings({ ...DEFAULT_SETTINGS })}
            testID="reset-defaults-button"
            accessibilityLabel="Reset settings"
          />
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 150 }} showsVerticalScrollIndicator={false}>
        {readOnly && (
          <View style={styles.roBanner} testID="settings-readonly-banner">
            <Ionicons name="lock-closed" size={16} color={colors.onSurfaceSecondary} />
            <Text style={styles.roText}>Only the host can edit settings.</Text>
          </View>
        )}

        <Text style={styles.group}>GAME MODE</Text>
        <Chips opts={GAME_TYPES} value={settings.game_type} onPick={(key) => set("game_type", key)} testPrefix="gametype" />
        <Text style={styles.sub}>Difficulty</Text>
        <Chips opts={DIFFICULTIES} value={settings.difficulty} onPick={(key) => set("difficulty", key)} testPrefix="difficulty" />
        <Text style={styles.sub}>Answer Format</Text>
        <Chips opts={ANSWER_FORMATS} value={settings.answer_format} onPick={(key) => set("answer_format", key)} testPrefix="format" />

        <Text style={styles.group}>QUESTIONS</Text>
        <Chips opts={QUESTION_PRESETS} value={String(settings.question_count)} onPick={(key) => set("question_count", parseInt(key, 10))} testPrefix="qcount" />
        <Stepper label="Custom count" k="question_count" min={5} max={50} />
        <Text style={styles.sub}>Categories</Text>
        <View style={styles.chipWrap}>
          {CATEGORIES.map((category, index) => (
            <StickerChip
              key={category.key}
              label={category.label}
              selected={settings.selected_categories.includes(category.key)}
              tone={index % 3 === 0 ? "gold" : index % 3 === 1 ? "cyan" : "brand"}
              disabled={readOnly}
              onPress={() => toggleCat(category.key)}
              testID={`category-${category.key}`}
            />
          ))}
        </View>
        <Text style={styles.sub}>Era</Text>
        <Chips opts={ERAS} value={settings.era_filter} onPick={(key) => set("era_filter", key)} testPrefix="era" />

        <Text style={styles.group}>TIMER</Text>
        <Chips opts={TIMERS} value={String(settings.timer_seconds)} onPick={(key) => set("timer_seconds", parseInt(key, 10))} testPrefix="timer" />
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
          <StickerButton
            label="Save Settings"
            icon="save"
            tone="brand"
            size="lg"
            fullWidth
            loading={saving}
            onPress={() => void save()}
            testID="save-settings-button"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.surfaceSecondary, borderBottomWidth: 3, borderBottomColor: colors.ink },
  headerTitle: { color: colors.onSurface, fontFamily: fonts.poster, fontSize: 24, letterSpacing: 0.5 },
  roBanner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 2, borderColor: colors.ink, padding: spacing.md, marginBottom: spacing.md },
  roText: { color: colors.onSurfaceSecondary, fontFamily: fonts.bodyMedium, fontSize: fontSize.base },
  group: { color: colors.brandPrimary, fontFamily: fonts.poster, fontSize: 18, letterSpacing: 0.5, marginTop: spacing.xl, marginBottom: spacing.md },
  sub: { color: colors.onSurfaceSecondary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.sm, letterSpacing: 0.5, marginTop: spacing.lg, marginBottom: spacing.sm },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 2, borderColor: colors.ink, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, marginTop: spacing.sm, gap: spacing.md },
  toggleLabel: { flex: 1, color: colors.onSurface, fontFamily: fonts.bodyMedium, fontSize: fontSize.lg },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stepValue: { color: colors.onSurface, fontFamily: fonts.displayBold, fontSize: fontSize.xl, minWidth: 32, textAlign: "center" },
  errorBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: "rgba(239,71,111,0.16)", borderRadius: radius.md, borderWidth: 2, borderColor: colors.error, padding: spacing.md, marginTop: spacing.lg },
  errorText: { flex: 1, color: colors.error, fontFamily: fonts.bodyMedium, fontSize: fontSize.base },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.surface, borderTopWidth: 3, borderTopColor: colors.ink },
});
