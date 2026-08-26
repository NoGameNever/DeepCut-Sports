import { useEffect, useMemo, useState } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { passwordResetApi } from "@/src/api/passwordReset";
import { BETA_MODE } from "@/src/config/beta";
import { Sticker } from "@/src/components/Sticker";
import { StickerButton, StickerIconButton } from "@/src/components/StickerControls";
import { useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme/theme";

export default function ResetPassword() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const router = useRouter();
  const toast = useToast();
  const { signOut } = useAuth();
  const token = useMemo(() => {
    const value = Array.isArray(params.token) ? params.token[0] : params.token;
    return (value || "").trim();
  }, [params.token]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [invalidLink, setInvalidLink] = useState(token.length < 20);

  useEffect(() => {
    setInvalidLink(token.length < 20);
  }, [token]);

  const goToLogin = () => router.replace((BETA_MODE ? "/beta-login" : "/login") as any);
  const requestNewLink = () => router.replace("/forgot-password" as any);

  const submit = async () => {
    if (token.length < 20) {
      setInvalidLink(true);
      return;
    }
    if (password.length < 8) {
      toast.show("Password must be at least 8 characters.", "error");
      return;
    }
    if (password !== confirmPassword) {
      toast.show("The passwords do not match.", "error");
      return;
    }

    setSubmitting(true);
    try {
      await passwordResetApi.confirm(token, password);
      await signOut();
      setComplete(true);
    } catch (error: any) {
      if (error?.status === 400) setInvalidLink(true);
      toast.show(error?.detail || "Couldn't reset the password. Request a new link.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
          testID="reset-password-screen"
        >
          <View style={styles.topBar}>
            <StickerIconButton
              icon="arrow-back"
              onPress={goToLogin}
              tone="dark"
              accessibilityLabel="Back to sign in"
              testID="reset-password-back"
            />
            <Text style={styles.brand}>DEEPCUT SPORTS</Text>
            <View style={styles.topSpacer} />
          </View>

          <View style={styles.content}>
            <View style={styles.intro}>
              <View style={[styles.iconBadge, complete && styles.iconBadgeComplete, invalidLink && styles.iconBadgeInvalid]}>
                <Ionicons
                  name={complete ? "checkmark" : invalidLink ? "link-outline" : "lock-open-outline"}
                  size={34}
                  color={colors.ink}
                />
              </View>
              <Text style={styles.eyebrow}>{complete ? "PASSWORD UPDATED" : invalidLink ? "LINK EXPIRED" : "NEW CREDENTIALS"}</Text>
              <Text style={styles.title}>
                {complete ? "You're back in the game" : invalidLink ? "That reset link is no good" : "Choose a new password"}
              </Text>
              <Text style={styles.description}>
                {complete
                  ? "Your password has been changed and all older sessions were signed out."
                  : invalidLink
                    ? "The link may be expired, already used, or incomplete. Request a fresh one below."
                    : "Use at least 8 characters. Finishing the reset signs the account out everywhere else."}
              </Text>
            </View>

            <Sticker fill={colors.surfaceSecondary} radius={radius.lg} style={styles.cardSticker} contentStyle={styles.card}>
              {complete ? (
                <>
                  <View style={styles.tipRow}>
                    <Ionicons name="shield-checkmark-outline" size={22} color={colors.success} />
                    <Text style={styles.tipText}>The reset link is now burned. It cannot be used a second time.</Text>
                  </View>
                  <StickerButton
                    label="Sign In"
                    icon="log-in-outline"
                    tone="brand"
                    size="lg"
                    fullWidth
                    onPress={goToLogin}
                    testID="reset-password-login"
                  />
                </>
              ) : invalidLink ? (
                <>
                  <StickerButton
                    label="Request New Link"
                    icon="mail-outline"
                    tone="brand"
                    size="lg"
                    fullWidth
                    onPress={requestNewLink}
                    testID="reset-password-new-link"
                  />
                  <StickerButton
                    label="Back to Sign In"
                    icon="arrow-back-outline"
                    tone="dark"
                    fullWidth
                    onPress={goToLogin}
                  />
                </>
              ) : (
                <>
                  <Text style={styles.label}>NEW PASSWORD</Text>
                  <View style={styles.passwordWrap}>
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      placeholder="At least 8 characters"
                      placeholderTextColor={colors.onSurfaceTertiary}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      textContentType="newPassword"
                      style={styles.passwordInput}
                      testID="reset-password-new"
                    />
                    <Pressable
                      onPress={() => setShowPassword((value) => !value)}
                      style={styles.eyeButton}
                      accessibilityLabel={showPassword ? "Hide passwords" : "Show passwords"}
                    >
                      <Ionicons
                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                        size={21}
                        color={colors.onSurfaceSecondary}
                      />
                    </Pressable>
                  </View>

                  <Text style={styles.label}>CONFIRM PASSWORD</Text>
                  <TextInput
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Type it again"
                    placeholderTextColor={colors.onSurfaceTertiary}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    textContentType="newPassword"
                    style={styles.input}
                    onSubmitEditing={() => void submit()}
                    testID="reset-password-confirm"
                  />

                  <StickerButton
                    label="Set New Password"
                    icon="shield-checkmark-outline"
                    tone="brand"
                    size="lg"
                    fullWidth
                    loading={submitting}
                    onPress={() => void submit()}
                    testID="reset-password-submit"
                  />
                </>
              )}
            </Sticker>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.surface },
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: spacing.xl, gap: spacing.xxl },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { color: colors.onSurface, fontFamily: fonts.poster, fontSize: 20, letterSpacing: 1 },
  topSpacer: { width: 46 },
  content: { flex: 1, width: "100%", maxWidth: 560, alignSelf: "center", justifyContent: "center", gap: spacing.xl },
  intro: { alignItems: "center", gap: spacing.sm },
  iconBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 3,
    borderColor: colors.ink,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "-3deg" }],
  },
  iconBadgeComplete: { backgroundColor: colors.success },
  iconBadgeInvalid: { backgroundColor: colors.warning },
  eyebrow: { color: colors.brandPrimary, fontFamily: fonts.bodySemiBold, fontSize: 11, letterSpacing: 1.5 },
  title: { color: colors.onSurface, fontFamily: fonts.poster, fontSize: 38, lineHeight: 42, textAlign: "center" },
  description: {
    color: colors.onSurfaceSecondary,
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    lineHeight: 23,
    textAlign: "center",
    maxWidth: 470,
  },
  cardSticker: { alignSelf: "stretch" },
  card: { padding: spacing.xl, gap: spacing.md },
  label: { color: colors.onSurfaceSecondary, fontFamily: fonts.bodySemiBold, fontSize: 11, letterSpacing: 1.1 },
  input: {
    minHeight: 54,
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
    minHeight: 54,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.ink,
    flexDirection: "row",
    alignItems: "center",
  },
  passwordInput: {
    flex: 1,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    color: colors.onSurface,
    fontFamily: fonts.body,
    fontSize: fontSize.base,
  },
  eyeButton: { width: 52, minHeight: 52, alignItems: "center", justifyContent: "center" },
  tipRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  tipText: { flex: 1, color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: fontSize.sm, lineHeight: 20 },
});
