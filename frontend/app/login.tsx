import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInUp } from "react-native-reanimated";
import { BETA_MODE } from "@/src/config/beta";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/components/Toast";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme/theme";

export default function Login() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { user, signIn, register, signingIn, loading } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!user) return;
    const safeReturn = returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : null;
    const destination = safeReturn || (BETA_MODE && !user.full_app_access ? "/beta" : "/(tabs)");
    router.replace(destination as any);
  }, [user, router, returnTo]);

  const onSubmit = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      toast.show("Enter a valid email address.", "error");
      return;
    }
    if (password.length < 8) {
      toast.show("Password must be at least 8 characters.", "error");
      return;
    }
    if (mode === "register" && username.trim() && username.trim().length < 3) {
      toast.show("Username must be at least 3 characters.", "error");
      return;
    }

    try {
      if (mode === "register") await register(cleanEmail, password, username);
      else await signIn(cleanEmail, password);
    } catch (e: any) {
      toast.show(e?.detail || (mode === "register" ? "Couldn't create account." : "Sign in failed."), "error");
    }
  };

  const openPasswordReset = () => {
    router.push({ pathname: "/forgot-password", params: returnTo ? { returnTo } : {} } as any);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      testID="login-screen"
    >
      <Image
        source={require("../assets/images/deepcut_hero.png")}
        style={styles.hero}
        contentFit="cover"
        contentPosition="top"
      />
      <LinearGradient
        colors={["transparent", "rgba(11,13,15,0.72)", colors.surface]}
        locations={[0, 0.48, 0.78]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Animated.View entering={FadeInUp.duration(500)} style={styles.tagWrap}>
          <View style={styles.dot} />
          <Text style={styles.tagline}>TRIVIA FOR THE FANS WHO REMEMBER THE BACKUP</Text>
          <View style={styles.dot} />
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(100).duration(450)} style={styles.card}>
          <View style={styles.modeRow}>
            <Pressable style={[styles.modeBtn, mode === "login" && styles.modeBtnActive]} onPress={() => setMode("login")}>
              <Text style={[styles.modeText, mode === "login" && styles.modeTextActive]}>Sign In</Text>
            </Pressable>
            <Pressable style={[styles.modeBtn, mode === "register" && styles.modeBtnActive]} onPress={() => setMode("register")}>
              <Text style={[styles.modeText, mode === "register" && styles.modeTextActive]}>Create Account</Text>
            </Pressable>
          </View>

          {mode === "register" && (
            <TextInput
              value={username}
              onChangeText={setUsername}
              placeholder="Username (optional)"
              placeholderTextColor={colors.onSurfaceTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
              testID="auth-username"
            />
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
            testID="auth-email"
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
              onSubmitEditing={onSubmit}
              testID="auth-password"
            />
            <Pressable onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}>
              <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.onSurfaceSecondary} />
            </Pressable>
          </View>

          {mode === "login" && (
            <Pressable onPress={openPasswordReset} style={styles.forgotLink} testID="forgot-password-link">
              <Ionicons name="key-outline" size={15} color={colors.brandPrimary} />
              <Text style={styles.forgotText}>Forgot password?</Text>
            </Pressable>
          )}

          <View style={styles.submitShadow}>
            <Pressable
              testID="auth-submit-button"
              style={({ pressed }) => [styles.submitBtn, pressed && styles.submitPressed]}
              onPress={onSubmit}
              disabled={signingIn || loading}
            >
              {signingIn ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <>
                  <Ionicons name={mode === "register" ? "person-add-outline" : "log-in-outline"} size={21} color={colors.onBrandPrimary} />
                  <Text style={styles.submitText}>{mode === "register" ? "Create My Account" : "Ball Up"}</Text>
                </>
              )}
            </Pressable>
          </View>

          <Text style={styles.terms}>
            {mode === "register"
              ? "Create a DeepCut account to bank scores, ranks and achievements."
              : "Sign in to bank your scores and climb the ranks."}
          </Text>
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  hero: { width: "100%", height: "62%" },
  content: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  tagWrap: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.md },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brandPrimary },
  tagline: {
    flexShrink: 1,
    color: colors.onSurface,
    fontFamily: fonts.poster,
    fontSize: 14,
    letterSpacing: 0.5,
    textAlign: "center",
  },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  modeRow: { flexDirection: "row", backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: 4 },
  modeBtn: { flex: 1, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  modeBtnActive: { backgroundColor: colors.surfaceInverse },
  modeText: { color: colors.onSurfaceSecondary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.sm },
  modeTextActive: { color: colors.onSurfaceInverse },
  input: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceTertiary,
    paddingHorizontal: spacing.md,
    color: colors.onSurface,
    fontFamily: fonts.body,
    fontSize: fontSize.base,
  },
  passwordWrap: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceTertiary,
    flexDirection: "row",
    alignItems: "center",
  },
  passwordInput: { flex: 1, height: "100%", paddingHorizontal: spacing.md, color: colors.onSurface, fontFamily: fonts.body, fontSize: fontSize.base },
  eyeBtn: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  forgotLink: { alignSelf: "flex-end", flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingVertical: 2 },
  forgotText: { color: colors.brandPrimary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.sm },
  submitShadow: { backgroundColor: "#000000", borderRadius: radius.lg, marginTop: spacing.xs },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.brandPrimary,
    height: 54,
    borderRadius: radius.lg,
    borderWidth: 3,
    borderColor: "#000000",
    transform: [{ translateX: -3 }, { translateY: -3 }],
  },
  submitPressed: { transform: [{ translateX: 0 }, { translateY: 0 }] },
  submitText: { color: colors.onBrandPrimary, fontFamily: fonts.cartoon, fontSize: 20, letterSpacing: 0.5 },
  terms: { color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: fontSize.sm, textAlign: "center" },
});
