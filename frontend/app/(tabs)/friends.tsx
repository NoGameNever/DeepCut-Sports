import { useCallback, useRef, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { UserAvatar } from "@/src/components/UserAvatar";
import { sportName } from "@/src/constants/sports";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme/theme";

export default function Friends() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);
  const [friends, setFriends] = useState<any[]>([]);
  const [lobbyInvites, setLobbyInvites] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [r, f, li] = await Promise.all([api.friendRequests(), api.friends(), api.myLobbyInvites()]);
      setRequests(r);
      setFriends(f);
      setLobbyInvites(li);
    } catch {}
    finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  const runSearch = (text: string) => {
    setQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (text.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        setResults(await api.searchUsers(text.trim()));
      } catch {} finally {
        setSearching(false);
      }
    }, 400);
  };

  const doAction = async (fn: () => Promise<any>, msg: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await fn();
      toast.show(msg, "success");
      await loadAll();
      if (query.trim().length >= 2) setResults(await api.searchUsers(query.trim()));
    } catch (e: any) {
      toast.show(e.detail || "Something went wrong", "error");
    }
  };

  const acceptLobby = async (invite_id: string) => {
    try {
      const detail = await api.acceptLobbyInvite(invite_id);
      router.push(`/lobby/${detail.id}`);
    } catch (e: any) {
      toast.show(e.detail || "Couldn't join lobby", "error");
      loadAll();
    }
  };

  const relationCta = (u: any) => {
    switch (u.relation) {
      case "friends":
        return <View style={styles.tag}><Text style={styles.tagText}>Friends</Text></View>;
      case "request_sent":
        return <View style={styles.tag}><Text style={styles.tagText}>Requested</Text></View>;
      case "request_received":
        return (
          <Pressable testID={`accept-search-${u.user_id}`} style={styles.addBtn} onPress={() => doAction(() => api.sendFriendRequest(u.user_id), "Friend added")}>
            <Text style={styles.addBtnText}>Accept</Text>
          </Pressable>
        );
      case "blocked_by_me":
        return <View style={styles.tag}><Text style={styles.tagText}>Blocked</Text></View>;
      case "blocked_me":
        return null;
      default:
        return (
          <Pressable testID={`add-friend-${u.user_id}`} style={styles.addBtn} onPress={() => doAction(() => api.sendFriendRequest(u.user_id), "Request sent")}>
            <Ionicons name="person-add" size={14} color={colors.onBrandPrimary} />
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        );
    }
  };

  return (
    <View style={styles.container} testID="friends-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.title}>SQUAD</Text>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.onSurfaceTertiary} />
          <TextInput
            testID="friend-search-input"
            value={query}
            onChangeText={runSearch}
            placeholder="Search players by name or email"
            placeholderTextColor={colors.onSurfaceTertiary}
            style={styles.searchInput}
            autoCapitalize="none"
          />
          {searching && <ActivityIndicator size="small" color={colors.brandPrimary} />}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAll(); }} tintColor={colors.brandPrimary} />}
      >
        {results.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>SEARCH RESULTS</Text>
            {results.map((u) => (
              <View key={u.user_id} style={styles.row} testID={`search-row-${u.user_id}`}>
                <UserAvatar uri={u.picture} name={u.name} size={44} online={u.online} />
                <Text style={styles.rowName} numberOfLines={1}>{u.name}</Text>
                {relationCta(u)}
              </View>
            ))}
          </View>
        )}

        {lobbyInvites.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>LOBBY INVITES</Text>
            {lobbyInvites.map((inv) => (
              <View key={inv.invite_id} style={styles.inviteCard} testID={`lobby-invite-${inv.invite_id}`}>
                <UserAvatar uri={inv.host_picture} name={inv.host_name} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName} numberOfLines={1}>{inv.host_name}</Text>
                  <Text style={styles.rowSub}>{sportName(inv.sport)} · {inv.member_count}/{inv.max_players}</Text>
                </View>
                <Pressable testID={`accept-lobby-${inv.invite_id}`} style={styles.addBtn} onPress={() => acceptLobby(inv.invite_id)}>
                  <Text style={styles.addBtnText}>Join</Text>
                </Pressable>
                <Pressable testID={`decline-lobby-${inv.invite_id}`} style={styles.iconBtn} onPress={() => doAction(() => api.declineLobbyInvite(inv.invite_id), "Declined")}>
                  <Ionicons name="close" size={18} color={colors.onSurfaceSecondary} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {requests.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>FRIEND REQUESTS</Text>
            {requests.map((u) => (
              <View key={u.friendship_id} style={styles.row} testID={`request-row-${u.friendship_id}`}>
                <UserAvatar uri={u.picture} name={u.name} size={44} online={u.online} />
                <Text style={styles.rowName} numberOfLines={1}>{u.name}</Text>
                <Pressable testID={`accept-request-${u.friendship_id}`} style={styles.addBtn} onPress={() => doAction(() => api.acceptFriend(u.friendship_id), "Friend added")}>
                  <Text style={styles.addBtnText}>Accept</Text>
                </Pressable>
                <Pressable testID={`decline-request-${u.friendship_id}`} style={styles.iconBtn} onPress={() => doAction(() => api.declineFriend(u.friendship_id), "Declined")}>
                  <Ionicons name="close" size={18} color={colors.onSurfaceSecondary} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MY FRIENDS ({friends.length})</Text>
          {friends.length === 0 ? (
            <Text style={styles.empty}>No friends yet. Search above to add your crew.</Text>
          ) : (
            friends.map((u) => (
              <View key={u.user_id} style={styles.row} testID={`friend-row-${u.user_id}`}>
                <UserAvatar uri={u.picture} name={u.name} size={44} online={u.online} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName} numberOfLines={1}>{u.name}</Text>
                  <Text style={styles.rowSub}>{u.tagline || (u.online ? "Online" : "Offline")}</Text>
                </View>
                <Pressable testID={`remove-friend-${u.user_id}`} style={styles.iconBtn} onPress={() => doAction(() => api.removeFriend(u.user_id), "Friend removed")}>
                  <Ionicons name="person-remove-outline" size={18} color={colors.onSurfaceSecondary} />
                </Pressable>
                <Pressable testID={`block-friend-${u.user_id}`} style={styles.iconBtn} onPress={() => doAction(() => api.blockUser(u.user_id), "User blocked")}>
                  <Ionicons name="ban-outline" size={18} color={colors.error} />
                </Pressable>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  title: { color: colors.onSurface, fontFamily: fonts.poster, fontSize: 34, letterSpacing: 0.5, marginBottom: spacing.md },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 46,
  },
  searchInput: { flex: 1, color: colors.onSurface, fontFamily: fonts.body, fontSize: fontSize.base },
  section: { marginBottom: spacing.xl },
  sectionTitle: { color: colors.onSurfaceSecondary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.sm, letterSpacing: 1, marginBottom: spacing.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  inviteCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowName: { flex: 1, color: colors.onSurface, fontFamily: fonts.bodySemiBold, fontSize: fontSize.lg },
  rowSub: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: fontSize.sm },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.brandPrimary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  addBtnText: { color: colors.onBrandPrimary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.sm },
  iconBtn: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  tag: { backgroundColor: colors.surfaceTertiary, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.sm },
  tagText: { color: colors.onSurfaceSecondary, fontFamily: fonts.bodyMedium, fontSize: fontSize.sm },
  empty: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: fontSize.base },
});
