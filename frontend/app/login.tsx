import { useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/components/Toast";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme/theme";

const HERO =
  "https://images.pexels.com/photos/30566478/pexels-photo-30566478.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

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
      toast.show("Sign in failed. Please try again.", "error");
    }
  };

  return (
    <View style={styles.container} testID="login-screen">
      <Image source={{ uri: HERO }} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient
        colors={["rgba(15,17,21,0.2)", "rgba(15,17,21,0.75)", colors.surface]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.content, { paddingBottom: insets.bottom + spacing.xxl, paddingTop: insets.top }]}>
        <Animated.View entering={FadeInUp.duration(500)}>
          <View style={styles.badge}>
            <MaterialCommunityIcons name="lightning-bolt" size={18} color={colors.brandPrimary} />
            <Text style={styles.badgeText}>THE ULTIMATE SPORTS QUIZ</Text>
          </View>
          <Text style={styles.title}>TRIVIA{"\n"}BLITZ</Text>
          <Text style={styles.subtitle}>
            Race the clock across 7 sports. Answer fast, climb the global leaderboard.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(150).duration(500)}>
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
                <Text style={styles.googleText}>Continue with Google</Text>
              </>
            )}
          </Pressable>
          <Text style={styles.terms}>Sign in to save your scores & rankings</Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { flex: 1, justifyContent: "flex-end", paddingHorizontal: spacing.xl, gap: spacing.xxl },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  badgeText: {
    color: colors.brandPrimary,
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    letterSpacing: 1.5,
  },
  title: {
    color: colors.onSurface,
    fontFamily: fonts.displayBold,
    fontSize: 76,
    lineHeight: 70,
    letterSpacing: 1,
  },
  subtitle: {
    color: colors.onSurfaceSecondary,
    fontFamily: fonts.body,
    fontSize: fontSize.lg,
    marginTop: spacing.md,
    lineHeight: 24,
  },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceInverse,
    height: 56,
    borderRadius: radius.pill,
  },
  googleText: { color: colors.onSurfaceInverse, fontFamily: fonts.bodySemiBold, fontSize: fontSize.lg },
  terms: {
    color: colors.onSurfaceTertiary,
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    textAlign: "center",
    marginTop: spacing.md,
  },
});
