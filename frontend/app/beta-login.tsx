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
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { betaApi } from "@/src/api/beta";
import { tokenStore } from "@/src/api/client";
import { Sticker } from "@/src/components/Sticker";
import { StickerButton, StickerChip } from "@/src/components/StickerControls";
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
    if (user) router.replace(user.full_app_access ? "/(tabs)" : "/beta");
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

        <Sticker fill={colors.surfaceSecondary} radius={radius.lg} style={styles.cardSticker} contentStyle={styles.card}>
          <View style={styles.modeRow}>
            <StickerChip
              label="Create Account"
              selected={mode === "register"}
              onPress={() => setMode("register")}
              tone="brand"
              style={styles.modeChip}
              testID="beta-register-mode"
            />
            <StickerChip
              label="Sign In"
              selected={mode === "login"}
              onPress={() => setMode("login")}
              tone="cyan"
              style={styles.modeChip}
              testID="beta-login-mode"
            />
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
              onSubmitEditing={() => void submit()}
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

          {mode === "login" && (
            <Pressable
              onPress={() => router.push("/forgot-password" as any)}
              style={styles.forgotLink}
              testID="beta-forgot-password-link"
            >
              <Ionicons name="key-outline" size={16} color={colors.brandPrimary} />
              <Text style={styles.forgotText}>Forgot password?</Text>
            </Pressable>
          )}

          <StickerButton
            label={mode === "register" ? "Enter the Beta" : "Sign In"}
            icon={mode === "register" ? "ticket-outline" : "log-in-outline"}
            tone={mode === "register" ? "brand" : "cyan"}
            size="lg"
            fullWidth
            loading={working}
            onPress={() => void submit()}
            testID="beta-auth-submit"
          />

          <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={18} color={colors.brandPrimary} />
            <Text style={styles.noticeText}>
              {mode === "login"
                ? "Reset links are single-use and expire after 30 minutes."
                : "Closed alpha build. Keep your invite access code private."}
            </Text>
          </View>
        </Sticker>
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
  cardSticker: { alignSelf: "stretch" },
  card: { padding: spacing.lg, gap: spacing.md },
  modeRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.xs },
  modeChip: { flex: 1 },
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
  forgotLink: { alignSelf: "flex-end", flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingVertical: 2 },
  forgotText: { color: colors.brandPrimary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.sm },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingTop: spacing.xs },
  noticeText: { flex: 1, color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: fontSize.sm, lineHeight: 18 },
});
