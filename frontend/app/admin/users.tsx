import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import {
  api,
  AdminAccessUser,
  AdminUserAccessResponse,
} from "@/src/api/client";
import { Sticker } from "@/src/components/Sticker";
import {
  StickerButton,
  StickerChip,
  StickerIconButton,
} from "@/src/components/StickerControls";
import { useToast } from "@/src/components/Toast";
import { UserAvatar } from "@/src/components/UserAvatar";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme/theme";

type AccessFilter = "all" | "full" | "beta";

function formatWhen(value?: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

export default function AdminUsers() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [data, setData] = useState<AdminUserAccessResponse | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AccessFilter>("all");
  const [grantEmail, setGrantEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [workingEmail, setWorkingEmail] = useState<string | null>(null);

  const load = useCallback(async (search = query, access = filter) => {
    setLoading(true);
    try {
      setForbidden(false);
      setData(await api.adminUserAccess({ q: search.trim() || undefined, access, limit: 150 }));
    } catch (error: any) {
      if (error?.status === 403) setForbidden(true);
      else toast.show(error?.detail || "Couldn't load user access", "error");
    } finally {
      setLoading(false);
    }
  }, [filter, query, toast]);

  useEffect(() => {
    void load("", "all");
    // Initial load only. Search/filter effects handle subsequent changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => void load(query, filter), 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query, filter, load]);

  const setAccess = async (email: string, enabled: boolean) => {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes("@")) {
      toast.show("Enter a valid email address", "error");
      return;
    }

    setWorkingEmail(normalized);
    try {
      const result = await api.setFullAppAccess(normalized, enabled);
      if (result.user_found) {
        toast.show(enabled ? "Full app access granted" : "Full app access revoked", "success");
      } else if (enabled) {
        toast.show("Pre-approved. Access will apply when this email registers.", "success");
      } else {
        toast.show("Pending access removed", "success");
      }
      setGrantEmail("");
      await load(query, filter);
    } catch (error: any) {
      toast.show(error?.detail || "Access update failed", "error");
    } finally {
      setWorkingEmail(null);
    }
  };

  if (forbidden) {
    return (
      <View style={styles.centered}>
        <Ionicons name="lock-closed" size={48} color={colors.error} />
        <Text style={styles.pageTitle}>ADMIN ACCESS REQUIRED</Text>
        <Text style={styles.centerText}>This page can grant normal user access, but only an existing DeepCut admin can operate it.</Text>
        <StickerButton label="Go Back" icon="chevron-back" tone="dark" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <View style={styles.container} testID="admin-user-access-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <StickerIconButton
          icon="chevron-back"
          tone="dark"
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>DEEPCUT ADMIN</Text>
          <Text style={styles.pageTitle}>USER ACCESS</Text>
        </View>
        <StickerIconButton
          icon="refresh"
          tone="cyan"
          onPress={() => void load(query, filter)}
          accessibilityLabel="Refresh users"
        />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxxl }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Sticker fill={colors.surfaceSecondary} radius={radius.lg} contentStyle={styles.infoCard}>
          <View style={styles.infoIcon}>
            <Ionicons name="people" size={24} color={colors.ink} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>USER ACCESS ONLY</Text>
            <Text style={styles.infoText}>
              This opens Play, Friends, Ranks, and Profile. It never adds the user to ADMIN_EMAILS and never grants question-bank controls.
            </Text>
          </View>
        </Sticker>

        <View style={styles.summaryGrid}>
          <View style={[styles.statCard, { backgroundColor: colors.cyan }]}>
            <Text style={styles.statValue}>{data?.counts.users ?? 0}</Text>
            <Text style={styles.statLabel}>USERS</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.success }]}>
            <Text style={styles.statValue}>{data?.counts.full_app ?? 0}</Text>
            <Text style={styles.statLabel}>FULL APP</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.warning }]}>
            <Text style={styles.statValue}>{data?.counts.beta_only ?? 0}</Text>
            <Text style={styles.statLabel}>BETA ONLY</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.purple }]}>
            <Text style={styles.statValue}>{data?.counts.pending ?? 0}</Text>
            <Text style={styles.statLabel}>PENDING</Text>
          </View>
        </View>

        <Sticker fill={colors.surfaceSecondary} radius={radius.lg} contentStyle={styles.grantCard}>
          <Text style={styles.sectionTitle}>GRANT BY EMAIL</Text>
          <Text style={styles.helper}>
            You can approve an email before it creates an account. The grant attaches automatically at registration.
          </Text>
          <TextInput
            value={grantEmail}
            onChangeText={setGrantEmail}
            placeholder="tester@example.com"
            placeholderTextColor={colors.onSurfaceTertiary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            testID="full-app-grant-email"
          />
          <StickerButton
            label="Grant Full App Access"
            icon="key"
            tone="success"
            size="lg"
            fullWidth
            loading={workingEmail === grantEmail.trim().toLowerCase() && !!workingEmail}
            onPress={() => void setAccess(grantEmail, true)}
            testID="full-app-grant-submit"
          />
        </Sticker>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={colors.onSurfaceTertiary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search email, username, or name"
            placeholderTextColor={colors.onSurfaceTertiary}
            autoCapitalize="none"
            style={styles.searchInput}
            testID="admin-user-search"
          />
          {loading && <ActivityIndicator size="small" color={colors.brandPrimary} />}
        </View>

        <View style={styles.filterRow}>
          <StickerChip label="All" selected={filter === "all"} tone="brand" onPress={() => setFilter("all")} />
          <StickerChip label="Full App" selected={filter === "full"} tone="success" onPress={() => setFilter("full")} />
          <StickerChip label="Beta Only" selected={filter === "beta"} tone="warning" onPress={() => setFilter("beta")} />
        </View>

        {(data?.pending_grants.length ?? 0) > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>PENDING REGISTRATIONS</Text>
            {data?.pending_grants.map((grant) => (
              <Sticker key={grant.email} fill={colors.purple} radius={radius.lg} contentStyle={styles.pendingCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pendingEmail}>{grant.email}</Text>
                  <Text style={styles.pendingText}>Pre-approved · waiting for account creation</Text>
                </View>
                <StickerButton
                  label="Remove"
                  icon="close"
                  tone="danger"
                  size="sm"
                  loading={workingEmail === grant.email}
                  onPress={() => void setAccess(grant.email, false)}
                />
              </Sticker>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>REGISTERED USERS</Text>
          {!loading && !data?.items.length ? (
            <Text style={styles.empty}>No users match this search and filter.</Text>
          ) : null}
          {data?.items.map((user) => (
            <UserAccessCard
              key={user.user_id}
              user={user}
              working={workingEmail === user.email.toLowerCase()}
              onSetAccess={setAccess}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function UserAccessCard({
  user,
  working,
  onSetAccess,
}: {
  user: AdminAccessUser;
  working: boolean;
  onSetAccess: (email: string, enabled: boolean) => Promise<void>;
}) {
  const full = user.full_app_access;
  return (
    <Sticker
      fill={full ? colors.success : colors.surfaceSecondary}
      radius={radius.lg}
      contentStyle={styles.userCard}
    >
      <View style={styles.userTopRow}>
        <UserAvatar uri={user.picture || undefined} name={user.name} size={48} />
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={[styles.userName, full && styles.darkText]} numberOfLines={1}>{user.name}</Text>
            {user.is_admin && (
              <View style={styles.adminBadge}>
                <Text style={styles.adminBadgeText}>ADMIN</Text>
              </View>
            )}
          </View>
          <Text style={[styles.userEmail, full && styles.darkSecondary]} numberOfLines={1}>{user.email}</Text>
        </View>
        <View style={[styles.accessBadge, { backgroundColor: full ? colors.gold : colors.warning }]}>
          <Text style={styles.accessBadgeText}>{full ? "FULL APP" : "BETA ONLY"}</Text>
        </View>
      </View>

      <View style={styles.userMetaRow}>
        <Text style={[styles.userMeta, full && styles.darkSecondary]}>{user.matches} matches</Text>
        <Text style={[styles.userMeta, full && styles.darkSecondary]}>{user.total_score.toLocaleString()} points</Text>
        <Text style={[styles.userMeta, full && styles.darkSecondary]}>Last seen: {formatWhen(user.last_seen)}</Text>
      </View>

      <StickerButton
        label={full ? "Revoke Full App Access" : "Grant Full App Access"}
        icon={full ? "lock-closed" : "key"}
        tone={full ? "danger" : "success"}
        fullWidth
        loading={working}
        onPress={() => void onSetAccess(user.email, !full)}
        testID={`full-app-toggle-${user.user_id}`}
      />
      {user.is_admin && (
        <Text style={[styles.adminNote, full && styles.darkSecondary]}>
          Admin status is read-only here and remains unchanged.
        </Text>
      )}
    </Sticker>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", gap: spacing.lg, padding: spacing.xl },
  centerText: { color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: fontSize.base, textAlign: "center", lineHeight: 21 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 3, borderBottomColor: colors.ink, backgroundColor: colors.surfaceSecondary },
  eyebrow: { color: colors.brandPrimary, fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 1.2 },
  pageTitle: { color: colors.onSurface, fontFamily: fonts.poster, fontSize: 30, letterSpacing: 0.7 },
  content: { padding: spacing.lg, gap: spacing.lg },
  infoCard: { minHeight: 112, flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
  infoIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.cyan, borderWidth: 2, borderColor: colors.ink, alignItems: "center", justifyContent: "center" },
  infoTitle: { color: colors.onSurface, fontFamily: fonts.cartoon, fontSize: 20, letterSpacing: 0.6 },
  infoText: { color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: fontSize.sm, lineHeight: 19, marginTop: spacing.xs },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  statCard: { width: "46%", flexGrow: 1, minHeight: 86, borderWidth: 3, borderColor: colors.ink, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  statValue: { color: colors.ink, fontFamily: fonts.displayBold, fontSize: 30 },
  statLabel: { color: colors.ink, fontFamily: fonts.cartoon, fontSize: 14, letterSpacing: 0.7 },
  grantCard: { padding: spacing.lg, gap: spacing.md },
  section: { gap: spacing.md },
  sectionTitle: { color: colors.onSurface, fontFamily: fonts.poster, fontSize: 22, letterSpacing: 0.6 },
  helper: { color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: fontSize.sm, lineHeight: 18 },
  input: { minHeight: 52, borderWidth: 2, borderColor: colors.ink, borderRadius: radius.md, backgroundColor: colors.surface, color: colors.onSurface, paddingHorizontal: spacing.md, fontFamily: fonts.body, fontSize: fontSize.base },
  searchBar: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 2, borderColor: colors.ink, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.md },
  searchInput: { flex: 1, color: colors.onSurface, fontFamily: fonts.body, fontSize: fontSize.base },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  pendingCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  pendingEmail: { color: colors.ink, fontFamily: fonts.bodySemiBold, fontSize: fontSize.base },
  pendingText: { color: "rgba(0,0,0,0.68)", fontFamily: fonts.body, fontSize: fontSize.sm, marginTop: 2 },
  userCard: { padding: spacing.lg, gap: spacing.md },
  userTopRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  nameRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  userName: { color: colors.onSurface, fontFamily: fonts.bodySemiBold, fontSize: fontSize.lg, flexShrink: 1 },
  userEmail: { color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: fontSize.sm, marginTop: 2 },
  darkText: { color: colors.ink },
  darkSecondary: { color: "rgba(0,0,0,0.68)" },
  adminBadge: { borderWidth: 2, borderColor: colors.ink, borderRadius: radius.pill, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  adminBadgeText: { color: colors.ink, fontFamily: fonts.bodySemiBold, fontSize: 9, letterSpacing: 0.6 },
  accessBadge: { borderWidth: 2, borderColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  accessBadgeText: { color: colors.ink, fontFamily: fonts.cartoon, fontSize: 12, letterSpacing: 0.5 },
  userMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  userMeta: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: 11 },
  adminNote: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: 11, textAlign: "center" },
  empty: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: fontSize.base, textAlign: "center", paddingVertical: spacing.xl },
});
