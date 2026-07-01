import { useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/components/Toast";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme/theme";

export default function Login() {
  const { user, signIn, signingIn, loading } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  useEffect(() => {
    if (user) router.replace("/(tabs)");
  }, [user, router]);

  const onSignIn = async () => {
    try {
      await signIn();
    } catch {
      toast.show("Sign in failed. Give it another shot.", "error");
    }
  };

  return (
    <View style={styles.container} testID="login-screen">
      <Image
        source={require("../assets/images/stathead_hero.png")}
        style={styles.hero}
        contentFit="cover"
        contentPosition="top"
      />
      <LinearGradient
        colors={["transparent", "rgba(11,13,15,0.6)", colors.surface]}
        locations={[0, 0.62, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
        <Animated.View entering={FadeInUp.duration(500)} style={styles.tagWrap}>
          <View style={styles.dot} />
          <Text style={styles.tagline}>GET YOUR HEAD IN THE GAME</Text>
          <View style={styles.dot} />
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(120).duration(500)}>
          <Pressable
            testID="google-signin-button"
            style={({ pressed }) => [styles.googleBtn, pressed && { opacity: 0.85 }]}
            onPress={onSignIn}
            disabled={signingIn || loading}
          >
            {signingIn ? (
              <ActivityIndicator color={colors.onSurfaceInverse} />
            ) : (
              <>
                <Ionicons name="logo-google" size={20} color={colors.onSurfaceInverse} />
                <Text style={styles.googleText}>Ball Up with Google</Text>
              </>
            )}
          </Pressable>
          <Text style={styles.terms}>Sign in to bank your scores & climb the ranks</Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  hero: { width: "100%", height: "78%" },
  content: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
  },
  tagWrap: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.md },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brandPrimary },
  tagline: {
    color: colors.onSurface,
    fontFamily: fonts.poster,
    fontSize: 22,
    letterSpacing: 1,
    textAlign: "center",
  },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceInverse,
    height: 56,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.brandPrimary,
  },
  googleText: { color: colors.onSurfaceInverse, fontFamily: fonts.bodySemiBold, fontSize: fontSize.lg },
  terms: {
    color: colors.onSurfaceSecondary,
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    textAlign: "center",
    marginTop: spacing.md,
  },
});
