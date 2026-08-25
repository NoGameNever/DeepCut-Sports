import { storage } from "@/src/utils/storage";

const RAW_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_API_URL || "";
const BASE = RAW_BASE.replace(/\/$/, "");
const TOKEN_KEY = "stb_session_token";

export type PublicQuizQuestion = {
  id: string;
  question: string;
  options: string[];
  difficulty?: string;
  tags?: string[];
  deep_cut?: boolean;
};

export type QuizStartResponse = {
  session_id: string;
  total: number;
  question_index: number;
  question: PublicQuizQuestion;
};

export type QuizAnswerResponse = {
  correct: boolean;
  correct_index: number;
  score: number;
  correct_count: number;
  question_index: number;
  total: number;
  complete: boolean;
  next_question?: PublicQuizQuestion | null;
  progression?: any;
  user?: any;
};

export type AuthResponse = {
  session_token: string;
  user: any;
};

export type QuestionBankSummary = {
  total: number;
  statuses: Record<string, number>;
  verification: Record<string, number>;
  open_reports: number;
};

export type AdminQuestion = {
  id: string;
  sport: string;
  category?: string;
  subcategory?: string;
  difficulty: string;
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
  explanation?: string;
  source?: string;
  source_url?: string | null;
  era?: string | null;
  league?: string | null;
  season?: string | null;
  teams?: string[];
  players?: string[];
  tags?: string[];
  factual_confidence?: number | null;
  verification_status?: string;
  status: string;
  answer_count?: number;
  correct_count?: number;
  report_count?: number;
  campaign_id?: string | null;
  review_note?: string | null;
};

export type QuestionCampaign = {
  id: string;
  name: string;
  sport: string;
  target_count: number;
  generated_count: number;
  imported_count: number;
  duplicate_count: number;
  rejected_count: number;
  status: string;
  slices: Array<{
    name: string;
    count: number;
    generated_count: number;
    imported_count: number;
    rejected_count: number;
    difficulty: string;
    subcategory?: string | null;
    era?: string | null;
    league?: string | null;
  }>;
};

export const tokenStore = {
  get: () => storage.secureGet(TOKEN_KEY, ""),
  set: (t: string) => storage.secureSet(TOKEN_KEY, t),
  clear: () => storage.secureRemove(TOKEN_KEY),
};

async function request<T>(
  path: string,
  options: { method?: string; body?: any; auth?: boolean } = {}
): Promise<T> {
  if (!BASE) throw new Error("Missing EXPO_PUBLIC_BACKEND_URL or EXPO_PUBLIC_API_URL");
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

function queryString(params: Record<string, string | number | undefined | null>) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (!entries.length) return "";
  return `?${entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join("&")}`;
}

export const api = {
  // First-party DeepCut credentials. The returned bearer token uses the same
  // user_sessions collection as the rest of the existing API.
  register: (payload: { email: string; password: string; username?: string }) =>
    request<AuthResponse>("/auth/register", { method: "POST", body: payload, auth: false }),
  login: (payload: { email: string; password: string }) =>
    request<AuthResponse>("/auth/login", { method: "POST", body: payload, auth: false }),
  setPassword: (password: string) =>
    request<{ ok: boolean }>("/auth/set-password", { method: "POST", body: { password } }),

  // Temporary legacy migration bridge. Do not use this for new sign-ins.
  createSession: (session_token: string) =>
    request<AuthResponse>("/auth/session", {
      method: "POST",
      body: { session_token },
      auth: false,
    }),
  me: () => request<any>("/auth/me"),
  logout: () => request("/auth/logout", { method: "POST" }),

  // Legacy single-player endpoints retained during migration.
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

  // Server-authoritative single-player flow.
  startQuizSession: (payload: { sports: string[]; difficulty: string; era?: string; count?: number }) =>
    request<QuizStartResponse>("/v2/quiz/start", {
      method: "POST",
      body: {
        sport: payload.sports[0],
        sports: payload.sports,
        difficulty: payload.difficulty,
        era: payload.era ?? "modern",
        count: payload.count ?? 7,
      },
    }),
  answerQuizSession: (sessionId: string, selectedIndex: number | null) =>
    request<QuizAnswerResponse>(`/v2/quiz/${encodeURIComponent(sessionId)}/answer`, {
      method: "POST",
      body: { selected_index: selectedIndex },
    }),
  reportQuestion: (questionId: string, payload: { reason: string; details?: string }) =>
    request<{ reported: boolean; already_reported: boolean; report_count?: number }>(
      `/questions/${encodeURIComponent(questionId)}/report`,
      { method: "POST", body: payload }
    ),

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
  createLobby: (payload: Partial<{ sport: string; difficulty: string; timer: string; era: string }> = {}) =>
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
  rematchLobby: (id: string) => request<any>(`/lobbies/${id}/rematch`, { method: "POST" }),
  submitLobbyScore: (id: string, payload: { score: number; correct: number; total: number; answers?: any[] }) =>
    request<any>(`/lobbies/${id}/score`, { method: "POST", body: payload }),
  myLobbyInvites: () => request<any[]>("/lobby-invites"),
  acceptLobbyInvite: (invite_id: string) =>
    request<any>(`/lobby-invites/${invite_id}/accept`, { method: "POST" }),
  declineLobbyInvite: (invite_id: string) =>
    request(`/lobby-invites/${invite_id}/decline`, { method: "POST" }),

  // ----- Question Bank v2 admin -----
  questionBankSummary: () => request<QuestionBankSummary>("/admin/v2/questions/summary"),
  adminQuestions: (params: {
    status?: string;
    sport?: string;
    difficulty?: string;
    verification?: string;
    campaign_id?: string;
    q?: string;
    limit?: number;
    skip?: number;
  } = {}) => request<{ items: AdminQuestion[]; total: number; limit: number; skip: number }>(
    `/admin/v2/questions${queryString(params)}`
  ),
  patchAdminQuestion: (id: string, payload: Partial<AdminQuestion>) =>
    request<AdminQuestion>(`/admin/v2/questions/${encodeURIComponent(id)}`, { method: "PATCH", body: payload }),
  reviewAdminQuestion: (id: string, payload: { status: string; verification_status?: string; review_note?: string }) =>
    request<{ id: string; status: string; verification_status: string }>(
      `/admin/v2/questions/${encodeURIComponent(id)}/review`,
      { method: "POST", body: payload }
    ),
  backfillQuestionMetadata: (dryRun = true) =>
    request<any>("/admin/v2/questions/backfill-metadata", { method: "POST", body: { dry_run: dryRun } }),
  createQuestionCampaign: (payload: {
    name: string;
    sport: string;
    target_count?: number;
    difficulty?: string;
    subcategory?: string;
    era?: string;
    league?: string;
    tags?: string[];
    slices?: Array<{
      name: string;
      count: number;
      difficulty?: string;
      subcategory?: string;
      era?: string;
      league?: string;
      tags?: string[];
    }>;
  }) => request<QuestionCampaign>("/admin/v2/question-campaigns", { method: "POST", body: payload }),
  questionCampaigns: () => request<QuestionCampaign[]>("/admin/v2/question-campaigns"),
  generateQuestionCampaignBatch: (id: string, batchSize = 25) =>
    request<{ campaign: QuestionCampaign; batch: any }>(
      `/admin/v2/question-campaigns/${encodeURIComponent(id)}/generate-next`,
      { method: "POST", body: { batch_size: batchSize } }
    ),
};
