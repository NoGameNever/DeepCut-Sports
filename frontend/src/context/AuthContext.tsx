import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { api, tokenStore } from "@/src/api/client";

type User = {
  user_id: string;
  email: string;
  name?: string;
  picture?: string;
  total_score: number;
  matches: number;
  correct_answers: number;
  total_answers: number;
  best_sport?: string | null;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  signingIn: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({} as AuthState);
export const useAuth = () => useContext(AuthContext);

const EMERGENT_AUTH = "https://auth.emergentagent.com/";

function extractSessionId(url: string): string | null {
  const m = url.match(/[#?&]session_id=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);

  const processSessionId = useCallback(async (sessionId: string) => {
    const { session_token, user } = await api.createSession(sessionId);
    await tokenStore.set(session_token);
    setUser(user);
  }, []);

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
        // Web: handle session_id in URL first
        if (Platform.OS === "web" && typeof window !== "undefined") {
          const sid =
            extractSessionId(window.location.hash) ||
            extractSessionId(window.location.search);
          if (sid) {
            await processSessionId(sid);
            window.history.replaceState(null, "", window.location.pathname);
            return;
          }
        }
        const token = await tokenStore.get();
        if (token) await refresh();
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [processSessionId, refresh]);

  const signIn = useCallback(async () => {
    setSigningIn(true);
    try {
      if (Platform.OS === "web" && typeof window !== "undefined") {
        const redirect = window.location.origin + "/";
        window.location.href = `${EMERGENT_AUTH}?redirect=${encodeURIComponent(redirect)}`;
        return;
      }
      const redirect = Linking.createURL("auth");
      const authUrl = `${EMERGENT_AUTH}?redirect=${encodeURIComponent(redirect)}`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirect);
      if (result.type === "success" && result.url) {
        const sid = extractSessionId(result.url);
        if (sid) await processSessionId(sid);
      }
    } finally {
      setSigningIn(false);
    }
  }, [processSessionId]);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {}
    await tokenStore.clear();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, signingIn, signIn, signOut, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}
