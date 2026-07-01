import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { colors, fonts } from "@/src/theme/theme";

export function UserAvatar({
  uri,
  name,
  size = 44,
  online,
}: {
  uri?: string | null;
  name?: string | null;
  size?: number;
  online?: boolean;
}) {
  const initial = (name || "P").charAt(0).toUpperCase();
  return (
    <View>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 2 }]}>
          <Text style={[styles.text, { fontSize: size * 0.42 }]}>{initial}</Text>
        </View>
      )}
      {online !== undefined && (
        <View
          style={[
            styles.dot,
            { width: size * 0.28, height: size * 0.28, borderRadius: size * 0.14 },
            { backgroundColor: online ? colors.success : colors.onSurfaceTertiary },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  text: { color: colors.brandPrimary, fontFamily: fonts.displayBold },
  dot: { position: "absolute", right: -1, bottom: -1, borderWidth: 2, borderColor: colors.surface },
});
