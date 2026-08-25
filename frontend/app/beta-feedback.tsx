import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { betaApi } from "@/src/api/beta";
import { BETA_VERSION } from "@/src/config/beta";
import { useToast } from "@/src/components/Toast";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme/theme";

type FeedbackType = "bug" | "question" | "idea" | "other";

const TYPES: Array<{ key: FeedbackType; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: "bug", label: "Bug", icon: "bug-outline" },
  { key: "question", label: "Bad Question", icon: "help-circle-outline" },
  { key: "idea", label: "Idea", icon: "bulb-outline" },
  { key: "other", label: "Other", icon: "chatbox-ellipses-outline" },
];

export default function BetaFeedback() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [feedbackType, setFeedbackType] = useState<FeedbackType>("bug");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const userAgent = useMemo(() => {
    if (Platform.OS === "web" && typeof navigator !== "undefined") return navigator.userAgent;
    return `${Platform.OS} app`;
  }, []);

  const submit = async () => {
    const clean = message.trim();
    if (clean.length < 3) {
      toast.show("Tell us what happened or what should change.", "error");
      return;
    }
    setWorking(true);
    try {
      await betaApi.submitFeedback({
        feedback_type: feedbackType,
        message: clean,
        screen: Platform.OS === "web" && typeof window !== "undefined" ? window.location.pathname : "beta-feedback",
        user_agent: userAgent,
      });
      setSubmitted(true);
      setMessage("");
      toast.show("Feedback sent. Thank you.", "success");
    } catch (error: any) {
      toast.show(error?.detail || "Couldn't send feedback.", "error");
    } finally {
      setWorking(false);
    }
  };

  return (
    <View style={styles.container} testID="beta-feedback-screen">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xxl },
        ]}
      >
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>{BETA_VERSION.toUpperCase()}</Text>
            <Text style={styles.title}>SEND FEEDBACK</Text>
          </View>
        </View>

        {submitted ? (
          <View style={styles.successCard}>
            <Ionicons name="checkmark-circle" size={56} color={colors.success} />
            <Text style={styles.successTitle}>RECEIVED</Text>
            <Text style={styles.successText}>Your note is in the DeepCut feedback inbox.</Text>
            <Pressable style={styles.primaryButton} onPress={() => router.replace("/beta")}>
              <Text style={styles.primaryText}>Back to Beta</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => setSubmitted(false)}>
              <Text style={styles.secondaryText}>Send Another</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.label}>WHAT KIND OF NOTE IS THIS?</Text>
              <View style={styles.typeGrid}>
                {TYPES.map((item) => {
                  const active = feedbackType === item.key;
                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => setFeedbackType(item.key)}
                      style={[styles.typeButton, active && styles.typeButtonActive]}
                    >
                      <Ionicons name={item.icon} size={20} color={active ? colors.ink : colors.onSurfaceSecondary} />
                      <Text style={[styles.typeText, active && styles.typeTextActive]}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>WHAT HAPPENED?</Text>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder="Include the sport, question, screen, or exact button when relevant..."
                placeholderTextColor={colors.onSurfaceTertiary}
                multiline
                textAlignVertical="top"
                maxLength={2000}
                style={styles.messageInput}
                testID="beta-feedback-message"
              />
              <Text style={styles.counter}>{message.length}/2000</Text>

              <Pressable
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                onPress={submit}
                disabled={working}
                testID="beta-feedback-submit"
              >
                {working ? (
                  <ActivityIndicator color={colors.ink} />
                ) : (
                  <>
                    <Ionicons name="paper-plane" size={20} color={colors.ink} />
                    <Text style={styles.primaryText}>Send Feedback</Text>
                  </>
                )}
              </Pressable>
            </View>

            <View style={styles.privacyNote}>
              <Ionicons name="shield-checkmark-outline" size={19} color={colors.brandPrimary} />
              <Text style={styles.privacyText}>
                The report includes your DeepCut account, this build version, and basic browser/device information so bugs can be reproduced.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  backButton: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  eyebrow: { color: colors.brandPrimary, fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 1.2 },
  title: { color: colors.onSurface, fontFamily: fonts.poster, fontSize: 34, letterSpacing: 0.8 },
  card: { backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.ink, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  label: { color: colors.onSurfaceTertiary, fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 0.9, marginTop: spacing.xs },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  typeButton: { width: "48%", minHeight: 48, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  typeButtonActive: { backgroundColor: colors.brandPrimary, borderWidth: 2, borderColor: colors.ink },
  typeText: { color: colors.onSurfaceSecondary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.sm },
  typeTextActive: { color: colors.ink },
  messageInput: { minHeight: 190, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, color: colors.onSurface, fontFamily: fonts.body, fontSize: fontSize.base, lineHeight: 22, padding: spacing.md },
  counter: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: 11, textAlign: "right", marginTop: -spacing.sm },
  primaryButton: { minHeight: 54, borderRadius: radius.lg, backgroundColor: colors.brandPrimary, borderWidth: 3, borderColor: colors.ink, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingHorizontal: spacing.lg },
  primaryText: { color: colors.ink, fontFamily: fonts.cartoon, fontSize: 20, letterSpacing: 0.5 },
  pressed: { transform: [{ translateY: 2 }] },
  secondaryButton: { minHeight: 48, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg },
  secondaryText: { color: colors.onSurface, fontFamily: fonts.bodySemiBold, fontSize: fontSize.base },
  privacyNote: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingHorizontal: spacing.sm },
  privacyText: { flex: 1, color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: fontSize.sm, lineHeight: 18 },
  successCard: { backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.ink, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", gap: spacing.md },
  successTitle: { color: colors.onSurface, fontFamily: fonts.poster, fontSize: 38, letterSpacing: 0.8 },
  successText: { color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: fontSize.base, textAlign: "center", marginBottom: spacing.md },
});
