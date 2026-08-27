import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import {
  createRegistrationInvite,
  getAdminRegistration,
  RegistrationAdminState,
  RegistrationMode,
  revokeRegistrationInvite,
  setRegistrationMode,
} from "@/src/api/registrationAccess";
import { Sticker } from "@/src/components/Sticker";
import { StickerButton, StickerChip, StickerIconButton } from "@/src/components/StickerControls";
import { useToast } from "@/src/components/Toast";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme/theme";

const MODE_COPY: Record<RegistrationMode, string> = {
  open: "Anyone can create a new DeepCut account.",
  invite: "Only people with a valid invite link can create an account.",
  closed: "New accounts are blocked. Existing users can still sign in.",
};

export default function RegistrationAccessAdmin() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [data, setData] = useState<RegistrationAdminState | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [maxUses, setMaxUses] = useState("10");
  const [expiresHours, setExpiresHours] = useState("168");
  const [latestLink, setLatestLink] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getAdminRegistration());
    } catch (error: any) {
      toast.show(error?.detail || "Couldn't load registration controls", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const changeMode = async (mode: RegistrationMode) => {
    if (data?.mode === mode) return;
    setWorking(`mode-${mode}`);
    try {
      await setRegistrationMode(mode);
      setData((current) => current ? { ...current, mode } : current);
      toast.show(`Signup mode set to ${mode === "invite" ? "Invite Only" : mode === "open" ? "Open" : "Closed"}`, "success");
    } catch (error: any) {
      toast.show(error?.detail || "Couldn't change signup mode", "error");
    } finally {
      setWorking(null);
    }
  };

  const createInvite = async () => {
    const uses = Number.parseInt(maxUses, 10);
    const hours = Number.parseInt(expiresHours, 10);
    if (!Number.isFinite(uses) || uses < 1 || !Number.isFinite(hours) || hours < 1) {
      toast.show("Enter valid invite limits", "error");
      return;
    }
    setWorking("create");
    try {
      const invite = await createRegistrationInvite(uses, hours);
      setLatestLink(invite.signup_url);
      toast.show("Invite created. Copy it now; the token is only shown once.", "success");
      await load();
    } catch (error: any) {
      toast.show(error?.detail || "Couldn't create invite", "error");
    } finally {
      setWorking(null);
    }
  };

  const copyLatest = async () => {
    if (!latestLink) return;
    try {
      const clipboard = (globalThis as any)?.navigator?.clipboard;
      if (!clipboard?.writeText) throw new Error("Clipboard unavailable");
      await clipboard.writeText(latestLink);
      toast.show("Invite link copied", "success");
    } catch {
      toast.show("Select the link and copy it manually", "info");
    }
  };

  const revoke = async (id: string) => {
    setWorking(id);
    try {
      await revokeRegistrationInvite(id);
      toast.show("Invite revoked", "success");
      await load();
    } catch (error: any) {
      toast.show(error?.detail || "Couldn't revoke invite", "error");
    } finally {
      setWorking(null);
    }
  };

  if (loading && !data) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
        <Text style={styles.muted}>Loading registration controls…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="admin-registration-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <StickerIconButton icon="chevron-back" tone="dark" onPress={() => router.back()} accessibilityLabel="Go back" />
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>DEEPCUT ADMIN</Text>
          <Text style={styles.title}>REGISTRATION</Text>
        </View>
        <StickerIconButton icon="refresh" tone="cyan" onPress={() => void load()} accessibilityLabel="Refresh" />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxxl }]}>
        <Sticker fill={colors.surfaceSecondary} radius={radius.lg} contentStyle={styles.card}>
          <Text style={styles.sectionTitle}>SIGNUP MODE</Text>
          <Text style={styles.helper}>{MODE_COPY[data?.mode || "invite"]}</Text>
          <View style={styles.modeRow}>
            <StickerChip label="Open" selected={data?.mode === "open"} tone="success" onPress={() => void changeMode("open")} disabled={!!working} />
            <StickerChip label="Invite Only" selected={data?.mode === "invite"} tone="brand" onPress={() => void changeMode("invite")} disabled={!!working} />
            <StickerChip label="Closed" selected={data?.mode === "closed"} tone="warning" onPress={() => void changeMode("closed")} disabled={!!working} />
          </View>
        </Sticker>

        <Sticker fill={colors.surfaceSecondary} radius={radius.lg} contentStyle={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons name="ticket" size={24} color={colors.brandPrimary} />
            <Text style={styles.sectionTitle}>CREATE INVITE</Text>
          </View>
          <Text style={styles.helper}>Limit how many accounts can use the link and how long it stays valid.</Text>
          <View style={styles.inputRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>MAX USES</Text>
              <TextInput value={maxUses} onChangeText={setMaxUses} keyboardType="number-pad" style={styles.input} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>VALID HOURS</Text>
              <TextInput value={expiresHours} onChangeText={setExpiresHours} keyboardType="number-pad" style={styles.input} />
            </View>
          </View>
          <StickerButton label="Create Invite Link" icon="link" tone="brand" fullWidth loading={working === "create"} onPress={() => void createInvite()} />

          {latestLink ? (
            <View style={styles.linkBox}>
              <Text style={styles.linkWarning}>COPY NOW · THE TOKEN IS NOT STORED IN PLAINTEXT</Text>
              <TextInput value={latestLink} editable={false} selectTextOnFocus style={styles.linkInput} />
              <StickerButton label="Copy Link" icon="copy" tone="cyan" fullWidth onPress={() => void copyLatest()} />
            </View>
          ) : null}
        </Sticker>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACTIVE INVITES</Text>
          {!data?.invites.length ? <Text style={styles.muted}>No active invite links.</Text> : null}
          {data?.invites.map((invite) => (
            <Sticker key={invite.id} fill={colors.surfaceSecondary} radius={radius.lg} contentStyle={styles.inviteCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inviteTitle}>{invite.uses} / {invite.max_uses} USED</Text>
                <Text style={styles.helper}>Expires {new Date(invite.expires_at).toLocaleString()}</Text>
              </View>
              <StickerButton label="Revoke" icon="close" tone="danger" size="sm" loading={working === invite.id} onPress={() => void revoke(invite.id)} />
            </Sticker>
          ))}
        </View>

        <Sticker fill={colors.surfaceSecondary} radius={radius.lg} contentStyle={styles.notice}>
          <Ionicons name="shield-checkmark" size={24} color={colors.success} />
          <Text style={styles.noticeText}>Signup mode is enforced by the backend. Hiding the Create Account button alone cannot bypass it.</Text>
        </Sticker>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 3, borderBottomColor: colors.ink, backgroundColor: colors.surfaceSecondary },
  content: { padding: spacing.lg, gap: spacing.lg },
  eyebrow: { color: colors.brandPrimary, fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 1.2 },
  title: { color: colors.onSurface, fontFamily: fonts.poster, fontSize: 30, letterSpacing: 0.7 },
  card: { padding: spacing.lg, gap: spacing.md },
  section: { gap: spacing.md },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sectionTitle: { color: colors.onSurface, fontFamily: fonts.poster, fontSize: 22, letterSpacing: 0.6 },
  helper: { color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: fontSize.sm, lineHeight: 19 },
  muted: { color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: fontSize.base },
  modeRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  inputRow: { flexDirection: "row", gap: spacing.md },
  inputLabel: { color: colors.onSurfaceTertiary, fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 1, marginBottom: spacing.xs },
  input: { minHeight: 48, borderWidth: 2, borderColor: colors.ink, borderRadius: radius.md, backgroundColor: colors.surface, color: colors.onSurface, paddingHorizontal: spacing.md, fontFamily: fonts.body, fontSize: fontSize.base },
  linkBox: { gap: spacing.sm, paddingTop: spacing.sm },
  linkWarning: { color: colors.gold, fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 0.8 },
  linkInput: { minHeight: 52, borderWidth: 2, borderColor: colors.ink, borderRadius: radius.md, backgroundColor: colors.surface, color: colors.onSurface, paddingHorizontal: spacing.md, fontFamily: fonts.body, fontSize: fontSize.sm },
  inviteCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  inviteTitle: { color: colors.onSurface, fontFamily: fonts.cartoon, fontSize: 18, letterSpacing: 0.5 },
  notice: { minHeight: 88, flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
  noticeText: { flex: 1, color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: fontSize.sm, lineHeight: 19 },
});
