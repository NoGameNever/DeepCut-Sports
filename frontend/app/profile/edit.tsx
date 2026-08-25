import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as Haptics from "expo-haptics";

import { api } from "@/src/api/client";
import {
  StickerButton,
  StickerChip,
  StickerIconButton,
} from "@/src/components/StickerControls";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/components/Toast";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme/theme";

const TAGLINE_SUGGESTIONS = [
  "Knows ball.",
  "Bench trivia menace.",
  "Backup QB historian.",
  "Deep cut specialist.",
];
const TAGLINE_MAX = 40;

export default function EditProfile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refresh } = useAuth();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [username, setUsername] = useState("");
  const [tagline, setTagline] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [newAvatar, setNewAvatar] = useState<string | null>(null);
  const [permBlocked, setPermBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const p = await api.getProfile();
        setUsername(p.username || "");
        setTagline(p.tagline || "");
        setAvatarPreview(p.picture || null);
      } catch {
        toast.show("Couldn't load profile", "error");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickImage = async () => {
    setError(null);
    let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") {
      if (!perm.canAskAgain) {
        setPermBlocked(true);
        return;
      }
      perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") {
        setPermBlocked(!perm.canAskAgain);
        return;
      }
    }
    setPermBlocked(false);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.length) return;
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 256, height: 256 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      const dataUri = `data:image/jpeg;base64,${manipulated.base64}`;
      setNewAvatar(dataUri);
      setAvatarPreview(dataUri);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      toast.show("Couldn't process image", "error");
    }
  };

  const save = async () => {
    setError(null);
    const uname = username.trim();
    if (uname.length < 3 || uname.length > 20 || !/^[a-zA-Z0-9_]+$/.test(uname)) {
      setError("Username must be 3-20 letters, numbers or underscores");
      return;
    }
    setSaving(true);
    try {
      if (newAvatar) {
        await api.uploadAvatar(newAvatar, "image/jpeg");
      }
      await api.updateProfile({ username: uname, tagline: tagline.trim() });
      await refresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show("Profile saved!", "success");
      router.back();
    } catch (e: any) {
      setError(e.detail || "Couldn't save profile");
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered} testID="edit-profile-loading">
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  }

  const initial = (username || "P").charAt(0).toUpperCase();

  return (
    <View style={styles.container} testID="edit-profile-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <StickerIconButton
          icon="close"
          tone="dark"
          onPress={() => router.back()}
          testID="edit-cancel-button"
          accessibilityLabel="Close profile editor"
        />
        <Text style={styles.headerTitle}>EDIT PROFILE</Text>
        <View style={{ width: 46 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.avatarWrap}>
            <Pressable onPress={() => void pickImage()} testID="avatar-picker">
              {avatarPreview ? (
                <Image source={{ uri: avatarPreview }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarText}>{initial}</Text>
                </View>
              )}
              <View style={styles.avatarBadge}>
                <Ionicons name="camera" size={16} color={colors.ink} />
              </View>
            </Pressable>
            <Text style={styles.avatarHint}>Tap to change photo</Text>
            {permBlocked && (
              <StickerButton
                label="Enable Photo Access"
                icon="settings-outline"
                tone="dark"
                size="sm"
                onPress={() => void Linking.openSettings()}
                testID="open-settings-button"
              />
            )}
          </View>

          <Text style={styles.label}>USERNAME</Text>
          <View style={styles.inputWrap}>
            <Text style={styles.at}>@</Text>
            <TextInput
              testID="username-input"
              value={username}
              onChangeText={(t) => setUsername(t.replace(/\s/g, ""))}
              placeholder="username"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={styles.input}
              autoCapitalize="none"
              maxLength={20}
            />
          </View>
          <Text style={styles.helper}>3-20 letters, numbers or underscores</Text>

          <Text style={[styles.label, { marginTop: spacing.lg }]}>TAGLINE</Text>
          <View style={styles.inputWrap}>
            <TextInput
              testID="tagline-input"
              value={tagline}
              onChangeText={(t) => t.length <= TAGLINE_MAX && setTagline(t)}
              placeholder="Add your flair…"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={styles.input}
              maxLength={TAGLINE_MAX}
            />
            <Text style={styles.counter}>{tagline.length}/{TAGLINE_MAX}</Text>
          </View>
          <View style={styles.chips}>
            {TAGLINE_SUGGESTIONS.map((suggestion, index) => (
              <StickerChip
                key={suggestion}
                label={suggestion}
                selected={tagline === suggestion}
                tone={index % 2 === 0 ? "brand" : "cyan"}
                onPress={() => setTagline(suggestion)}
                testID={`tagline-chip-${suggestion}`}
              />
            ))}
          </View>

          {error && (
            <View style={styles.errorBox} testID="edit-error">
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.actionStack}>
            <StickerButton
              label="Save Changes"
              icon="save"
              tone="brand"
              size="lg"
              fullWidth
              loading={saving}
              onPress={() => void save()}
              testID="save-profile-button"
            />
            <StickerButton
              label="Cancel"
              icon="close"
              tone="dark"
              fullWidth
              disabled={saving}
              onPress={() => router.back()}
              testID="cancel-profile-button"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.surfaceSecondary, borderBottomWidth: 3, borderBottomColor: colors.ink },
  headerTitle: { color: colors.onSurface, fontFamily: fonts.poster, fontSize: 26, letterSpacing: 0.5 },
  avatarWrap: { alignItems: "center", marginVertical: spacing.lg, gap: spacing.sm },
  avatar: { width: 110, height: 110, borderRadius: 55, backgroundColor: colors.surfaceTertiary, borderWidth: 3, borderColor: colors.brandPrimary },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.brandPrimary, fontFamily: fonts.displayBold, fontSize: 44 },
  avatarBadge: { position: "absolute", bottom: 0, right: 0, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: colors.ink },
  avatarHint: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: fontSize.sm },
  label: { color: colors.onSurfaceSecondary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.sm, letterSpacing: 1, marginBottom: spacing.sm },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: spacing.xs, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 2, borderColor: colors.ink, paddingHorizontal: spacing.md, height: 52 },
  at: { color: colors.onSurfaceTertiary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.lg },
  input: { flex: 1, color: colors.onSurface, fontFamily: fonts.bodyMedium, fontSize: fontSize.lg },
  counter: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: fontSize.sm },
  helper: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: fontSize.sm, marginTop: spacing.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  errorBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: "rgba(239,71,111,0.16)", borderRadius: radius.md, borderWidth: 2, borderColor: colors.error, padding: spacing.md, marginTop: spacing.lg },
  errorText: { flex: 1, color: colors.error, fontFamily: fonts.bodyMedium, fontSize: fontSize.base },
  actionStack: { gap: spacing.md, marginTop: spacing.xl },
});
