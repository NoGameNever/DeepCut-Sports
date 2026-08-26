import { tokenStore } from "@/src/api/client";

const RAW_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_API_URL || "";
const BASE = RAW_BASE.replace(/\/$/, "");

export type RolloutAccess = {
  full_app_access: boolean;
};

export async function fetchRolloutAccess(): Promise<RolloutAccess> {
  if (!BASE) throw new Error("Missing EXPO_PUBLIC_BACKEND_URL or EXPO_PUBLIC_API_URL");
  const token = await tokenStore.get();
  if (!token) return { full_app_access: false };

  const response = await fetch(`${BASE}/api/auth/access`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
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
