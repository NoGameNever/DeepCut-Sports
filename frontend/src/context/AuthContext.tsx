import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, tokenStore } from "@/src/api/client";
import { activateDeepCutCredentials } from "@/src/api/credentialMigration";
import { registerAccount } from "@/src/api/registrationAccess";

export type User = {
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
  beta_cohort?: string | null;
  credential_provider?: "deepcut_password" | "legacy_migration_pending";
  credential_status?: "active" | "activation_required" | "email_conflict" | "missing_email";
  credential_migration_required?: boolean;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  signingIn: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, username?: string, invite?: string) => Promise<void>;
  migrateCredentials: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({} as AuthState);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const me = await api.me();
      setUser(me);
    } catch (e: any) {
      if (e.status === 401) {
        await tokenStore.clear();
        setUser(null);
      }
    }
  }, []);

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
      setUser(result.user);
    } finally {
      setSigningIn(false);
    }
  }, []);

  const register = useCallback(async (email: string, password: string, username?: string, invite?: string) => {
    setSigningIn(true);
    try {
      const result = await registerAccount({
        email: email.trim(),
        password,
        username: username?.trim() || undefined,
        invite: invite?.trim() || undefined,
      });
      await tokenStore.set(result.session_token);
      setUser(result.user);
    } finally {
      setSigningIn(false);
    }
  }, []);

  const migrateCredentials = useCallback(async (password: string) => {
    const result = await activateDeepCutCredentials(password);
    await tokenStore.set(result.session_token);
    setUser(result.user);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {}
    await tokenStore.clear();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, signingIn, signIn, register, migrateCredentials, signOut, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}
