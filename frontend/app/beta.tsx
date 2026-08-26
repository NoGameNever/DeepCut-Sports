import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import {
  BETA_DIFFICULTY,
  BETA_ERA,
  BETA_QUESTION_COUNT,
  BETA_TIMER,
  BETA_VERSION,
} from "@/src/config/beta";
import { Sticker } from "@/src/components/Sticker";
import {
  StickerButton,
  StickerIconButton,
  StickerMenuCard,
} from "@/src/components/StickerControls";
import { SPORTS } from "@/src/constants/sports";
import { useAuth } from "@/src/context/AuthContext";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme/theme";

const CARD_FILLS = ["#FF9F1C", "#2EC4B6", "#9B5DE5", "#06D6A0", "#00B8FF", "#EF476F", "#FFD166"];

export default function BetaHome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, refresh, signOut } = useAuth();
  const [selectedSport, setSelectedSport] = useState("basketball");
  const [signingOut, setSigningOut] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  useEffect(() => {
    if (user?.full_app_access) router.replace("/(tabs)");
  }, [user?.full_app_access, router]);

  const startMatch = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    router.push({
      pathname: "/quiz",
      params: {
        sport: selectedSport,
        sports: selectedSport,
        difficulty: BETA_DIFFICULTY,
        timer: BETA_TIMER,
        era: BETA_ERA,
        count: String(BETA_QUESTION_COUNT),
      },
    });
  };

  const logout = async () => {
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/beta-login");
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <View style={styles.container} testID="beta-home-screen">
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>{BETA_VERSION.toUpperCase()}</Text>
            <Text style={styles.title}>DEEPCUT SPORTS</Text>
            <Text style={styles.welcome}>Welcome, {user?.username || user?.name || "Player"}.</Text>
          </View>
          <StickerIconButton
            icon="log-out-outline"
            tone="dark"
            onPress={() => void logout()}
            loading={signingOut}
            accessibilityLabel="Sign out"
          />
        </View>

        <Sticker fill={colors.surfaceSecondary} radius={radius.lg} contentStyle={styles.alphaCard}>
          <View style={styles.alphaIcon}>
            <Ionicons name="flask" size={24} color={colors.ink} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.alphaTitle}>CLOSED ALPHA MODE</Text>
            <Text style={styles.alphaText}>
              Every match is seven questions with mixed difficulty. Scores are checked by the server. Weirdness is useful, so report it.
            </Text>
          </View>
        </Sticker>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>PICK A SPORT</Text>
          <Text style={styles.sectionHint}>7 questions · mixed difficulty</Text>
        </View>

        <View style={styles.sportGrid}>
          {SPORTS.map((sport, index) => {
            const active = selectedSport === sport.key;
            const fill = CARD_FILLS[index % CARD_FILLS.length];
            return (
              <Sticker
                key={sport.key}
                fill={fill}
                onPress={() => {
                  setSelectedSport(sport.key);
                  Haptics.selectionAsync();
                }}
                radius={radius.lg}
                style={styles.sportSticker}
                contentStyle={[styles.sportCard, active && styles.sportCardActive]}
                testID={`beta-sport-${sport.key}`}
                accessibilityLabel={`${sport.name}${active ? ", selected" : ""}`}
              >
                <View style={styles.sportIcon}>
                  <MaterialCommunityIcons name={sport.icon as any} size={26} color={fill} />
                </View>
                <Text style={styles.sportName} numberOfLines={2}>{sport.name}</Text>
                {active && (
                  <View style={styles.selectedBadge}>
                    <Ionicons name="checkmark" size={14} color={colors.ink} />
                  </View>
                )}
              </Sticker>
            );
          })}
        </View>

        <StickerButton
          label="Start 7-Question Match"
          icon="flash"
          tone="brand"
          size="lg"
          fullWidth
          onPress={startMatch}
          testID="beta-start-match"
        />

        <View style={styles.secondaryGrid}>
          <StickerMenuCard
            title="Send Feedback"
            description="Bug, bad question, idea, or general note."
            icon="chatbubble-ellipses"
            iconFill={colors.brandPrimary}
            onPress={() => router.push("/beta-feedback")}
            testID="beta-send-feedback"
          />

          <StickerMenuCard
            title="Play With Friends"
            description="Lobby flow is available for intentional testing, but it is not the stable path yet."
            icon="people"
            iconFill={colors.gold}
            badge="Experimental"
            badgeFill={colors.gold}
            onPress={() => router.push("/lobby/create")}
            testID="beta-experimental-multiplayer"
          />
        </View>

        <Text style={styles.footerNote}>
          Alpha accounts and scores may be reset before launch. Do not reuse a sensitive password.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  eyebrow: { color: colors.brandPrimary, fontFamily: fonts.bodySemiBold, fontSize: 11, letterSpacing: 1.4 },
  title: { color: colors.onSurface, fontFamily: fonts.poster, fontSize: 38, letterSpacing: 0.8 },
  welcome: { color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: fontSize.base, marginTop: 2 },
  alphaCard: { minHeight: 112, flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
  alphaIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.ink },
  alphaTitle: { color: colors.onSurface, fontFamily: fonts.cartoon, fontSize: 20, letterSpacing: 0.7 },
  alphaText: { color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: fontSize.sm, lineHeight: 19, marginTop: spacing.xs },
  sectionHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: spacing.md },
  sectionTitle: { color: colors.onSurface, fontFamily: fonts.poster, fontSize: 28, letterSpacing: 0.7 },
  sectionHint: { color: colors.onSurfaceTertiary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.sm },
  sportGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  sportSticker: { width: "47.5%" },
  sportCard: { minHeight: 126, padding: spacing.md, justifyContent: "space-between" },
  sportCardActive: { borderWidth: 4 },
  sportIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  sportName: { color: colors.ink, fontFamily: fonts.cartoon, fontSize: 20, lineHeight: 21, marginTop: spacing.md },
  selectedBadge: { position: "absolute", top: spacing.sm, right: spacing.sm, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.ink, alignItems: "center", justifyContent: "center" },
  secondaryGrid: { gap: spacing.md },
  footerNote: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: 11, textAlign: "center", lineHeight: 16 },
});
