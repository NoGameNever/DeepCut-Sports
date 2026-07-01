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
  generateQuiz: (sport: string, difficulty: string, count = 7) =>
    request<any[]>("/quiz/generate", {
      method: "POST",
      body: { sport, difficulty, count },
    }),
  submitQuiz: (payload: {
    sport: string;
    difficulty: string;
    score: number;
    correct: number;
    total: number;
  }) => request<any>("/quiz/submit", { method: "POST", body: payload }),
  leaderboard: () => request<any>("/leaderboard"),
};
