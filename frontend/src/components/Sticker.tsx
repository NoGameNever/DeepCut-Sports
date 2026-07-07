import { ReactNode } from "react";
import { View, Pressable, StyleSheet, ViewStyle, StyleProp } from "react-native";
import { colors } from "@/src/theme/theme";

// Cartoon-graffiti "sticker": flat vivid fill, 3px ink outline, hard offset
// shadow (solid ink layer underneath). Pressing pushes the sticker down into
// its shadow like a physical click.
export function Sticker({
  fill,
  children,
  onPress,
  disabled,
  radius = 16,
  offset = 4,
  style,
  contentStyle,
  testID,
}: {
  fill: string;
  children: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  radius?: number;
  offset?: number;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
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
    contentStyle,
  ];
  return (
    <View style={[styles.shadow, { borderRadius: radius }, style]}>
      {onPress ? (
        <Pressable testID={testID} onPress={onPress} disabled={disabled} style={({ pressed }) => face(pressed)}>
          {children}
        </Pressable>
      ) : (
        <View testID={testID} style={face(false)}>{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: { backgroundColor: colors.ink },
  face: { borderWidth: 3, borderColor: colors.ink },
});
