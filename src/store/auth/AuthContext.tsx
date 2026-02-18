import React, { createContext, useContext, useMemo, useState } from "react";
import type { AuthSession, AuthUser } from "./auth.types";
import { clearSession, loadSession, saveSession } from "./auth.storage";
import { validateUser } from "./users.storage";

type AuthContextValue = {
  user: AuthUser | null;
  isAuthed: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function makeToken() {
  // достатньо для локальної демо-сесії
  return crypto.randomUUID();
}

const SESSION_DAYS = 14;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initial = loadSession();
  const [session, setSession] = useState<AuthSession | null>(initial);

  const value = useMemo<AuthContextValue>(() => {
    return {
      user: session?.user ?? null,
      isAuthed: Boolean(session?.token),

      signIn: async (email: string, password: string) => {
        // Перевірка локального "облікового запису" (реєстрація в localStorage)
        const verified = await validateUser(email, password);

        const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;

        const newSession: AuthSession = {
          user: { email: verified.email },
          token: makeToken(),
          expiresAt,
        };

        saveSession(newSession);
        setSession(newSession);
      },

      signOut: () => {
        clearSession();
        setSession(null);
      },
    };
  }, [session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth має використовуватись всередині AuthProvider");
  }
  return ctx;
}
