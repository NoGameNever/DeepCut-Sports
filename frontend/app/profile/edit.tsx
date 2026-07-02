import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Platform, Linking, KeyboardAvoidingView,
} from "react-native";
import { Image } from "expo-image";
import { useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api/client";
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
        <Pressable onPress={() => router.back()} style={styles.backBtn} testID="edit-cancel-button">
          <Ionicons name="close" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>EDIT PROFILE</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.avatarWrap}>
            <Pressable onPress={pickImage} testID="avatar-picker">
              {avatarPreview ? (
                <Image source={{ uri: avatarPreview }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarText}>{initial}</Text>
                </View>
              )}
              <View style={styles.avatarBadge}>
                <Ionicons name="camera" size={16} color={colors.onBrandPrimary} />
              </View>
            </Pressable>
            <Text style={styles.avatarHint}>Tap to change photo</Text>
            {permBlocked && (
              <Pressable style={styles.settingsBtn} onPress={() => Linking.openSettings()} testID="open-settings-button">
                <Ionicons name="settings-outline" size={16} color={colors.onSurface} />
                <Text style={styles.settingsText}>Enable photo access in Settings</Text>
              </Pressable>
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
            {TAGLINE_SUGGESTIONS.map((s) => (
              <Pressable key={s} style={styles.chip} onPress={() => setTagline(s)} testID={`tagline-chip-${s}`}>
                <Text style={styles.chipText}>{s}</Text>
              </Pressable>
            ))}
          </View>

          {error && (
            <View style={styles.errorBox} testID="edit-error">
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable testID="save-profile-button" style={styles.saveBtn} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.saveText}>Save Changes</Text>}
          </Pressable>
          <Pressable testID="cancel-profile-button" style={styles.cancelBtn} onPress={() => router.back()} disabled={saving}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: colors.divider },
  backBtn: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary },
  headerTitle: { color: colors.onSurface, fontFamily: fonts.poster, fontSize: 26, letterSpacing: 0.5 },
  avatarWrap: { alignItems: "center", marginVertical: spacing.lg },
  avatar: { width: 110, height: 110, borderRadius: 55, backgroundColor: colors.surfaceTertiary, borderWidth: 3, borderColor: colors.brandPrimary },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.brandPrimary, fontFamily: fonts.displayBold, fontSize: 44 },
  avatarBadge: { position: "absolute", bottom: 0, right: 0, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: colors.surface },
  avatarHint: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: fontSize.sm, marginTop: spacing.sm },
  settingsBtn: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.md, backgroundColor: colors.surfaceTertiary, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.sm },
  settingsText: { color: colors.onSurface, fontFamily: fonts.bodyMedium, fontSize: fontSize.sm },
  label: { color: colors.onSurfaceSecondary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.sm, letterSpacing: 1, marginBottom: spacing.sm },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: spacing.xs, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, height: 52 },
  at: { color: colors.onSurfaceTertiary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.lg },
  input: { flex: 1, color: colors.onSurface, fontFamily: fonts.bodyMedium, fontSize: fontSize.lg },
  counter: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: fontSize.sm },
  helper: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: fontSize.sm, marginTop: spacing.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  chip: { backgroundColor: colors.surfaceTertiary, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.pill },
  chipText: { color: colors.onSurfaceSecondary, fontFamily: fonts.bodyMedium, fontSize: fontSize.sm },
  errorBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: "rgba(255,59,48,0.12)", borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg },
  errorText: { flex: 1, color: colors.error, fontFamily: fonts.bodyMedium, fontSize: fontSize.base },
  saveBtn: { backgroundColor: colors.brandPrimary, height: 56, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginTop: spacing.xl },
  saveText: { color: colors.onBrandPrimary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.lg },
  cancelBtn: { height: 48, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
  cancelText: { color: colors.onSurfaceTertiary, fontFamily: fonts.bodyMedium, fontSize: fontSize.base },
});
