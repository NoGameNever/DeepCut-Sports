import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, fonts, radius, spacing } from "@/src/theme/theme";

type IconName = keyof typeof Ionicons.glyphMap;

const ICONS: Record<string, IconName> = {
  index: "game-controller",
  friends: "people",
  leaderboard: "trophy",
  profile: "person",
};

const ACTIVE_FILLS: Record<string, string> = {
  index: colors.brandPrimary,
  friends: colors.cyan,
  leaderboard: colors.gold,
  profile: colors.purple,
};

export function StickerTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={[styles.dock, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      <View style={styles.shadow}>
        <View style={styles.face}>
          {state.routes.map((route: any, index: number) => {
            const focused = state.index === index;
            const options = descriptors[route.key]?.options || {};
            const label = options.tabBarLabel || options.title || route.name;
            const icon = ICONS[route.name] || "ellipse";
            const activeFill = ACTIVE_FILLS[route.name] || colors.brandPrimary;

            const onPress = () => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
            };

            const onLongPress = () => navigation.emit({ type: "tabLongPress", target: route.key });

            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                onLongPress={onLongPress}
                accessibilityRole="button"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={options.tabBarAccessibilityLabel || String(label)}
                testID={options.tabBarButtonTestID}
                style={({ pressed }) => [
                  styles.item,
                  focused && { backgroundColor: activeFill, borderColor: colors.ink },
                  pressed && styles.itemPressed,
                ]}
              >
                <Ionicons name={icon} size={22} color={focused ? colors.ink : colors.onSurfaceSecondary} />
                <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1}>
                  {String(label).toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  shadow: {
    width: "100%",
    maxWidth: 680,
    backgroundColor: colors.ink,
    borderRadius: radius.lg + 8,
  },
  face: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.xs,
    padding: 6,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: radius.lg + 8,
    transform: [{ translateX: -4 }, { translateY: -4 }],
  },
  item: {
    flex: 1,
    minWidth: 0,
    minHeight: 54,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  itemPressed: { transform: [{ translateY: 2 }] },
  label: {
    color: colors.onSurfaceSecondary,
    fontFamily: fonts.cartoon,
    fontSize: 12,
    letterSpacing: 0.8,
  },
  labelActive: { color: colors.ink },
});
