import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiRequest } from "@/lib/api";
import type { SessionUser, UserRole } from "@/types";

interface LoginInput {
  role: Exclude<UserRole, null>;
  login: string;
  password: string;
}

interface AuthContextType {
  role: UserRole;
  username: string;
  token: string;
  user: SessionUser | null;
  isLoading: boolean;
  isAuthenticating: boolean;
  isLoggingOut: boolean;
  login: (input: LoginInput) => Promise<void>;
  resetRequiredPassword: (input: LoginInput & { newPassword: string; confirmPassword: string }) => Promise<void>;
  logout: () => Promise<void>;
}

interface StoredSession {
  token: string;
  user: SessionUser;
}

interface LoginResponse {
  token: string;
  user: SessionUser;
}

interface MeResponse {
  user: SessionUser;
}

interface ResetRequiredPasswordResponse {
  token: string;
  user: SessionUser;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const SESSION_KEY = "cspams.auth.session";

function normalizeRole(role: string): Exclude<UserRole, null> {
  return role === "monitor" ? "monitor" : "school_head";
}

function normalizeUser(user: SessionUser): SessionUser {
  return {
    ...user,
    role: normalizeRole(user.role),
  };
}

function readStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed || typeof parsed.token !== "string" || typeof parsed.user !== "object" || !parsed.user) {
      return null;
    }

    return {
      token: parsed.token,
      user: normalizeUser(parsed.user),
    };
  } catch {
    return null;
  }
}

function writeStoredSession(session: StoredSession | null) {
  if (!session) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(() => readStoredSession());
  const [isLoading, setIsLoading] = useState<boolean>(() => readStoredSession() !== null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const clearSession = useCallback(() => {
    setSession(null);
    writeStoredSession(null);
  }, []);

  useEffect(() => {
    const initialSession = readStoredSession();
    if (!initialSession) {
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;

    const restoreSession = async () => {
      try {
        const payload = await apiRequest<MeResponse>("/api/auth/me", {
          token: initialSession.token,
          signal: controller.signal,
        });

        if (!active) return;

        const normalizedSession: StoredSession = {
          token: initialSession.token,
          user: normalizeUser(payload.user),
        };

        setSession(normalizedSession);
        writeStoredSession(normalizedSession);
      } catch {
        if (!active) return;
        clearSession();
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void restoreSession();

    return () => {
      active = false;
      controller.abort();
    };
  }, [clearSession]);

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key !== SESSION_KEY) return;
      setSession(readStoredSession());
    };

    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const login = useCallback(async ({ role, login: loginValue, password }: LoginInput) => {
    setIsAuthenticating(true);
    try {
      const payload = await apiRequest<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: {
          role,
          login: loginValue,
          password,
        },
      });

      const nextSession: StoredSession = {
        token: payload.token,
        user: normalizeUser(payload.user),
      };

      setSession(nextSession);
      writeStoredSession(nextSession);
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  const resetRequiredPassword = useCallback(
    async ({
      role,
      login: loginValue,
      password,
      newPassword,
      confirmPassword,
    }: LoginInput & { newPassword: string; confirmPassword: string }) => {
      setIsAuthenticating(true);
      try {
        const payload = await apiRequest<ResetRequiredPasswordResponse>("/api/auth/reset-required-password", {
          method: "POST",
          body: {
            role,
            login: loginValue,
            current_password: password,
            new_password: newPassword,
            new_password_confirmation: confirmPassword,
          },
        });

        const nextSession: StoredSession = {
          token: payload.token,
          user: normalizeUser(payload.user),
        };

        setSession(nextSession);
        writeStoredSession(nextSession);
      } finally {
        setIsAuthenticating(false);
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    const tokenToRevoke = session?.token ?? "";
    clearSession();
    setIsLoggingOut(true);

    if (tokenToRevoke === "") {
      setIsLoggingOut(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 3000);

    void apiRequest("/api/auth/logout", {
      method: "POST",
      token: tokenToRevoke,
      signal: controller.signal,
    })
      .catch(() => {
        // Session is already cleared locally; remote revoke can fail safely.
      })
      .finally(() => {
        window.clearTimeout(timeout);
        setIsLoggingOut(false);
      });
  }, [clearSession, session?.token]);

  const value = useMemo<AuthContextType>(
    () => ({
      role: session?.user.role ?? null,
      username: session?.user.name ?? "",
      token: session?.token ?? "",
      user: session?.user ?? null,
      isLoading,
      isAuthenticating,
      isLoggingOut,
      login,
      resetRequiredPassword,
      logout,
    }),
    [session, isLoading, isAuthenticating, isLoggingOut, login, resetRequiredPassword, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
