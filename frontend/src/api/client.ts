import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const TOKEN_KEY = "stb_session_token";

export const tokenStore = {
  get: () => storage.secureGet(TOKEN_KEY, ""),
  set: (t: string) => storage.secureSet(TOKEN_KEY, t),
  clear: () => storage.secureRemove(TOKEN_KEY),
};

async function request<T>(
  path: string,
  options: { method?: string; body?: any; auth?: boolean } = {}
): Promise<T> {
  const { method = "GET", body, auth = true } = options;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const token = await tokenStore.get();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err: any = new Error(`Request failed: ${res.status}`);
    err.status = res.status;
    try {
      err.detail = (await res.json()).detail;
    } catch {}
    throw err;
  }
  return res.json();
}

export const api = {
  createSession: (session_token: string) =>
    request<{ session_token: string; user: any }>("/auth/session", {
      method: "POST",
      body: { session_token },
      auth: false,
    }),
  me: () => request<any>("/auth/me"),
  logout: () => request("/auth/logout", { method: "POST" }),
  generateQuiz: (payload: { sports: string[]; difficulty: string; era?: string; count?: number }) =>
    request<any[]>("/quiz/generate", {
      method: "POST",
      body: {
        sport: payload.sports[0],
        sports: payload.sports,
        difficulty: payload.difficulty,
        era: payload.era ?? "modern",
        count: payload.count ?? 7,
      },
    }),
  submitQuiz: (payload: {
    sport: string;
    difficulty: string;
    score: number;
    correct: number;
    total: number;
    answers?: any[];
  }) => request<any>("/quiz/submit", { method: "POST", body: payload }),
  leaderboard: (board = "global_alltime") => request<any>(`/leaderboard?board=${board}`),
  progression: () => request<any>("/progression"),

  // ----- Profile -----
  getProfile: () => request<any>("/profile"),
  updateProfile: (payload: { username?: string; tagline?: string }) =>
    request<any>("/profile", { method: "PUT", body: payload }),
  uploadAvatar: (image: string, content_type?: string) =>
    request<any>("/profile/avatar", { method: "POST", body: { image, content_type } }),

  // ----- Friends -----
  searchUsers: (q: string) => request<any[]>(`/users/search?q=${encodeURIComponent(q)}`),
  sendFriendRequest: (user_id: string) =>
    request("/friends/request", { method: "POST", body: { user_id } }),
  acceptFriend: (friendship_id: string) =>
    request(`/friends/${friendship_id}/accept`, { method: "POST" }),
  declineFriend: (friendship_id: string) =>
    request(`/friends/${friendship_id}/decline`, { method: "POST" }),
  removeFriend: (user_id: string) =>
    request("/friends/remove", { method: "POST", body: { user_id } }),
  blockUser: (user_id: string) =>
    request("/friends/block", { method: "POST", body: { user_id } }),
  friends: () => request<any[]>("/friends"),
  friendRequests: () => request<any[]>("/friends/requests"),

  // ----- Lobbies -----
  createLobby: (payload: { sport: string; difficulty: string; timer: string; era: string }) =>
    request<any>("/lobbies", { method: "POST", body: payload }),
  getLobby: (id: string) => request<any>(`/lobbies/${id}`),
  getLobbySettings: (id: string) => request<any>(`/lobbies/${id}/settings`),
  updateLobbySettings: (id: string, settings: any) =>
    request<any>(`/lobbies/${id}/settings`, { method: "PUT", body: { settings } }),
  getInvite: (id: string) =>
    request<{ inviteToken: string; inviteUrl: string; expiresAt: string }>(`/lobbies/${id}/invite`, { method: "POST" }),
  inviteFriend: (id: string, user_id: string) =>
    request(`/lobbies/${id}/invite/friend`, { method: "POST", body: { user_id } }),
  validateInvite: (token: string) => request<any>(`/join/${token}`, { auth: false }),
  joinByToken: (token: string) => request<any>("/join", { method: "POST", body: { token } }),
  leaveLobby: (id: string) => request(`/lobbies/${id}/leave`, { method: "POST" }),
  startLobby: (id: string) => request<any>(`/lobbies/${id}/start`, { method: "POST" }),
  lobbyGame: (id: string) => request<any>(`/lobbies/${id}/game`),
  lobbyProgress: (id: string, payload: { score: number; question_index: number }) =>
    request(`/lobbies/${id}/progress`, { method: "POST", body: payload }),
  lobbyLive: (id: string) =>
    request<{ status: string; question_count: number; players: any[] }>(`/lobbies/${id}/live`),
  submitLobbyScore: (id: string, payload: { score: number; correct: number; total: number; answers?: any[] }) =>
    request<any>(`/lobbies/${id}/score`, { method: "POST", body: payload }),
  myLobbyInvites: () => request<any[]>("/lobby-invites"),
  acceptLobbyInvite: (invite_id: string) =>
    request<any>(`/lobby-invites/${invite_id}/accept`, { method: "POST" }),
  declineLobbyInvite: (invite_id: string) =>
    request(`/lobby-invites/${invite_id}/decline`, { method: "POST" }),
};
