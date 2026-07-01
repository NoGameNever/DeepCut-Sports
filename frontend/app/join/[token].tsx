import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { sportName } from "@/src/constants/sports";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme/theme";

const HERO = require("../../assets/images/stathead_hero.png");

export default function JoinLobby() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, loading, signIn, signingIn } = useAuth();

  const [info, setInfo] = useState<any>(null);
  const [status, setStatus] = useState<"validating" | "ready" | "joining" | "error">("validating");
  const [message, setMessage] = useState("");
  const joinedRef = useRef(false);

  const validate = useCallback(async () => {
    setStatus("validating");
    try {
      const res = await api.validateInvite(token);
      if (!res.valid) {
        setStatus("error");
        setMessage(res.message || "This invite is not available.");
        return;
      }
      setInfo(res);
      setStatus("ready");
    } catch {
      setStatus("error");
      setMessage("Connection lost. Check your network and retry.");
    }
  }, [token]);

  useEffect(() => { validate(); }, [validate]);

  const join = useCallback(async () => {
    if (joinedRef.current) return;
    joinedRef.current = true;
    setStatus("joining");
    try {
      const detail = await api.joinByToken(token);
      router.replace(`/lobby/${detail.id}`);
    } catch (e: any) {
      joinedRef.current = false;
      setStatus("error");
      setMessage(e.detail || "Couldn't join this lobby.");
    }
  }, [token, router]);

  // once authenticated and invite valid, auto-join
  useEffect(() => {
    if (!loading && user && status === "ready") join();
  }, [loading, user, status, join]);

  const onSignIn = () => {
    const path = Platform.OS === "web" && typeof window !== "undefined" ? window.location.pathname : undefined;
    signIn(path);
  };

  const renderCenter = () => {
    if (status === "validating") return <Loading label="Validating invite…" />;
    if (status === "joining") return <Loading label="Joining lobby…" />;
    if (status === "error") {
      return (
        <View style={styles.card} testID="join-error">
          <Ionicons name="alert-circle-outline" size={44} color={colors.error} />
          <Text style={styles.cardTitle}>{message}</Text>
          <View style={styles.btnRow}>
            <Pressable style={styles.secondaryBtn} onPress={validate} testID="join-retry">
              <Text style={styles.secondaryText}>Retry</Text>
            </Pressable>
            <Pressable style={styles.primaryBtn} onPress={() => router.replace(user ? "/(tabs)" : "/login")} testID="join-home">
              <Text style={styles.primaryText}>{user ? "Home" : "Sign In"}</Text>
            </Pressable>
          </View>
        </View>
      );
    }
    // ready
    if (!user) {
      return (
        <View style={styles.card} testID="join-signin">
          <Text style={styles.invitedBy}>{info?.host_name} invited you</Text>
          <Text style={styles.cardTitle}>Join the {sportName(info?.sport)} lobby</Text>
          <Text style={styles.sub}>{info?.member_count}/{info?.max_players} players in</Text>
          <Pressable style={styles.primaryBtnWide} onPress={onSignIn} disabled={signingIn} testID="join-signin-button">
            {signingIn ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
              <>
                <Ionicons name="logo-google" size={18} color={colors.onBrandPrimary} />
                <Text style={styles.primaryText}>Sign in & Join</Text>
              </>
            )}
          </Pressable>
        </View>
      );
    }
    return <Loading label="Joining lobby…" />;
  };

  return (
    <View style={styles.container} testID="join-screen">
      <Image source={HERO} style={styles.hero} contentFit="cover" contentPosition="top" />
      <LinearGradient colors={["rgba(11,13,15,0.5)", colors.surface]} locations={[0, 0.7]} style={StyleSheet.absoluteFill} />
      <View style={[styles.content, { paddingBottom: insets.bottom + spacing.xxl, paddingTop: insets.top }]}>
        {renderCenter()}
      </View>
    </View>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <View style={styles.card} testID="join-loading">
      <ActivityIndicator size="large" color={colors.brandPrimary} />
      <Text style={styles.cardTitle}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  hero: { width: "100%", height: "60%" },
  content: { flex: 1, justifyContent: "flex-end", paddingHorizontal: spacing.xl },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", gap: spacing.md },
  invitedBy: { color: colors.brandPrimary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.base, letterSpacing: 0.5 },
  cardTitle: { color: colors.onSurface, fontFamily: fonts.bodySemiBold, fontSize: fontSize.xl, textAlign: "center" },
  sub: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: fontSize.base },
  btnRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  primaryBtn: { backgroundColor: colors.brandPrimary, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl },
  primaryBtnWide: { flexDirection: "row", gap: spacing.sm, backgroundColor: colors.brandPrimary, height: 52, borderRadius: radius.md, alignItems: "center", justifyContent: "center", alignSelf: "stretch", marginTop: spacing.sm },
  primaryText: { color: colors.onBrandPrimary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.lg },
  secondaryBtn: { backgroundColor: colors.surfaceTertiary, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl },
  secondaryText: { color: colors.onSurface, fontFamily: fonts.bodySemiBold, fontSize: fontSize.lg },
});
