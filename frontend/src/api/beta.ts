import { tokenStore } from "@/src/api/client";
import { BETA_VERSION } from "@/src/config/beta";

const RAW_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_API_URL || "";
const BASE = RAW_BASE.replace(/\/$/, "");

export type BetaRegisterResponse = {
  session_token: string;
  user: any;
};

async function betaRequest<T>(
  path: string,
  options: { method?: string; body?: any; auth?: boolean } = {}
): Promise<T> {
  if (!BASE) throw new Error("Missing EXPO_PUBLIC_BACKEND_URL or EXPO_PUBLIC_API_URL");
  const { method = "GET", body, auth = true } = options;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const token = await tokenStore.get();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const error: any = new Error(`Request failed: ${response.status}`);
    error.status = response.status;
    try {
      error.detail = (await response.json()).detail;
    } catch {}
    throw error;
  }
  return response.json();
}

export const betaApi = {
  register: (payload: { email: string; password: string; username?: string; access_code: string }) =>
    betaRequest<BetaRegisterResponse>("/auth/register", {
      method: "POST",
      auth: false,
      body: payload,
    }),

  submitFeedback: (payload: {
    feedback_type: "bug" | "question" | "idea" | "other";
    message: string;
    screen?: string;
    user_agent?: string;
    question_id?: string;
    quiz_session_id?: string;
  }) =>
    betaRequest<{ submitted: boolean; id: string }>("/beta/feedback", {
      method: "POST",
      body: { ...payload, app_version: BETA_VERSION },
    }),
};
