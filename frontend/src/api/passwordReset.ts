const RAW_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_API_URL || "";
const BASE = RAW_BASE.replace(/\/$/, "");

export type PasswordResetRequestResponse = {
  ok: boolean;
  message: string;
};

async function publicPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  if (!BASE) throw new Error("Missing EXPO_PUBLIC_BACKEND_URL or EXPO_PUBLIC_API_URL");

  const response = await fetch(`${BASE}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error: any = new Error(`Request failed: ${response.status}`);
    error.status = response.status;
    try {
      error.detail = (await response.json()).detail;
    } catch {
      // Keep the status-only fallback when the API did not return JSON.
    }
    throw error;
  }

  return response.json();
}

export const passwordResetApi = {
  request: (email: string) =>
    publicPost<PasswordResetRequestResponse>("/auth/password-reset/request", { email: email.trim() }),
  confirm: (token: string, password: string) =>
    publicPost<{ ok: boolean }>("/auth/password-reset/confirm", { token: token.trim(), password }),
};
