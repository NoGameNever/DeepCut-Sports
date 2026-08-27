import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { Sticker } from "@/src/components/Sticker";
import { StickerButton } from "@/src/components/StickerControls";
import { useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme/theme";

export default function CredentialMigration() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user, loading, migrateCredentials, signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (!user.credential_migration_required) router.replace("/(tabs)");
  }, [loading, router, user]);

  const blocked = user?.credential_status === "email_conflict" || user?.credential_status === "missing_email";

  const submit = async () => {
    if (password.length < 8) {
      toast.show("Password must be at least 8 characters.", "error");
      return;
    }
    if (password !== confirmPassword) {
      toast.show("Passwords do not match.", "error");
      return;
    }

    setWorking(true);
    try {
      await migrateCredentials(password);
      toast.show("DeepCut credentials activated", "success");
      router.replace("/(tabs)");
    } catch (error: any) {
      toast.show(error?.detail || "Credential migration failed", "error");
      if (error?.status === 401) router.replace("/login");
    } finally {
      setWorking(false);
    }
  };

  const logout = async () => {
    setWorking(true);
    try {
      await signOut();
      router.replace("/login");
    } finally {
      setWorking(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      testID="credential-migration-screen"
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xxl },
        ]}
      >
        <View style={styles.heroIcon}>
          <Ionicons name="shield-checkmark" size={42} color={colors.ink} />
        </View>

        <View style={styles.heading}>
          <Text style={styles.eyebrow}>DEEPCUT ACCOUNT UPGRADE</Text>
          <Text style={styles.title}>MAKE IT OFFICIAL</Text>
          <Text style={styles.subtitle}>
            The retired login provider never shared your password. Choose a new password owned and secured by DeepCut Sports.
          </Text>
        </View>

        <Sticker fill={colors.surfaceSecondary} radius={radius.lg} contentStyle={styles.card}>
          <View style={styles.accountRow}>
            <View style={styles.accountIcon}>
              <Ionicons name="person" size={22} color={colors.ink} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.accountLabel}>ACCOUNT BEING MIGRATED</Text>
              <Text style={styles.accountEmail} numberOfLines={1}>{user?.email || "Email unavailable"}</Text>
            </View>
          </View>

          {blocked ? (
            <View style={styles.blockedBox}>
              <Ionicons name="warning" size={24} color={colors.warning} />
              <Text style={styles.blockedText}>
                {user?.credential_status === "email_conflict"
                  ? "This email is attached to more than one legacy account. An admin must resolve the duplicate before migration."
                  : "This legacy account has no usable email address. An admin must attach one before migration."}
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.passwordWrap}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="New DeepCut password"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                  style={styles.passwordInput}
                  testID="migration-password"
                />
                <Pressable
                  onPress={() => setShowPassword((value) => !value)}
                  style={styles.eyeButton}
                  accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={21}
                    color={colors.onSurfaceSecondary}
                  />
                </Pressable>
              </View>

              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm new password"
                placeholderTextColor={colors.onSurfaceTertiary}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                style={styles.input}
                onSubmitEditing={() => void submit()}
                testID="migration-password-confirm"
              />

              <View style={styles.requirementRow}>
                <Ionicons
                  name={password.length >= 8 ? "checkmark-circle" : "ellipse-outline"}
                  size={17}
                  color={password.length >= 8 ? colors.success : colors.onSurfaceTertiary}
                />
                <Text style={styles.requirementText}>At least 8 characters</Text>
              </View>

              <StickerButton
                label="Activate DeepCut Login"
                icon="lock-closed"
                tone="success"
                size="lg"
                fullWidth
                loading={working}
                onPress={() => void submit()}
                testID="migration-submit"
              />
            </>
          )}
        </Sticker>

        <Sticker fill={colors.cyan} radius={radius.lg} contentStyle={styles.notice}>
          <Ionicons name="swap-horizontal" size={24} color={colors.ink} />
          <Text style={styles.noticeText}>
            Your profile, scores, friends, ranks, and history stay intact. Only the login credential changes.
          </Text>
        </Sticker>

        <StickerButton
          label="Sign Out"
          icon="log-out-outline"
          tone="dark"
          fullWidth
          loading={blocked && working}
          onPress={() => void logout()}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: spacing.xl, gap: spacing.xl },
  heroIcon: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: colors.success,
    borderWidth: 3,
    borderColor: colors.ink,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
  },
  heading: { alignItems: "center", gap: spacing.sm },
  eyebrow: { color: colors.brandPrimary, fontFamily: fonts.bodySemiBold, fontSize: 11, letterSpacing: 1.3 },
  title: { color: colors.onSurface, fontFamily: fonts.poster, fontSize: 42, letterSpacing: 0.8, textAlign: "center" },
  subtitle: { color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: fontSize.base, lineHeight: 21, textAlign: "center" },
  card: { padding: spacing.lg, gap: spacing.md },
  accountRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  accountIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.gold,
    borderWidth: 2,
    borderColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  accountLabel: { color: colors.onSurfaceTertiary, fontFamily: fonts.bodySemiBold, fontSize: 9, letterSpacing: 0.9 },
  accountEmail: { color: colors.onSurface, fontFamily: fonts.bodySemiBold, fontSize: fontSize.base, marginTop: 2 },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.ink,
    paddingHorizontal: spacing.md,
    color: colors.onSurface,
    fontFamily: fonts.body,
    fontSize: fontSize.base,
  },
  passwordWrap: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.ink,
    flexDirection: "row",
    alignItems: "center",
  },
  passwordInput: { flex: 1, minHeight: 50, paddingHorizontal: spacing.md, color: colors.onSurface, fontFamily: fonts.body, fontSize: fontSize.base },
  eyeButton: { width: 50, minHeight: 50, alignItems: "center", justifyContent: "center" },
  requirementRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  requirementText: { color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: fontSize.sm },
  blockedBox: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface },
  blockedText: { flex: 1, color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: fontSize.sm, lineHeight: 19 },
  notice: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
  noticeText: { flex: 1, color: colors.ink, fontFamily: fonts.bodySemiBold, fontSize: fontSize.sm, lineHeight: 19 },
});
