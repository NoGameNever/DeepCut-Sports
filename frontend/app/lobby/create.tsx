import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme/theme";

const HERO = require("../../assets/images/deepcut_hero.png");

export default function CreateLobby() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [creating, setCreating] = useState(false);

  const create = async () => {
    setCreating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      const lobby = await api.createLobby({});
      router.replace(`/lobby/${lobby.id}`);
    } catch (e: any) {
      toast.show(e.detail || "Couldn't create lobby", "error");
      setCreating(false);
    }
  };

  const perks = [
    { icon: "people", text: "Invite up to 3 friends or share a link" },
    { icon: "options", text: "Fully customize mode, questions & scoring" },
    { icon: "flash", text: "Start when 2+ players are in" },
  ];

  return (
    <View style={styles.container} testID="create-lobby-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <Image source={HERO} style={styles.hero} contentFit="cover" contentPosition="top" />
      <LinearGradient colors={["rgba(10,10,10,0.4)", "rgba(10,10,10,0.85)", colors.surface]} locations={[0, 0.6, 1]} style={StyleSheet.absoluteFill} />
      <Pressable onPress={() => router.back()} style={[styles.backBtn, { top: insets.top + spacing.sm }]} testID="create-lobby-back">
        <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
      </Pressable>

      <View style={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Text style={styles.title}>PRIVATE LOBBY</Text>
        <Text style={styles.subtitle}>Host a match and settle who really knows ball.</Text>
        <View style={styles.perks}>
          {perks.map((p) => (
            <View key={p.icon} style={styles.perkRow}>
              <View style={styles.perkIcon}>
                <Ionicons name={p.icon as any} size={16} color={colors.brandPrimary} />
              </View>
              <Text style={styles.perkText}>{p.text}</Text>
            </View>
          ))}
        </View>
        <Pressable testID="create-lobby-button" style={styles.createBtn} onPress={create} disabled={creating}>
          {creating ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <>
              <Ionicons name="add-circle" size={20} color={colors.onBrandPrimary} />
              <Text style={styles.createText}>Create Lobby</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  hero: { width: "100%", height: "58%" },
  backBtn: { position: "absolute", left: spacing.lg, width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)" },
  content: { flex: 1, justifyContent: "flex-end", paddingHorizontal: spacing.xl, gap: spacing.lg },
  title: { color: colors.onSurface, fontFamily: fonts.poster, fontSize: 44, letterSpacing: 0.5 },
  subtitle: { color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: fontSize.lg, marginTop: -spacing.sm },
  perks: { gap: spacing.md },
  perkRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  perkIcon: { width: 32, height: 32, borderRadius: radius.sm, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  perkText: { flex: 1, color: colors.onSurfaceSecondary, fontFamily: fonts.bodyMedium, fontSize: fontSize.base },
  createBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brandPrimary, height: 56, borderRadius: radius.md, borderWidth: 3, borderColor: colors.ink, marginTop: spacing.sm },
  createText: { color: colors.onBrandPrimary, fontFamily: fonts.cartoon, fontSize: 22, letterSpacing: 1 },
});
