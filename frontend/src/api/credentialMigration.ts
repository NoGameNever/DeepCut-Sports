import { tokenStore } from "@/src/api/client";

const RAW_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_API_URL || "";
const BASE = RAW_BASE.replace(/\/$/, "");

export type CredentialActivationResponse = {
  session_token: string;
  user: any;
};

export async function activateDeepCutCredentials(password: string): Promise<CredentialActivationResponse> {
  if (!BASE) throw new Error("Missing EXPO_PUBLIC_BACKEND_URL or EXPO_PUBLIC_API_URL");
  const token = await tokenStore.get();
  if (!token) {
    const error: any = new Error("Not authenticated");
    error.status = 401;
    error.detail = "Your session expired. Sign in again before migrating credentials.";
    throw error;
  }

  const response = await fetch(`${BASE}/api/auth/credentials/activate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ password }),
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
