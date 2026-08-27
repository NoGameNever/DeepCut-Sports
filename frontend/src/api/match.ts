import { tokenStore } from "@/src/api/client";

const RAW_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_API_URL || "";
const BASE = RAW_BASE.replace(/\/$/, "");

export type ConfiguredQuizStartResponse = {
  session_id: string;
  total: number;
  question_index: number;
  question: {
    id: string;
    question: string;
    options: string[];
    difficulty?: string;
    tags?: string[];
    deep_cut?: boolean;
  };
  timer_seconds: number;
  score_multiplier: number;
  points_per_correct: number;
};

export async function startConfiguredQuiz(payload: {
  sports: string[];
  difficulty: string;
  era: string;
  timer: string;
  count: number;
}): Promise<ConfiguredQuizStartResponse> {
  if (!BASE) throw new Error("Missing EXPO_PUBLIC_BACKEND_URL or EXPO_PUBLIC_API_URL");

  const token = await tokenStore.get();
  const response = await fetch(`${BASE}/api/v2/quiz/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      sport: payload.sports[0],
      sports: payload.sports,
      difficulty: payload.difficulty,
      era: payload.era,
      timer: payload.timer,
      count: payload.count,
    }),
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
