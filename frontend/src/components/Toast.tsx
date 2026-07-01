import React, { createContext, useContext, useCallback, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme/theme";

type ToastType = "success" | "error" | "info";
type ToastCtx = { show: (msg: string, type?: ToastType) => void };

const Ctx = createContext<ToastCtx>({ show: () => {} });
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ msg: string; type: ToastType } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((msg: string, type: ToastType = "info") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ msg, type });
    timer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  const iconName =
    toast?.type === "success" ? "checkmark-circle" : toast?.type === "error" ? "alert-circle" : "information-circle";
  const accent =
    toast?.type === "success" ? colors.success : toast?.type === "error" ? colors.error : colors.brandPrimary;

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {toast && (
        <Animated.View
          entering={FadeInDown}
          exiting={FadeOutUp}
          pointerEvents="none"
          style={[styles.wrap, { top: insets.top + spacing.sm }]}
          testID="toast"
        >
          <View style={[styles.toast, { borderLeftColor: accent }]}>
            <Ionicons name={iconName as any} size={20} color={accent} />
            <Text style={styles.text} numberOfLines={2}>
              {toast.msg}
            </Text>
          </View>
        </Animated.View>
      )}
    </Ctx.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: spacing.lg, right: spacing.lg, zIndex: 9999 },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    borderLeftWidth: 4,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  text: { flex: 1, color: colors.onSurface, fontFamily: fonts.bodyMedium, fontSize: fontSize.base },
});
