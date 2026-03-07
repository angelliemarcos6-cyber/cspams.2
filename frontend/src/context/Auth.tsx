import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { UserRole } from "@/types";

interface AuthSession {
  role: Exclude<UserRole, null>;
  username: string;
}

interface StoredAdminCredentials {
  username: string;
  salt: string;
  passwordHash: string;
  iterations: number;
}

interface UpdateAdminCredentialsInput {
  currentPassword: string;
  nextUsername?: string;
  nextPassword?: string;
}

interface AuthContextType {
  role: UserRole;
  username: string;
  hasAdminAccount: boolean;
  login: (role: Exclude<UserRole, null>, username: string) => void;
  logout: () => void;
  registerAdmin: (username: string, password: string) => Promise<void>;
  authenticateAdmin: (username: string, password: string) => Promise<boolean>;
  updateAdminCredentials: (input: UpdateAdminCredentialsInput) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_KEY = "cspams.auth.session";
const ADMIN_CREDENTIALS_KEY = "cspams.auth.school-admin.credentials";
const HASH_ITERATIONS = 120_000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function hashPassword(password: string, salt: string, iterations: number): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: encoder.encode(salt),
      iterations,
    },
    keyMaterial,
    256,
  );
  return bytesToBase64(new Uint8Array(hashBuffer));
}

function readAdminCredentials(): StoredAdminCredentials | null {
  try {
    const raw = localStorage.getItem(ADMIN_CREDENTIALS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAdminCredentials;
    if (
      typeof parsed.username !== "string" ||
      typeof parsed.salt !== "string" ||
      typeof parsed.passwordHash !== "string" ||
      typeof parsed.iterations !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeSession(session: AuthSession | null) {
  if (!session) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function readSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if ((parsed.role !== "school_admin" && parsed.role !== "monitor") || typeof parsed.username !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const initialSession = readSession();
  const [role, setRole] = useState<UserRole>(initialSession?.role ?? null);
  const [username, setUsername] = useState<string>(initialSession?.username ?? "");
  const [hasAdminAccount, setHasAdminAccount] = useState<boolean>(() => readAdminCredentials() !== null);

  const login = (nextRole: Exclude<UserRole, null>, nextUsername: string) => {
    setRole(nextRole);
    setUsername(nextUsername);
    writeSession({ role: nextRole, username: nextUsername });
  };

  const logout = () => {
    setRole(null);
    setUsername("");
    writeSession(null);
  };

  const registerAdmin = async (inputUsername: string, password: string) => {
    const normalizedUsername = inputUsername.trim();
    const salt = crypto.randomUUID();
    const passwordHash = await hashPassword(password, salt, HASH_ITERATIONS);

    const payload: StoredAdminCredentials = {
      username: normalizedUsername,
      salt,
      passwordHash,
      iterations: HASH_ITERATIONS,
    };

    localStorage.setItem(ADMIN_CREDENTIALS_KEY, JSON.stringify(payload));
    setHasAdminAccount(true);
  };

  const authenticateAdmin = async (inputUsername: string, password: string): Promise<boolean> => {
    const stored = readAdminCredentials();
    if (!stored) return false;
    if (stored.username !== inputUsername.trim()) return false;

    const computed = await hashPassword(password, stored.salt, stored.iterations);
    return computed === stored.passwordHash;
  };

  const updateAdminCredentials = async ({ currentPassword, nextUsername, nextPassword }: UpdateAdminCredentialsInput) => {
    const stored = readAdminCredentials();
    if (!stored) throw new Error("No School Administrator account found.");

    const computed = await hashPassword(currentPassword, stored.salt, stored.iterations);
    if (computed !== stored.passwordHash) {
      throw new Error("Current passcode is incorrect.");
    }

    const normalizedNextUsername = nextUsername?.trim();
    const shouldChangePassword = Boolean(nextPassword && nextPassword.length > 0);

    if (!normalizedNextUsername && !shouldChangePassword) {
      throw new Error("Provide a new School ID or new passcode.");
    }

    const updatedSalt = shouldChangePassword ? crypto.randomUUID() : stored.salt;
    const updatedHash = shouldChangePassword
      ? await hashPassword(nextPassword as string, updatedSalt, stored.iterations)
      : stored.passwordHash;

    const updated: StoredAdminCredentials = {
      username: normalizedNextUsername || stored.username,
      salt: updatedSalt,
      passwordHash: updatedHash,
      iterations: stored.iterations,
    };

    localStorage.setItem(ADMIN_CREDENTIALS_KEY, JSON.stringify(updated));

    if (role === "school_admin") {
      const freshUsername = updated.username;
      setUsername(freshUsername);
      writeSession({ role: "school_admin", username: freshUsername });
    }
  };

  const value = useMemo<AuthContextType>(
    () => ({
      role,
      username,
      hasAdminAccount,
      login,
      logout,
      registerAdmin,
      authenticateAdmin,
      updateAdminCredentials,
    }),
    [role, username, hasAdminAccount],
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
