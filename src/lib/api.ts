import axios, { type InternalAxiosRequestConfig, type AxiosRequestConfig } from "axios";
import { jwtDecode } from "jwt-decode";
import { API_BASE_URL } from "@/lib/config";
import { clearSession, getSession, getSessionGeneration, hydrateSession, saveSession } from "@/lib/session";
import { requestAIConsent } from "@/lib/aiConsent";

export const api = axios.create({ baseURL: API_BASE_URL });
// A separate client avoids recursively intercepting a rejected refresh request.
const tokenApi = axios.create({ baseURL: API_BASE_URL });
type AuthRequest = InternalAxiosRequestConfig & { _authRetry?: boolean; _authGeneration?: number; _aiConsentRetry?: boolean };
let refreshing: { generation: number; promise: Promise<string | null> } | undefined;

export const sessionBoundConfig = (generation: number): AxiosRequestConfig & { _authGeneration: number } => ({ _authGeneration: generation });

const isAuthEndpoint = (url = "") => /\/accounts\/(login|token\/refresh)\/?(?:\?|$)/.test(url);

export function refreshAccessToken(): Promise<string | null> {
  const session = getSession();
  const generation = getSessionGeneration();
  if (!session?.refresh) return Promise.resolve(null);
  if (refreshing?.generation === generation) return refreshing.promise;
  const promise = (async () => {
    try {
      const response = await tokenApi.post<{ access: string; refresh?: string }>("/accounts/token/refresh/", { refresh: session.refresh });
      const access = response.data.access;
      if (typeof access !== "string" || !access) throw new Error("Resposta de sessão inválida.");
      const saved = await saveSession({ access, refresh: response.data.refresh || session.refresh }, generation);
      return saved ? access : null;
    } catch (error) {
      // A network outage must not destroy an otherwise valid stored refresh token.
      if (getSessionGeneration() === generation && (!axios.isAxiosError(error) ||
          error.response?.status === 400 || error.response?.status === 401)) {
        await clearSession();
      }
      throw error;
    } finally {
      if (refreshing?.generation === generation) refreshing = undefined;
    }
  })();
  refreshing = { generation, promise };
  return promise;
}

export async function restoreAuthSession() {
  await hydrateSession();
  const session = getSession();
  if (!session) return;
  try {
    const { exp } = jwtDecode<{ exp: number }>(session.access);
    if (typeof exp !== "number") throw new Error("Token inválido.");
    if (exp * 1000 <= Date.now()) {
      if (session.refresh) await refreshAccessToken();
      else await clearSession();
    }
  } catch (error) {
    // Keep credentials through transport failures so reconnecting can renew the session.
    if (!axios.isAxiosError(error)) await clearSession();
    throw error;
  }
}

api.interceptors.request.use(async (config: AuthRequest) => {
  if (isAuthEndpoint(config.url)) return config;
  const startedAt = getSessionGeneration();
  await hydrateSession();
  config._authGeneration ??= startedAt;
  if (config._authGeneration !== getSessionGeneration()) throw new axios.CanceledError("Sessão alterada.");
  const access = getSession()?.access;
  if (access) config.headers.set("Authorization", `Bearer ${access}`);
  else config.headers.delete("Authorization");
  return config;
});

api.interceptors.response.use((response) => {
  const config = response.config as AuthRequest;
  if (config._authGeneration !== undefined && config._authGeneration !== getSessionGeneration()) {
    throw new axios.CanceledError("A resposta pertence a uma sessão anterior.");
  }
  return response;
}, async (error) => {
  const config = error.config as AuthRequest | undefined;
  if (config && error.response?.status === 403 && error.response?.data?.code === "ai_consent_required" &&
      !config._aiConsentRetry && config._authGeneration === getSessionGeneration()) {
    config._aiConsentRetry = true;
    if (await requestAIConsent() && config._authGeneration === getSessionGeneration()) return api.request(config);
    throw new axios.CanceledError("Você escolheu continuar sem IA.");
  }
  if (!config || error.response?.status !== 401 || isAuthEndpoint(config.url) ||
      config._authGeneration !== getSessionGeneration()) throw error;
  if (config._authRetry) {
    await clearSession();
    throw error;
  }
  const session = getSession();
  if (!session?.refresh) {
    await clearSession();
    throw error;
  }
  config._authRetry = true;
  // Another request may have already renewed the exact token rejected here.
  const access = config.headers.get("Authorization") !== `Bearer ${session.access}`
    ? session.access : await refreshAccessToken();
  if (!access || config._authGeneration !== getSessionGeneration()) throw error;
  config.headers.set("Authorization", `Bearer ${access}`);
  return api.request(config);
});
