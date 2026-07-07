import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from "react-native";
import Animated, { ZoomIn, FadeInDown } from "react-native-reanimated";
import { XPBar } from "@/src/components/XPBar";
import { rarityColor, tierColor } from "@/src/constants/progression";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme/theme";

// Shows level-ups, newly unlocked level rewards, achievements and rank tier changes
// after a match. Render with summary=null to hide.
export function ProgressionModal({ summary, onClose }: { summary: any; onClose: () => void }) {
  if (!summary) return null;
  const hasContent =
    summary.leveled_up || summary.tier_changed || (summary.unlocked_achievements?.length ?? 0) > 0;
  if (!hasContent) return null;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Animated.View entering={ZoomIn.duration(300)} style={styles.card} testID="progression-modal">
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ alignItems: "center" }}>
            {summary.leveled_up && (
              <>
                <Text style={styles.kicker}>LEVEL UP!</Text>
                <View style={styles.levelBubble}>
                  <Text style={styles.levelNum} testID="modal-new-level">{summary.level}</Text>
                </View>
                <View style={{ width: "100%", marginTop: spacing.md }}>
                  <XPBar progress={summary.level_progress ?? 0} />
                  <Text style={styles.xpHint}>
                    {summary.xp_to_next_level} XP to Level {summary.level + 1}
                  </Text>
                </View>
              </>
            )}

            {summary.tier_changed && (
              <Animated.View entering={FadeInDown.delay(150)} style={[styles.tierCard, { borderColor: tierColor(summary.tier?.key) }]}>
                <Text style={styles.tierIcon}>{summary.tier?.icon}</Text>
                <Text style={[styles.tierName, { color: tierColor(summary.tier?.key) }]}>{summary.tier?.name}</Text>
                <Text style={styles.tierTagline}>&ldquo;{summary.tier?.tagline}&rdquo;</Text>
              </Animated.View>
            )}

            {(summary.new_rewards?.length ?? 0) > 0 && (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>REWARDS UNLOCKED</Text>
                {summary.new_rewards.map((r: any) => (
                  <View key={r.id} style={styles.rewardRow} testID={`modal-reward-${r.id}`}>
                    <Text style={styles.rewardIcon}>{r.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rewardName}>{r.name}</Text>
                      <Text style={styles.rewardDesc}>{r.description}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {(summary.unlocked_achievements?.length ?? 0) > 0 && (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>ACHIEVEMENT UNLOCKED</Text>
                {summary.unlocked_achievements.map((a: any) => (
                  <View key={a.id} style={[styles.rewardRow, { borderColor: rarityColor(a.rarity), borderWidth: 1 }]} testID={`modal-achievement-${a.id}`}>
                    <Text style={styles.rewardIcon}>{a.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rewardName}>{a.name}</Text>
                      <Text style={styles.rewardDesc}>{a.description}</Text>
                    </View>
                    <Text style={[styles.rewardXp, { color: rarityColor(a.rarity) }]}>+{a.reward_xp} XP</Text>
                  </View>
                ))}
              </View>
            )}

            <Pressable style={styles.btn} onPress={onClose} testID="progression-modal-close">
              <Text style={styles.btnText}>Let&apos;s Go</Text>
            </Pressable>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  card: { width: "100%", maxWidth: 420, maxHeight: "85%", backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 3, borderColor: colors.ink, padding: spacing.xl },
  kicker: { color: colors.brandPrimary, fontFamily: fonts.cartoon, fontSize: 38, letterSpacing: 2, textShadowColor: colors.gold, textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 0 },
  levelBubble: { width: 92, height: 92, borderRadius: 46, borderWidth: 4, borderColor: colors.gold, alignItems: "center", justifyContent: "center", marginTop: spacing.md, backgroundColor: colors.surfaceTertiary },
  levelNum: { color: colors.gold, fontFamily: fonts.displayBold, fontSize: 44 },
  xpHint: { color: colors.onSurfaceTertiary, fontFamily: fonts.bodyMedium, fontSize: fontSize.sm, textAlign: "center", marginTop: spacing.sm },
  tierCard: { alignItems: "center", borderWidth: 1, borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.lg, width: "100%", backgroundColor: colors.surfaceTertiary },
  tierIcon: { fontSize: 34 },
  tierName: { fontFamily: fonts.poster, fontSize: 24, marginTop: spacing.xs },
  tierTagline: { color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: fontSize.sm, fontStyle: "italic", textAlign: "center", marginTop: spacing.xs },
  block: { width: "100%", marginTop: spacing.lg },
  blockTitle: { color: colors.onSurfaceSecondary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.sm, letterSpacing: 1.2, marginBottom: spacing.sm },
  rewardRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  rewardIcon: { fontSize: 26 },
  rewardName: { color: colors.onSurface, fontFamily: fonts.bodySemiBold, fontSize: fontSize.base },
  rewardDesc: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: fontSize.sm },
  rewardXp: { fontFamily: fonts.displayBold, fontSize: fontSize.lg },
  btn: { backgroundColor: colors.brandPrimary, borderRadius: radius.md, height: 50, alignItems: "center", justifyContent: "center", marginTop: spacing.xl, alignSelf: "stretch" },
  btnText: { color: colors.onBrandPrimary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.lg },
});
