import { useMemo, useState } from "react";
import {
  Platform,
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
import { Sticker } from "@/src/components/Sticker";
import {
  StickerButton,
  StickerChip,
  StickerIconButton,
} from "@/src/components/StickerControls";
import { BETA_VERSION } from "@/src/config/beta";
import { useToast } from "@/src/components/Toast";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme/theme";

type FeedbackType = "bug" | "question" | "idea" | "other";

const TYPES: Array<{
  key: FeedbackType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: "danger" | "warning" | "gold" | "purple";
}> = [
  { key: "bug", label: "Bug", icon: "bug-outline", tone: "danger" },
  { key: "question", label: "Bad Question", icon: "help-circle-outline", tone: "warning" },
  { key: "idea", label: "Idea", icon: "bulb-outline", tone: "gold" },
  { key: "other", label: "Other", icon: "chatbox-ellipses-outline", tone: "purple" },
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
          <StickerIconButton
            icon="chevron-back"
            tone="dark"
            onPress={() => router.back()}
            accessibilityLabel="Go back"
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>{BETA_VERSION.toUpperCase()}</Text>
            <Text style={styles.title}>SEND FEEDBACK</Text>
          </View>
        </View>

        {submitted ? (
          <Sticker fill={colors.surfaceSecondary} radius={radius.lg} contentStyle={styles.successCard}>
            <Ionicons name="checkmark-circle" size={56} color={colors.success} />
            <Text style={styles.successTitle}>RECEIVED</Text>
            <Text style={styles.successText}>Your note is in the DeepCut feedback inbox.</Text>
            <StickerButton
              label="Back to Beta"
              icon="home"
              tone="success"
              fullWidth
              onPress={() => router.replace("/beta")}
            />
            <StickerButton
              label="Send Another"
              icon="add-circle-outline"
              tone="dark"
              fullWidth
              onPress={() => setSubmitted(false)}
            />
          </Sticker>
        ) : (
          <>
            <Sticker fill={colors.surfaceSecondary} radius={radius.lg} contentStyle={styles.card}>
              <Text style={styles.label}>WHAT KIND OF NOTE IS THIS?</Text>
              <View style={styles.typeGrid}>
                {TYPES.map((item) => (
                  <StickerChip
                    key={item.key}
                    label={item.label}
                    icon={item.icon}
                    tone={item.tone}
                    selected={feedbackType === item.key}
                    onPress={() => setFeedbackType(item.key)}
                    style={styles.typeChip}
                    testID={`beta-feedback-type-${item.key}`}
                  />
                ))}
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

              <StickerButton
                label="Send Feedback"
                icon="paper-plane"
                tone="brand"
                size="lg"
                fullWidth
                loading={working}
                onPress={() => void submit()}
                testID="beta-feedback-submit"
              />
            </Sticker>

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
  eyebrow: { color: colors.brandPrimary, fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 1.2 },
  title: { color: colors.onSurface, fontFamily: fonts.poster, fontSize: 34, letterSpacing: 0.8 },
  card: { padding: spacing.lg, gap: spacing.md },
  label: { color: colors.onSurfaceTertiary, fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 0.9, marginTop: spacing.xs },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  typeChip: { width: "48%", flexGrow: 1 },
  messageInput: { minHeight: 190, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.ink, color: colors.onSurface, fontFamily: fonts.body, fontSize: fontSize.base, lineHeight: 22, padding: spacing.md },
  counter: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: 11, textAlign: "right", marginTop: -spacing.sm },
  privacyNote: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingHorizontal: spacing.sm },
  privacyText: { flex: 1, color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: fontSize.sm, lineHeight: 18 },
  successCard: { padding: spacing.xl, alignItems: "center", gap: spacing.md },
  successTitle: { color: colors.onSurface, fontFamily: fonts.poster, fontSize: 38, letterSpacing: 0.8 },
  successText: { color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: fontSize.base, textAlign: "center", marginBottom: spacing.md },
});
