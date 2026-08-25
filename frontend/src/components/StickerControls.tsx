import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Sticker } from "@/src/components/Sticker";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme/theme";

type IoniconName = keyof typeof Ionicons.glyphMap;
export type StickerTone =
  | "brand"
  | "gold"
  | "cyan"
  | "purple"
  | "success"
  | "warning"
  | "danger"
  | "dark"
  | "light";

type ControlSize = "sm" | "md" | "lg";

const TONES: Record<StickerTone, { fill: string; text: string }> = {
  brand: { fill: colors.brandPrimary, text: colors.ink },
  gold: { fill: colors.gold, text: colors.ink },
  cyan: { fill: colors.cyan, text: colors.ink },
  purple: { fill: colors.purple, text: colors.ink },
  success: { fill: colors.success, text: colors.ink },
  warning: { fill: colors.warning, text: colors.ink },
  danger: { fill: colors.error, text: colors.ink },
  dark: { fill: colors.surfaceSecondary, text: colors.onSurface },
  light: { fill: colors.surfaceInverse, text: colors.ink },
};

const SIZE_STYLES: Record<ControlSize, ViewStyle> = {
  sm: { minHeight: 40, paddingHorizontal: spacing.md },
  md: { minHeight: 50, paddingHorizontal: spacing.lg },
  lg: { minHeight: 60, paddingHorizontal: spacing.xl },
};

const SIZE_TEXT: Record<ControlSize, TextStyle> = {
  sm: { fontSize: 16 },
  md: { fontSize: 19 },
  lg: { fontSize: 22 },
};

export function StickerButton({
  label,
  onPress,
  icon,
  iconPosition = "left",
  tone = "brand",
  fill,
  textColor,
  size = "md",
  fullWidth = false,
  loading = false,
  disabled = false,
  uppercase = true,
  style,
  contentStyle,
  labelStyle,
  testID,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  icon?: IoniconName;
  iconPosition?: "left" | "right";
  tone?: StickerTone;
  fill?: string;
  textColor?: string;
  size?: ControlSize;
  fullWidth?: boolean;
  loading?: boolean;
  disabled?: boolean;
  uppercase?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const palette = TONES[tone];
  const foreground = textColor || palette.text;
  const displayLabel = uppercase ? label.toUpperCase() : label;
  const iconNode = icon ? <Ionicons name={icon} size={size === "lg" ? 23 : 20} color={foreground} /> : null;

  return (
    <Sticker
      fill={fill || palette.fill}
      onPress={onPress}
      disabled={disabled || loading}
      radius={radius.lg}
      offset={4}
      style={[fullWidth && styles.fullWidth, style]}
      contentStyle={[styles.buttonFace, SIZE_STYLES[size], contentStyle]}
      testID={testID}
      accessibilityLabel={accessibilityLabel || label}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <>
          {iconPosition === "left" ? iconNode : null}
          <Text style={[styles.buttonLabel, SIZE_TEXT[size], { color: foreground }, labelStyle]}>{displayLabel}</Text>
          {iconPosition === "right" ? iconNode : null}
        </>
      )}
    </Sticker>
  );
}

export function StickerIconButton({
  icon,
  onPress,
  tone = "dark",
  fill,
  iconColor,
  size = 46,
  loading = false,
  disabled = false,
  style,
  testID,
  accessibilityLabel,
}: {
  icon: IoniconName;
  onPress: () => void;
  tone?: StickerTone;
  fill?: string;
  iconColor?: string;
  size?: number;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel: string;
}) {
  const palette = TONES[tone];
  const foreground = iconColor || palette.text;

  return (
    <Sticker
      fill={fill || palette.fill}
      onPress={onPress}
      disabled={disabled || loading}
      radius={radius.md}
      offset={3}
      style={style}
      contentStyle={[styles.iconFace, { width: size, height: size }]}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
    >
      {loading ? <ActivityIndicator size="small" color={foreground} /> : <Ionicons name={icon} size={22} color={foreground} />}
    </Sticker>
  );
}

export function StickerChip({
  label,
  selected,
  onPress,
  icon,
  tone = "brand",
  disabled = false,
  style,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: IoniconName;
  tone?: Exclude<StickerTone, "dark" | "light">;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const selectedPalette = TONES[tone];
  const fill = selected ? selectedPalette.fill : colors.surfaceSecondary;
  const foreground = selected ? selectedPalette.text : colors.onSurfaceSecondary;

  return (
    <Sticker
      fill={fill}
      onPress={onPress}
      disabled={disabled}
      radius={radius.pill}
      offset={2}
      style={style}
      contentStyle={styles.chipFace}
      testID={testID}
      accessibilityLabel={label}
    >
      {icon ? <Ionicons name={icon} size={17} color={foreground} /> : null}
      <Text style={[styles.chipLabel, { color: foreground }]}>{label.toUpperCase()}</Text>
    </Sticker>
  );
}

export function StickerMenuCard({
  title,
  description,
  onPress,
  icon,
  iconFill = colors.brandPrimary,
  fill = colors.surfaceSecondary,
  badge,
  badgeFill = colors.gold,
  darkText = false,
  children,
  style,
  testID,
}: {
  title: string;
  description?: string;
  onPress: () => void;
  icon?: IoniconName;
  iconFill?: string;
  fill?: string;
  badge?: string;
  badgeFill?: string;
  darkText?: boolean;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const foreground = darkText ? colors.ink : colors.onSurface;
  const secondary = darkText ? "rgba(0,0,0,0.7)" : colors.onSurfaceSecondary;

  return (
    <Sticker
      fill={fill}
      onPress={onPress}
      radius={radius.lg}
      offset={4}
      style={style}
      contentStyle={styles.menuFace}
      testID={testID}
      accessibilityLabel={title}
    >
      {icon ? (
        <View style={[styles.menuIcon, { backgroundColor: iconFill }]}>
          <Ionicons name={icon} size={22} color={colors.ink} />
        </View>
      ) : null}
      <View style={styles.menuCopy}>
        <View style={styles.menuTitleRow}>
          <Text style={[styles.menuTitle, { color: foreground }]}>{title}</Text>
          {badge ? (
            <View style={[styles.menuBadge, { backgroundColor: badgeFill }]}>
              <Text style={styles.menuBadgeText}>{badge.toUpperCase()}</Text>
            </View>
          ) : null}
        </View>
        {description ? <Text style={[styles.menuDescription, { color: secondary }]}>{description}</Text> : null}
        {children}
      </View>
      <Ionicons name="chevron-forward" size={22} color={foreground} />
    </Sticker>
  );
}

const styles = StyleSheet.create({
  fullWidth: { alignSelf: "stretch" },
  buttonFace: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  buttonLabel: {
    fontFamily: fonts.cartoon,
    letterSpacing: 0.8,
    textAlign: "center",
  },
  iconFace: { alignItems: "center", justifyContent: "center" },
  chipFace: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  chipLabel: { fontFamily: fonts.cartoon, fontSize: 15, letterSpacing: 0.7 },
  menuFace: {
    minHeight: 92,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  menuIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    borderColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  menuCopy: { flex: 1, gap: spacing.xs },
  menuTitleRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  menuTitle: { fontFamily: fonts.cartoon, fontSize: fontSize.xl, letterSpacing: 0.6 },
  menuDescription: { fontFamily: fonts.body, fontSize: fontSize.sm, lineHeight: 18 },
  menuBadge: {
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  menuBadgeText: { color: colors.ink, fontFamily: fonts.bodySemiBold, fontSize: 9, letterSpacing: 0.6 },
});
