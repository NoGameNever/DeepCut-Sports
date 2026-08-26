import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
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
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme/theme";

export default function ForgotPassword() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const destination = BETA_MODE ? "/beta-login" : "/login";
  const returnPath = Array.isArray(returnTo) ? returnTo[0] : returnTo;

  const goToLogin = () => {
    if (!BETA_MODE && returnPath) {
      router.replace({ pathname: "/login", params: { returnTo: returnPath } } as any);
      return;
    }
    router.replace(destination as any);
  };

  const submit = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      toast.show("Enter a valid email address.", "error");
      return;
    }

    setSubmitting(true);
    try {
      await passwordResetApi.request(cleanEmail);
      setSent(true);
    } catch (error: any) {
      toast.show(error?.detail || "Couldn't send the reset email. Try again.", "error");
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
          testID="forgot-password-screen"
        >
          <View style={styles.topBar}>
            <StickerIconButton
              icon="arrow-back"
              onPress={goToLogin}
              tone="dark"
              accessibilityLabel="Back to sign in"
              testID="forgot-password-back"
            />
            <Text style={styles.brand}>DEEPCUT SPORTS</Text>
            <View style={styles.topSpacer} />
          </View>

          <View style={styles.content}>
            <View style={styles.intro}>
              <View style={styles.iconBadge}>
                <Ionicons name={sent ? "mail-open-outline" : "key-outline"} size={32} color={colors.ink} />
              </View>
              <Text style={styles.eyebrow}>{sent ? "CHECK THE TAPE" : "ACCOUNT RECOVERY"}</Text>
              <Text style={styles.title}>{sent ? "Check your inbox" : "Forgot your password?"}</Text>
              <Text style={styles.description}>
                {sent
                  ? "If that email is tied to a DeepCut account, a single-use reset link is heading there now."
                  : "Enter the email on your account. We'll send a single-use link that expires in 30 minutes."}
              </Text>
            </View>

            <Sticker fill={colors.surfaceSecondary} radius={radius.lg} style={styles.cardSticker} contentStyle={styles.card}>
              {sent ? (
                <>
                  <View style={styles.tipRow}>
                    <Ionicons name="shield-checkmark-outline" size={21} color={colors.brandPrimary} />
                    <Text style={styles.tipText}>For security, the message is the same whether or not an account exists.</Text>
                  </View>
                  <View style={styles.tipRow}>
                    <Ionicons name="folder-open-outline" size={21} color={colors.cyan} />
                    <Text style={styles.tipText}>Give the spam or junk folder a look if it does not arrive.</Text>
                  </View>
                  <StickerButton
                    label="Back to Sign In"
                    icon="log-in-outline"
                    tone="brand"
                    size="lg"
                    fullWidth
                    onPress={goToLogin}
                    testID="forgot-password-login"
                  />
                  <StickerButton
                    label="Try Another Email"
                    icon="create-outline"
                    tone="dark"
                    fullWidth
                    onPress={() => setSent(false)}
                    testID="forgot-password-send-again"
                  />
                </>
              ) : (
                <>
                  <Text style={styles.label}>ACCOUNT EMAIL</Text>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    placeholderTextColor={colors.onSurfaceTertiary}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="emailAddress"
                    autoComplete="email"
                    style={styles.input}
                    onSubmitEditing={() => void submit()}
                    testID="forgot-password-email"
                  />
                  <StickerButton
                    label="Email Reset Link"
                    icon="paper-plane-outline"
                    tone="brand"
                    size="lg"
                    fullWidth
                    loading={submitting}
                    onPress={() => void submit()}
                    testID="forgot-password-submit"
                  />
                  <Text style={styles.footnote}>Requesting a new link invalidates any older reset link for the account.</Text>
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
  card: { padding: spacing.xl, gap: spacing.lg },
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
  tipRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  tipText: { flex: 1, color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: fontSize.sm, lineHeight: 20 },
  footnote: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: fontSize.sm, lineHeight: 18, textAlign: "center" },
});
