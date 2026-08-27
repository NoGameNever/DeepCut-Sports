import { tokenStore } from "@/src/api/client";

const RAW_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_API_URL || "";
const BASE = RAW_BASE.replace(/\/$/, "");

export type RegistrationMode = "open" | "invite" | "closed";

export type RegistrationInvite = {
  id: string;
  signup_url?: string;
  max_uses: number;
  uses: number;
  created_at?: string;
  expires_at: string;
};

export type RegistrationAdminState = {
  mode: RegistrationMode;
  invites: RegistrationInvite[];
};

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {}
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
    try { error.detail = (await response.json()).detail; } catch {}
    throw error;
  }
  return response.json();
}

export function getRegistrationStatus() {
  return request<{ mode: RegistrationMode }>("/registration/status", { auth: false });
}

export function registerAccount(payload: {
  email: string;
  password: string;
  username?: string;
  invite?: string;
}) {
  return request<{ session_token: string; user: any }>("/auth/register", {
    method: "POST",
    auth: false,
    body: payload,
  });
}

export function getAdminRegistration() {
  return request<RegistrationAdminState>("/admin/registration");
}

export function setRegistrationMode(mode: RegistrationMode) {
  return request<{ mode: RegistrationMode }>("/admin/registration/mode", {
    method: "PUT",
    body: { mode },
  });
}

export function createRegistrationInvite(maxUses: number, expiresHours: number) {
  return request<RegistrationInvite & { token: string; signup_url: string }>("/admin/registration/invites", {
    method: "POST",
    body: { max_uses: maxUses, expires_hours: expiresHours },
  });
}

export function revokeRegistrationInvite(inviteId: string) {
  return request<{ ok: boolean }>(`/admin/registration/invites/${encodeURIComponent(inviteId)}`, {
    method: "DELETE",
  });
}
