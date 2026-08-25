import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { betaApi } from "@/src/api/beta";
import { tokenStore } from "@/src/api/client";
import { BETA_VERSION } from "@/src/config/beta";
import { useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme/theme";

export default function BetaLogin() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user, signIn, refresh } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (user) router.replace("/beta");
  }, [user, router]);

  const submit = async () => {
    const cleanEmail = email.trim();
    const cleanUsername = username.trim();
    const cleanCode = accessCode.trim();

    if (!cleanEmail || !cleanEmail.includes("@")) {
      toast.show("Enter a valid email address.", "error");
      return;
    }
    if (password.length < 8) {
      toast.show("Password must be at least 8 characters.", "error");
      return;
    }
    if (mode === "register" && cleanUsername && cleanUsername.length < 3) {
      toast.show("Username must be at least 3 characters.", "error");
      return;
    }
    if (mode === "register" && !cleanCode) {
      toast.show("Enter the beta access code from your invite.", "error");
      return;
    }

    setWorking(true);
    try {
      if (mode === "login") {
        await signIn(cleanEmail, password);
      } else {
        const result = await betaApi.register({
          email: cleanEmail,
          password,
          username: cleanUsername || undefined,
          access_code: cleanCode,
        });
        await tokenStore.set(result.session_token);
        await refresh();
      }
    } catch (error: any) {
      toast.show(
        error?.detail || (mode === "login" ? "Sign in failed." : "Couldn't create beta account."),
        "error"
      );
    } finally {
      setWorking(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      testID="beta-login-screen"
    >
      <Image
        source={require("../assets/images/deepcut_hero.png")}
        style={styles.hero}
        contentFit="cover"
        contentPosition="top"
      />
      <LinearGradient
        colors={["transparent", "rgba(11,13,15,0.76)", colors.surface]}
        locations={[0, 0.43, 0.7]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xxl },
        ]}
      >
        <View style={styles.heading}>
          <View style={styles.betaBadge}>
            <Ionicons name="flask" size={15} color={colors.ink} />
            <Text style={styles.betaBadgeText}>{BETA_VERSION.toUpperCase()}</Text>
          </View>
          <Text style={styles.wordmark}>DEEPCUT SPORTS</Text>
          <Text style={styles.tagline}>Trivia for the fans who remember the backup.</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.modeRow}>
            <Pressable
              style={[styles.modeButton, mode === "register" && styles.modeButtonActive]}
              onPress={() => setMode("register")}
            >
              <Text style={[styles.modeText, mode === "register" && styles.modeTextActive]}>Create Account</Text>
            </Pressable>
            <Pressable
              style={[styles.modeButton, mode === "login" && styles.modeButtonActive]}
              onPress={() => setMode("login")}
            >
              <Text style={[styles.modeText, mode === "login" && styles.modeTextActive]}>Sign In</Text>
            </Pressable>
          </View>

          {mode === "register" && (
            <>
              <TextInput
                value={username}
                onChangeText={setUsername}
                placeholder="Username (optional)"
                placeholderTextColor={colors.onSurfaceTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
                testID="beta-username"
              />
              <TextInput
                value={accessCode}
                onChangeText={setAccessCode}
                placeholder="Beta access code"
                placeholderTextColor={colors.onSurfaceTertiary}
                autoCapitalize="characters"
                autoCorrect={false}
                style={styles.input}
                testID="beta-access-code"
              />
            </>
          )}

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={colors.onSurfaceTertiary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
            style={styles.input}
            testID="beta-email"
          />

          <View style={styles.passwordWrap}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={colors.onSurfaceTertiary}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              textContentType={mode === "register" ? "newPassword" : "password"}
              style={styles.passwordInput}
              onSubmitEditing={submit}
              testID="beta-password"
            />
            <Pressable onPress={() => setShowPassword((value) => !value)} style={styles.eyeButton}>
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={21}
                color={colors.onSurfaceSecondary}
              />
            </Pressable>
          </View>

          <Pressable
            style={({ pressed }) => [styles.submitButton, pressed && styles.submitPressed]}
            onPress={submit}
            disabled={working}
            testID="beta-auth-submit"
          >
            {working ? (
              <ActivityIndicator color={colors.ink} />
            ) : (
              <>
                <Ionicons
                  name={mode === "register" ? "ticket-outline" : "log-in-outline"}
                  size={21}
                  color={colors.ink}
                />
                <Text style={styles.submitText}>{mode === "register" ? "Enter the Beta" : "Sign In"}</Text>
              </>
            )}
          </Pressable>

          <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={18} color={colors.brandPrimary} />
            <Text style={styles.noticeText}>
              Closed alpha build. Password recovery is not available yet, so use a password you can remember.
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  hero: { ...StyleSheet.absoluteFillObject, height: "62%", width: "100%" },
  scrollContent: { flexGrow: 1, justifyContent: "flex-end", paddingHorizontal: spacing.xl, gap: spacing.xl },
  heading: { alignItems: "center", gap: spacing.sm },
  betaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.gold,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  betaBadgeText: { color: colors.ink, fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 0.8 },
  wordmark: { color: colors.onSurface, fontFamily: fonts.poster, fontSize: 46, letterSpacing: 1, textAlign: "center" },
  tagline: { color: colors.onSurfaceSecondary, fontFamily: fonts.bodyMedium, fontSize: fontSize.base, textAlign: "center" },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, borderWidth: 2, borderColor: colors.ink },
  modeRow: { flexDirection: "row", backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: 4 },
  modeButton: { flex: 1, minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  modeButtonActive: { backgroundColor: colors.surfaceInverse },
  modeText: { color: colors.onSurfaceSecondary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.sm },
  modeTextActive: { color: colors.onSurfaceInverse },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    color: colors.onSurface,
    fontFamily: fonts.body,
    fontSize: fontSize.base,
  },
  passwordWrap: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
  },
  passwordInput: { flex: 1, minHeight: 50, paddingHorizontal: spacing.md, color: colors.onSurface, fontFamily: fonts.body, fontSize: fontSize.base },
  eyeButton: { width: 50, minHeight: 50, alignItems: "center", justifyContent: "center" },
  submitButton: {
    minHeight: 54,
    borderRadius: radius.lg,
    borderWidth: 3,
    borderColor: colors.ink,
    backgroundColor: colors.brandPrimary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  submitPressed: { transform: [{ translateY: 2 }] },
  submitText: { color: colors.ink, fontFamily: fonts.cartoon, fontSize: 21, letterSpacing: 0.6 },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingTop: spacing.xs },
  noticeText: { flex: 1, color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: fontSize.sm, lineHeight: 18 },
});
