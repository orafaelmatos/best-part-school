import { Capacitor } from "@capacitor/core";

export interface SessionTokens {
  access: string;
  refresh: string | null;
}

export interface SessionStorage {
  read(): Promise<SessionTokens | null>;
  write(tokens: SessionTokens): Promise<void>;
  clear(): Promise<void>;
}

const SESSION_KEY = "bps.auth.session.v1";

function parseSession(value: unknown): SessionTokens | null {
  if (!value || typeof value !== "object") return null;
  const session = value as Partial<SessionTokens>;
  return typeof session.access === "string" && session.access.length > 0 &&
    (session.refresh === null || typeof session.refresh === "string")
    ? { access: session.access, refresh: session.refresh || null }
    : null;
}

async function nativeStorage() {
  // Never use the plugin's unencrypted web fallback for native credentials.
  const { SecureStorage, KeychainAccess } = await import("@aparajita/capacitor-secure-storage");
  return { SecureStorage, KeychainAccess };
}

export const sessionStorage: SessionStorage = {
  async read() {
    if (Capacitor.isNativePlatform()) {
      const { SecureStorage } = await nativeStorage();
      return parseSession(await SecureStorage.get(SESSION_KEY, false, false));
    }
    // Preserve existing browser sessions. Old sessions gain a refresh token on next login.
    const access = localStorage.getItem("token");
    return access ? { access, refresh: localStorage.getItem("refreshToken") } : null;
  },
  async write(tokens) {
    if (Capacitor.isNativePlatform()) {
      const { SecureStorage, KeychainAccess } = await nativeStorage();
      await SecureStorage.set(SESSION_KEY, { ...tokens }, false, false, KeychainAccess.whenUnlockedThisDeviceOnly);
      return;
    }
    localStorage.setItem("token", tokens.access);
    if (tokens.refresh) localStorage.setItem("refreshToken", tokens.refresh);
    else localStorage.removeItem("refreshToken");
  },
  async clear() {
    if (Capacitor.isNativePlatform()) {
      const { SecureStorage } = await nativeStorage();
      await SecureStorage.remove(SESSION_KEY, false);
      return;
    }
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
  },
};
