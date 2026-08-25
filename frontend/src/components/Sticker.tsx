import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { AccessibilityRole, StyleProp, ViewStyle } from "react-native";

import { colors } from "@/src/theme/theme";

// Cartoon-graffiti "sticker": flat vivid fill, 3px ink outline, hard offset
// shadow (solid ink layer underneath). Pressing pushes the sticker down into
// its shadow like a physical click.
export function Sticker({
  fill,
  children,
  onPress,
  onLongPress,
  disabled,
  radius = 16,
  offset = 4,
  style,
  contentStyle,
  testID,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = "button",
}: {
  fill: string;
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  radius?: number;
  offset?: number;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: AccessibilityRole;
}) {
  const face = (pressed: boolean): StyleProp<ViewStyle> => [
    styles.face,
    {
      backgroundColor: fill,
      borderRadius: radius,
      transform: pressed
        ? [{ translateX: 0 }, { translateY: 0 }]
        : [{ translateX: -offset }, { translateY: -offset }],
    },
    disabled && styles.disabled,
    contentStyle,
  ];

  return (
    <View style={[styles.shadow, { borderRadius: radius }, style]}>
      {onPress ? (
        <Pressable
          testID={testID}
          onPress={onPress}
          onLongPress={onLongPress}
          disabled={disabled}
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={accessibilityHint}
          accessibilityRole={accessibilityRole}
          accessibilityState={{ disabled: !!disabled }}
          style={({ pressed }) => face(pressed)}
        >
          {children}
        </Pressable>
      ) : (
        <View testID={testID} style={face(false)}>
          {children}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: { backgroundColor: colors.ink },
  face: { borderWidth: 3, borderColor: colors.ink },
  disabled: { opacity: 0.5 },
});
