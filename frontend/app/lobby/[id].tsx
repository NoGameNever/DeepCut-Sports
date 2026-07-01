import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Share, Platform,
} from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn } from "react-native-reanimated";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/components/Toast";
import { UserAvatar } from "@/src/components/UserAvatar";
import { sportName, sportIcon } from "@/src/constants/sports";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme/theme";

export default function LobbyRoom() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const toast = useToast();

  const [lobby, setLobby] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [friends, setFriends] = useState<any[]>([]);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigatedRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const myMember = lobby?.members?.find((m: any) => m.user_id === user?.user_id);
  const isHost = lobby?.is_host;

  const load = useCallback(async () => {
    try {
      const l = await api.getLobby(id);
      setLobby(l);
      setError(null);
      // auto-enter game when host starts (unless I already played)
      const mine = l.members?.find((m: any) => m.user_id === user?.user_id);
      if (l.status === "active" && mine && !mine.finished && !navigatedRef.current) {
        navigatedRef.current = true;
        router.replace(`/quiz?lobbyId=${id}`);
      }
    } catch (e: any) {
      setError(e.detail || "Couldn't load this lobby");
    }
  }, [id, user, router]);

  useFocusEffect(
    useCallback(() => {
      navigatedRef.current = false;
      load();
      api.friends().then(setFriends).catch(() => {});
      pollRef.current = setInterval(load, 3000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }, [load])
  );

  const shareInvite = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const inv = await api.getInvite(id);
      const message = `🏆 Join my StatHead lobby!\n\nThink you know sports? Prove it.\n\nJoin instantly:\n${inv.inviteUrl}`;
      if (Platform.OS === "web") {
        await Clipboard.setStringAsync(inv.inviteUrl);
        toast.show("Invite link copied!", "success");
        return;
      }
      await Share.share({ message });
    } catch (e: any) {
      toast.show(e.detail || "Couldn't open share sheet", "error");
    }
  };

  const copyLink = async () => {
    try {
      const inv = await api.getInvite(id);
      await Clipboard.setStringAsync(inv.inviteUrl);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show("Invite link copied!", "success");
    } catch (e: any) {
      toast.show(e.detail || "Couldn't copy link", "error");
    }
  };

  const inviteFriend = async (uid: string) => {
    try {
      setBusy(true);
      await api.inviteFriend(id, uid);
      toast.show("Invite sent", "success");
      await load();
    } catch (e: any) {
      toast.show(e.detail || "Couldn't invite", "error");
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    setStarting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      await api.startLobby(id);
      navigatedRef.current = true;
      router.replace(`/quiz?lobbyId=${id}`);
    } catch (e: any) {
      toast.show(e.detail || "Couldn't start game", "error");
      setStarting(false);
    }
  };

  const leave = async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    try {
      await api.leaveLobby(id);
    } catch {}
    router.replace("/(tabs)");
  };

  // ----- Error / invalid state -----
  if (error) {
    return (
      <View style={styles.centered} testID="lobby-error">
        <Ionicons name="alert-circle-outline" size={48} color={colors.onSurfaceTertiary} />
        <Text style={styles.centerText}>{error}</Text>
        <Pressable style={styles.primaryBtn} onPress={() => router.replace("/(tabs)")} testID="lobby-error-home">
          <Text style={styles.primaryText}>Back to Home</Text>
        </Pressable>
      </View>
    );
  }
  if (!lobby) {
    return (
      <View style={styles.centered} testID="lobby-loading">
        <ActivityIndicator size="large" color={colors.brandPrimary} />
        <Text style={styles.centerText}>Loading lobby…</Text>
      </View>
    );
  }

  const showStandings = lobby.status === "completed" || (lobby.status === "active" && myMember?.finished);
  const standings = [...(lobby.members || [])].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const slots = Array.from({ length: lobby.max_players });
  const invitedIds = new Set([
    ...lobby.members.map((m: any) => m.user_id),
    ...lobby.pending_friend_invites.map((p: any) => p.user_id),
  ]);

  return (
    <View style={styles.container} testID="lobby-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={leave} style={styles.backBtn} testID="lobby-leave">
          <Ionicons name={isHost ? "close" : "exit-outline"} size={20} color={colors.onSurface} />
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={styles.headerTitle}>{showStandings ? "STANDINGS" : "LOBBY"}</Text>
          <View style={styles.codeRow}>
            <MaterialCommunityIcons name={sportIcon(lobby.sport) as any} size={13} color={colors.brandPrimary} />
            <Text style={styles.codeText}>{sportName(lobby.sport)} · {lobby.code}</Text>
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 160 }} showsVerticalScrollIndicator={false}>
        {showStandings ? (
          <View style={styles.section}>
            {standings.map((m, i) => (
              <View key={m.user_id} style={[styles.standRow, i === 0 && styles.standWinner]} testID={`standing-${i}`}>
                <Text style={[styles.standRank, i === 0 && { color: colors.brandPrimary }]}>{i + 1}</Text>
                <UserAvatar uri={m.picture} name={m.name} size={40} />
                <Text style={styles.rowName} numberOfLines={1}>{m.name}{m.user_id === user?.user_id ? " (You)" : ""}</Text>
                <Text style={styles.standScore}>{m.finished ? m.score : "…"}</Text>
              </View>
            ))}
            <Pressable style={styles.primaryBtn} onPress={() => router.replace("/(tabs)")} testID="standings-home">
              <Text style={styles.primaryText}>Back to Home</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>PLAYERS ({lobby.member_count}/{lobby.max_players})</Text>
            <View style={styles.section}>
              {lobby.members.map((m: any) => (
                <View key={m.user_id} style={styles.playerRow} testID={`lobby-member-${m.user_id}`}>
                  <UserAvatar uri={m.picture} name={m.name} size={44} online={m.online} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>{m.name}{m.user_id === user?.user_id ? " (You)" : ""}</Text>
                    <Text style={styles.rowSub}>{m.role === "host" ? "Host" : "Player"}</Text>
                  </View>
                  {m.role === "host" && <MaterialCommunityIcons name="crown" size={20} color={colors.warning} />}
                </View>
              ))}
              {lobby.pending_friend_invites.map((p: any) => (
                <View key={p.user_id} style={[styles.playerRow, { opacity: 0.7 }]} testID={`lobby-pending-${p.user_id}`}>
                  <UserAvatar uri={p.picture} name={p.name} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>{p.name}</Text>
                    <Text style={styles.rowSub}>Invited · pending</Text>
                  </View>
                  <Ionicons name="hourglass-outline" size={18} color={colors.onSurfaceTertiary} />
                </View>
              ))}
              {slots.slice(lobby.member_count + lobby.pending_friend_invites.length).map((_, i) => (
                <View key={`empty-${i}`} style={[styles.playerRow, styles.emptySlot]}>
                  <Ionicons name="person-add-outline" size={20} color={colors.onSurfaceTertiary} />
                  <Text style={styles.rowSub}>Open slot</Text>
                </View>
              ))}
            </View>

            {isHost && (
              <>
                <Text style={styles.sectionTitle}>INVITE</Text>
                <View style={styles.inviteBtns}>
                  <Pressable style={styles.shareBtn} onPress={shareInvite} testID="invite-share-button">
                    <Ionicons name="share-social" size={18} color={colors.onBrandPrimary} />
                    <Text style={styles.shareText}>Share Invite</Text>
                  </Pressable>
                  <Pressable style={styles.copyBtn} onPress={copyLink} testID="invite-copy-button">
                    <Ionicons name="copy-outline" size={18} color={colors.onSurface} />
                  </Pressable>
                </View>

                <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>INVITE FRIENDS</Text>
                <View style={styles.section}>
                  {friends.length === 0 ? (
                    <Text style={styles.empty}>Add friends in the Friends tab to invite them directly.</Text>
                  ) : (
                    friends.map((f) => {
                      const already = invitedIds.has(f.user_id);
                      const full = lobby.member_count + lobby.pending_friend_invites.length >= lobby.max_players;
                      return (
                        <View key={f.user_id} style={styles.playerRow} testID={`invite-friend-row-${f.user_id}`}>
                          <UserAvatar uri={f.picture} name={f.name} size={40} online={f.online} />
                          <Text style={styles.rowName} numberOfLines={1}>{f.name}</Text>
                          <Pressable
                            testID={`invite-friend-${f.user_id}`}
                            disabled={already || full || busy}
                            style={[styles.addBtn, (already || full) && styles.addBtnDisabled]}
                            onPress={() => inviteFriend(f.user_id)}
                          >
                            <Text style={[styles.addBtnText, (already || full) && { color: colors.onSurfaceTertiary }]}>
                              {already ? "Invited" : "Invite"}
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })
                  )}
                </View>
              </>
            )}

            {!isHost && (
              <Animated.View entering={FadeIn} style={styles.waitCard}>
                <ActivityIndicator color={colors.brandPrimary} />
                <Text style={styles.waitText}>Waiting for the host to start…</Text>
              </Animated.View>
            )}
          </>
        )}
      </ScrollView>

      {!showStandings && isHost && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Pressable
            testID="start-game-button"
            disabled={lobby.member_count < 2 || starting}
            style={[styles.createBtn, lobby.member_count < 2 && styles.createBtnDisabled]}
            onPress={start}
          >
            {starting ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <>
                <Ionicons name="flash" size={20} color={lobby.member_count < 2 ? colors.onSurfaceTertiary : colors.onBrandPrimary} />
                <Text style={[styles.createText, lobby.member_count < 2 && { color: colors.onSurfaceTertiary }]}>
                  {lobby.member_count < 2 ? "Need 2+ players" : "Start Game"}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  centerText: { color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: fontSize.lg, textAlign: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: colors.divider },
  backBtn: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary },
  headerTitle: { color: colors.onSurface, fontFamily: fonts.poster, fontSize: 26, letterSpacing: 0.5 },
  codeRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: 2 },
  codeText: { color: colors.onSurfaceTertiary, fontFamily: fonts.bodyMedium, fontSize: fontSize.sm },
  section: { marginBottom: spacing.lg },
  sectionTitle: { color: colors.onSurfaceSecondary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.sm, letterSpacing: 1, marginBottom: spacing.md },
  playerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  emptySlot: { borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", backgroundColor: "transparent" },
  rowName: { flex: 1, color: colors.onSurface, fontFamily: fonts.bodySemiBold, fontSize: fontSize.lg },
  rowSub: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: fontSize.sm },
  inviteBtns: { flexDirection: "row", gap: spacing.sm },
  shareBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brandPrimary, height: 50, borderRadius: radius.md },
  shareText: { color: colors.onBrandPrimary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.base },
  copyBtn: { width: 50, height: 50, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  addBtn: { backgroundColor: colors.brandPrimary, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.sm },
  addBtnDisabled: { backgroundColor: colors.surfaceTertiary },
  addBtnText: { color: colors.onBrandPrimary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.sm },
  waitCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.md },
  waitText: { color: colors.onSurfaceSecondary, fontFamily: fonts.bodyMedium, fontSize: fontSize.base },
  empty: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: fontSize.base },
  standRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  standWinner: { borderWidth: 1, borderColor: colors.brandPrimary },
  standRank: { color: colors.onSurfaceSecondary, fontFamily: fonts.displayBold, fontSize: fontSize.xl, width: 24, textAlign: "center" },
  standScore: { color: colors.onSurface, fontFamily: fonts.displayBold, fontSize: fontSize.xl },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider },
  createBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brandPrimary, height: 56, borderRadius: radius.md },
  createBtnDisabled: { backgroundColor: colors.surfaceSecondary },
  createText: { color: colors.onBrandPrimary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.lg },
  primaryBtn: { backgroundColor: colors.brandPrimary, height: 52, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginTop: spacing.lg, paddingHorizontal: spacing.xl },
  primaryText: { color: colors.onBrandPrimary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.lg },
});
