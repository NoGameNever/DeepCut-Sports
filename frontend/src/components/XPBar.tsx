import { View, StyleSheet } from "react-native";
import { colors } from "@/src/theme/theme";

export function XPBar({
  progress,
  color = colors.brandPrimary,
  height = 8,
}: {
  progress: number; // 0..1
  color?: string;
  height?: number;
}) {
  const pct = Math.max(0, Math.min(progress, 1)) * 100;
  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color, borderRadius: height / 2 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { backgroundColor: colors.surfaceTertiary, overflow: "hidden", width: "100%" },
  fill: { height: "100%" },
});
