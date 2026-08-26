import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, tokenStore } from "@/src/api/client";
import { fetchRolloutAccess } from "@/src/api/access";

type User = {
  user_id: string;
  email: string;
  name?: string;
  username?: string;
  tagline?: string;
  picture?: string;
  total_score: number;
  matches: number;
  correct_answers: number;
  total_answers: number;
  best_sport?: string | null;
  full_app_access?: boolean;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  signingIn: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, username?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({} as AuthState);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);

  const attachRolloutAccess = useCallback(async (baseUser: User): Promise<User> => {
    try {
      const access = await fetchRolloutAccess();
      return { ...baseUser, full_app_access: !!access.full_app_access };
    } catch (error: any) {
      if (error?.status === 401) throw error;
      // Deny the expanded UI by default if the rollout check is temporarily unavailable.
      return { ...baseUser, full_app_access: false };
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const me = await api.me();
      setUser(await attachRolloutAccess(me));
    } catch (e: any) {
      if (e.status === 401) {
        await tokenStore.clear();
        setUser(null);
      }
    }
  }, [attachRolloutAccess]);

  useEffect(() => {
    (async () => {
      try {
        const token = await tokenStore.get();
        if (token) await refresh();
      } catch {
        // A missing/invalid stored session simply returns the app to login.
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    setSigningIn(true);
    try {
      const result = await api.login({ email: email.trim(), password });
      await tokenStore.set(result.session_token);
      setUser(await attachRolloutAccess(result.user));
    } finally {
      setSigningIn(false);
    }
  }, [attachRolloutAccess]);

  const register = useCallback(async (email: string, password: string, username?: string) => {
    setSigningIn(true);
    try {
      const result = await api.register({
        email: email.trim(),
        password,
        username: username?.trim() || undefined,
      });
      await tokenStore.set(result.session_token);
      setUser(await attachRolloutAccess(result.user));
    } finally {
      setSigningIn(false);
    }
  }, [attachRolloutAccess]);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {}
    await tokenStore.clear();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signingIn, signIn, register, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}
