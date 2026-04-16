import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiRequest, apiRequestVoid, COOKIE_SESSION_TOKEN, isApiError } from "@/lib/api";
import { stopRealtimeBridge } from "@/lib/realtime";
import { clearClientSessionArtifacts } from "@/lib/sessionCleanup";
import type { ActiveSessionDevice, SessionUser, UserRole } from "@/types";

interface LoginInput {
  role: Exclude<UserRole, null>;
  login: string;
  password: string;
}

interface VerifyMonitorMfaInput {
  role: "monitor";
  login: string;
  challengeId: string;
  code: string;
}

interface CompleteAccountSetupInput {
  token: string;
  password: string;
  confirmPassword: string;
}

interface RequestMonitorPasswordResetResponse {
  message?: string;
  delivery?: string;
  deliveryMessage?: string;
}

interface ResetMonitorPasswordInput {
  role?: Exclude<UserRole, null>;
  email: string;
  token: string;
  password: string;
  confirmPassword: string;
}

interface ResetMonitorPasswordResponse {
  message?: string;
}

interface RequestMonitorMfaResetInput {
  login: string;
  password: string;
  reason?: string;
}

interface RequestMonitorMfaResetResponse {
  status: string;
  requestId: number;
  expiresAt: string;
  message?: string;
}

interface CompleteMonitorMfaResetInput {
  login: string;
  password: string;
  requestId: number;
  approvalToken: string;
}

interface CompleteMonitorMfaResetResponse extends BearerTokenAuthPayload {
  user: SessionUser;
  backupCodes?: string[];
  message?: string;
}

interface CompleteMonitorMfaResetResult {
  backupCodes: string[];
  message: string;
}

interface LoginResultAuthenticated {
  status: "authenticated";
  user: SessionUser;
}

interface LoginResultMfaRequired {
  status: "mfa_required";
  challengeId: string;
  expiresAt: string;
  delivery?: string;
  deliveryMessage?: string;
}

type LoginResult = LoginResultAuthenticated | LoginResultMfaRequired;

interface BearerTokenAuthPayload {
  token?: string | null;
  tokenType?: string | null;
  expiresAt?: string | null;
  refreshAfter?: string | null;
}

interface AuthContextType {
  role: UserRole;
  username: string;
  user: SessionUser | null;
  authError: string;
  authErrorCode: number | null;
  accountStatus: string | null;
  isLoading: boolean;
  isAuthenticating: boolean;
  isLoggingOut: boolean;
  clearAuthError: () => void;
  login: (input: LoginInput) => Promise<LoginResult>;
  verifyMfa: (input: VerifyMonitorMfaInput) => Promise<void>;
  requestMonitorPasswordReset: (
    email: string,
    role?: Exclude<UserRole, null>,
  ) => Promise<RequestMonitorPasswordResetResponse>;
  resetMonitorPassword: (input: ResetMonitorPasswordInput) => Promise<ResetMonitorPasswordResponse>;
  requestMonitorMfaReset: (input: RequestMonitorMfaResetInput) => Promise<RequestMonitorMfaResetResponse>;
  completeMonitorMfaReset: (input: CompleteMonitorMfaResetInput) => Promise<CompleteMonitorMfaResetResult>;
  completeAccountSetup: (input: CompleteAccountSetupInput) => Promise<string>;
  resetRequiredPassword: (input: LoginInput & { newPassword: string; confirmPassword: string }) => Promise<void>;
  logout: (options?: { force?: boolean }) => Promise<void>;
  listActiveSessions: () => Promise<ActiveSessionDevice[]>;
  revokeSessionDevice: (sessionId: string) => Promise<void>;
  revokeOtherSessions: () => Promise<{ revokedTokenCount: number; revokedWebSessionCount: number }>;
}

interface AuthenticatedResponse extends BearerTokenAuthPayload {
  user: SessionUser;
}

interface LoginMfaRequiredResponse {
  requiresMfa: true;
  mfa: {
    challengeId: string;
    expiresAt: string;
  };
  delivery?: string;
  deliveryMessage?: string;
  message?: string;
}

type LoginResponse = AuthenticatedResponse | LoginMfaRequiredResponse;

interface MeResponse {
  user: SessionUser;
}

type ResetRequiredPasswordResponse = AuthenticatedResponse;

interface CompleteAccountSetupResponse {
  message?: string;
}

interface ActiveSessionsResponse {
  data: ActiveSessionDevice[];
  meta?: {
    total?: number;
  };
}

interface RevokeOtherSessionsResponse {
  data?: {
    revokedTokenCount?: number;
    revokedWebSessionCount?: number;
  };
}

interface AuthErrorPayload {
  accountStatus?: string;
}

function isMfaRequiredResponse(payload: LoginResponse): payload is LoginMfaRequiredResponse {
  return (
    "requiresMfa" in payload &&
    payload.requiresMfa === true &&
    typeof payload.mfa?.challengeId === "string" &&
    typeof payload.mfa?.expiresAt === "string"
  );
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AUTH_SESSION_KEEPALIVE_MS = 4 * 60 * 1000;

function normalizeRole(role: string): Exclude<UserRole, null> {
  return role === "monitor" ? "monitor" : "school_head";
}

function normalizeUser(user: SessionUser): SessionUser {
  return {
    ...user,
    role: normalizeRole(user.role),
  };
}

function assertCookieSessionAuthResponse(payload: BearerTokenAuthPayload, operationLabel: string): void {
  if (typeof payload.token === "string" && payload.token.trim().length > 0) {
    throw new Error(
      `Backend returned bearer-token auth during ${operationLabel}. This frontend expects Sanctum cookie-session auth. Check VITE_API_BASE_URL, SANCTUM_STATEFUL_DOMAINS, CORS_ALLOWED_ORIGINS, and session cookie settings.`,
    );
  }
}

function finalizeClientLogout(
  setUser: (user: SessionUser | null) => void,
  clearAuthError: () => void,
): void {
  stopRealtimeBridge();
  clearClientSessionArtifacts();
  setUser(null);
  clearAuthError();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authError, setAuthError] = useState("");
  const [authErrorCode, setAuthErrorCode] = useState<number | null>(null);
  const [accountStatus, setAccountStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const keepAliveInFlightRef = useRef(false);

  const clearAuthError = useCallback(() => {
    setAuthError("");
    setAuthErrorCode(null);
    setAccountStatus(null);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const restore = async () => {
      try {
        const payload = await apiRequest<MeResponse>("/api/auth/me", {
          token: COOKIE_SESSION_TOKEN,
          signal: controller.signal,
          timeoutMs: 30_000,
        });

        if (!active) return;
        setUser(normalizeUser(payload.user));
        clearAuthError();
      } catch (err) {
        if (!active) return;
        if (isApiError(err)) {
          if (err.status === 401) {
            setUser(null);
            setAuthError("");
            setAuthErrorCode(401);
            setAccountStatus(null);
          } else if (err.status === 403) {
            setUser(null);
            setAuthError(err.message || "Your account cannot access the system right now.");
            setAuthErrorCode(403);

            const payload = err.payload as AuthErrorPayload | null;
            setAccountStatus(typeof payload?.accountStatus === "string" ? payload.accountStatus : null);
          } else {
            setUser(null);
            setAuthError(err.message || "Unable to restore your session.");
            setAuthErrorCode(err.status);
            setAccountStatus(null);
          }
        } else if (!(err instanceof DOMException && err.name === "AbortError")) {
          setUser(null);
          setAuthError("Unable to restore your session.");
          setAuthErrorCode(null);
          setAccountStatus(null);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void restore();

    return () => {
      active = false;
      controller.abort();
    };
  }, [clearAuthError]);

  const sendSessionKeepAlive = useCallback(async () => {
    if (!user || isLoggingOut || keepAliveInFlightRef.current) {
      return;
    }

    keepAliveInFlightRef.current = true;
    try {
      const payload = await apiRequest<MeResponse>("/api/auth/me", {
        token: COOKIE_SESSION_TOKEN,
        timeoutMs: 15_000,
      });
      setUser(normalizeUser(payload.user));
      clearAuthError();
    } catch (err) {
      if (isApiError(err) && err.status === 401) {
        setAuthError("Your session expired. Please sign in again.");
        setAuthErrorCode(401);
        setAccountStatus(null);
        finalizeClientLogout(setUser, clearAuthError);
      }
    } finally {
      keepAliveInFlightRef.current = false;
    }
  }, [clearAuthError, isLoggingOut, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void sendSessionKeepAlive();
    }, AUTH_SESSION_KEEPALIVE_MS);

    const refreshOnFocus = () => {
      void sendSessionKeepAlive();
    };

    window.addEventListener("focus", refreshOnFocus);
    window.addEventListener("online", refreshOnFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshOnFocus);
      window.removeEventListener("online", refreshOnFocus);
    };
  }, [sendSessionKeepAlive, user]);

  const login = useCallback(async ({ role, login: loginValue, password }: LoginInput): Promise<LoginResult> => {
    setIsAuthenticating(true);
    try {
      const payload = await apiRequest<LoginResponse>("/api/auth/login", {
        method: "POST",
        token: COOKIE_SESSION_TOKEN,
        timeoutMs: 30_000,
        body: {
          role,
          login: loginValue,
          password,
        },
      });

      if (isMfaRequiredResponse(payload)) {
        return {
          status: "mfa_required",
          challengeId: payload.mfa.challengeId,
          expiresAt: payload.mfa.expiresAt,
          delivery: typeof payload.delivery === "string" ? payload.delivery : undefined,
          deliveryMessage:
            typeof payload.deliveryMessage === "string"
              ? payload.deliveryMessage
              : typeof payload.message === "string"
                ? payload.message
                : undefined,
        };
      }

      assertCookieSessionAuthResponse(payload, "login");
      const normalizedUser = normalizeUser(payload.user);
      setUser(normalizedUser);
      clearAuthError();

      return {
        status: "authenticated",
        user: normalizedUser,
      };
    } finally {
      setIsAuthenticating(false);
    }
  }, [clearAuthError]);

  const verifyMfa = useCallback(async ({ role, login: loginValue, challengeId, code }: VerifyMonitorMfaInput) => {
    setIsAuthenticating(true);
    try {
      const payload = await apiRequest<AuthenticatedResponse>("/api/auth/verify-mfa", {
        method: "POST",
        token: COOKIE_SESSION_TOKEN,
        body: {
          role,
          login: loginValue,
          challenge_id: challengeId,
          code,
        },
      });

      assertCookieSessionAuthResponse(payload, "MFA verification");
      setUser(normalizeUser(payload.user));
      clearAuthError();
    } finally {
      setIsAuthenticating(false);
    }
  }, [clearAuthError]);

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
          token: COOKIE_SESSION_TOKEN,
          body: {
            role,
            login: loginValue,
            current_password: password,
            new_password: newPassword,
            new_password_confirmation: confirmPassword,
          },
        });

        assertCookieSessionAuthResponse(payload, "required password reset");
        setUser(normalizeUser(payload.user));
        clearAuthError();
      } finally {
        setIsAuthenticating(false);
      }
    },
    [clearAuthError],
  );

  const requestMonitorPasswordReset = useCallback(async (email: string, role: Exclude<UserRole, null> = "monitor") => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new Error("Email address is required.");
    }

    setIsAuthenticating(true);
    try {
      return await apiRequest<RequestMonitorPasswordResetResponse>("/api/auth/forgot-password", {
        method: "POST",
        token: COOKIE_SESSION_TOKEN,
        body: {
          role,
          email: normalizedEmail,
        },
      });
    } finally {
      setIsAuthenticating(false);
    }
  }, [clearAuthError]);

  const resetMonitorPassword = useCallback(
    async ({ role, email, token, password, confirmPassword }: ResetMonitorPasswordInput) => {
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedToken = token.trim();
      if (!normalizedEmail || !normalizedToken) {
        throw new Error("Reset link is missing required details. Please request a new one.");
      }

      setIsAuthenticating(true);
      try {
        return await apiRequest<ResetMonitorPasswordResponse>("/api/auth/reset-password", {
          method: "POST",
          token: COOKIE_SESSION_TOKEN,
          body: {
            role: role ?? undefined,
            email: normalizedEmail,
            token: normalizedToken,
            password,
            password_confirmation: confirmPassword,
          },
        });
      } finally {
        setIsAuthenticating(false);
      }
    },
    [],
  );

  const requestMonitorMfaReset = useCallback(async ({ login, password, reason }: RequestMonitorMfaResetInput) => {
    const normalizedLogin = login.trim().toLowerCase();
    if (!normalizedLogin) {
      throw new Error("Monitor email is required.");
    }

    setIsAuthenticating(true);
    try {
      return await apiRequest<RequestMonitorMfaResetResponse>("/api/auth/mfa/reset/request", {
        method: "POST",
        token: COOKIE_SESSION_TOKEN,
        body: {
          role: "monitor",
          login: normalizedLogin,
          password,
          reason: reason?.trim() || undefined,
        },
      });
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  const completeMonitorMfaReset = useCallback(
    async ({ login, password, requestId, approvalToken }: CompleteMonitorMfaResetInput) => {
      const normalizedLogin = login.trim().toLowerCase();
      const normalizedToken = approvalToken.trim().toUpperCase();
      if (!normalizedLogin) {
        throw new Error("Monitor email is required.");
      }

      if (!Number.isFinite(requestId) || requestId <= 0) {
        throw new Error("Request ID is invalid. Submit a new MFA reset request.");
      }

      setIsAuthenticating(true);
      try {
        const payload = await apiRequest<CompleteMonitorMfaResetResponse>("/api/auth/mfa/reset/complete", {
          method: "POST",
          token: COOKIE_SESSION_TOKEN,
          body: {
            role: "monitor",
            login: normalizedLogin,
            password,
            request_id: requestId,
            approval_token: normalizedToken,
          },
        });

        assertCookieSessionAuthResponse(payload, "MFA reset completion");
        setUser(normalizeUser(payload.user));
        clearAuthError();

        return {
          backupCodes: Array.isArray(payload.backupCodes) ? payload.backupCodes : [],
          message: payload.message?.trim() || "MFA reset completed. Store your backup codes securely.",
        };
      } finally {
        setIsAuthenticating(false);
      }
    },
    [clearAuthError],
  );

  const completeAccountSetup = useCallback(
    async ({ token, password, confirmPassword }: CompleteAccountSetupInput) => {
      setIsAuthenticating(true);
      try {
        const payload = await apiRequest<CompleteAccountSetupResponse>("/api/auth/setup-account", {
          method: "POST",
          token: COOKIE_SESSION_TOKEN,
          body: {
            token,
            password,
            password_confirmation: confirmPassword,
          },
        });

        clearAuthError();

        return payload.message?.trim() || "Account setup completed. Await Division Monitor approval before sign-in.";
      } finally {
        setIsAuthenticating(false);
      }
    },
    [clearAuthError],
  );

  const logout = useCallback(async (options?: { force?: boolean }) => {
    setIsLoggingOut(true);
    try {
      await apiRequestVoid("/api/auth/logout", {
        method: "POST",
        token: COOKIE_SESSION_TOKEN,
      });
      finalizeClientLogout(setUser, clearAuthError);
    } catch (err) {
      if (isApiError(err) && err.status === 401) {
        finalizeClientLogout(setUser, clearAuthError);
        return;
      }

      if (options?.force) {
        finalizeClientLogout(setUser, clearAuthError);
        return;
      }

      throw err;
    } finally {
      setIsLoggingOut(false);
    }
  }, [clearAuthError]);

  const listActiveSessions = useCallback(async (): Promise<ActiveSessionDevice[]> => {
    if (!user) {
      throw new Error("You are signed out. Please sign in again.");
    }

    const payload = await apiRequest<ActiveSessionsResponse>("/api/auth/sessions", { token: COOKIE_SESSION_TOKEN });

    return Array.isArray(payload.data) ? payload.data : [];
  }, [user]);

  const revokeSessionDevice = useCallback(
    async (sessionId: string): Promise<void> => {
      const normalized = sessionId.trim();
      if (normalized.length === 0) {
        throw new Error("Session identifier is required.");
      }

      if (!user) {
        throw new Error("You are signed out. Please sign in again.");
      }

      await apiRequestVoid(`/api/auth/sessions/${encodeURIComponent(normalized)}`, {
        method: "DELETE",
        token: COOKIE_SESSION_TOKEN,
      });
    },
    [user],
  );

  const revokeOtherSessions = useCallback(async (): Promise<{ revokedTokenCount: number; revokedWebSessionCount: number }> => {
    if (!user) {
      throw new Error("You are signed out. Please sign in again.");
    }

    const payload = await apiRequest<RevokeOtherSessionsResponse>("/api/auth/sessions/revoke-others", {
      method: "POST",
      token: COOKIE_SESSION_TOKEN,
    });

    return {
      revokedTokenCount: Number(payload.data?.revokedTokenCount ?? 0),
      revokedWebSessionCount: Number(payload.data?.revokedWebSessionCount ?? 0),
    };
  }, [user]);

  const value = useMemo<AuthContextType>(
    () => ({
      role: user?.role ?? null,
      username: user?.name ?? "",
      user,
      authError,
      authErrorCode,
      accountStatus,
      isLoading,
      isAuthenticating,
      isLoggingOut,
      clearAuthError,
      login,
      verifyMfa,
      requestMonitorPasswordReset,
      resetMonitorPassword,
      requestMonitorMfaReset,
      completeMonitorMfaReset,
      completeAccountSetup,
      resetRequiredPassword,
      logout,
      listActiveSessions,
      revokeSessionDevice,
      revokeOtherSessions,
    }),
    [
      user,
      authError,
      authErrorCode,
      accountStatus,
      isLoading,
      isAuthenticating,
      isLoggingOut,
      clearAuthError,
      login,
      verifyMfa,
      requestMonitorPasswordReset,
      resetMonitorPassword,
      requestMonitorMfaReset,
      completeMonitorMfaReset,
      completeAccountSetup,
      resetRequiredPassword,
      logout,
      listActiveSessions,
      revokeSessionDevice,
      revokeOtherSessions,
    ],
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
