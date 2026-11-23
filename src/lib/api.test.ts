import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";

const storage = vi.hoisted(() => ({
  read: vi.fn(async () => null),
  write: vi.fn(async () => undefined),
  clear: vi.fn(async () => undefined),
}));
vi.mock("@/lib/session-storage", () => ({ sessionStorage: storage }));

const jwt = (exp = Math.floor(Date.now() / 1000) + 3600) =>
  `header.${btoa(JSON.stringify({ user_id: "student-1", role: "student", exp }))}.signature`;

async function setup(adapter: AxiosAdapter) {
  const { default: axios } = await import("axios");
  axios.defaults.adapter = adapter;
  const session = await import("@/lib/session");
  const apiModule = await import("@/lib/api");
  return { ...session, ...apiModule };
}

async function unauthorized(config: InternalAxiosRequestConfig): Promise<never> {
  const { AxiosError } = await import("axios");
  throw new AxiosError("Unauthorized", "ERR_BAD_REQUEST", config, undefined, {
    data: { detail: "Invalid token" }, status: 401, statusText: "Unauthorized", headers: {}, config,
  });
}
const ok = (config: InternalAxiosRequestConfig, data: unknown) => ({ data, status: 200, statusText: "OK", headers: {}, config });

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  storage.read.mockResolvedValue(null);
  storage.write.mockResolvedValue(undefined);
  storage.clear.mockResolvedValue(undefined);
});

describe("authenticated API session", () => {
  it("renews concurrent rejected requests once and replays each request", async () => {
    const access = jwt();
    const adapter = vi.fn<AxiosAdapter>(async (config) => {
      if (config.url === "/accounts/token/refresh/") {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return ok(config, { access, refresh: "rotated-refresh" });
      }
      if (config.headers.get("Authorization") === "Bearer old-access") return unauthorized(config);
      return ok(config, { authorized: true });
    });
    const { api, saveSession, getSession } = await setup(adapter);
    await saveSession({ access: "old-access", refresh: "refresh" });
    const results = await Promise.all([api.get("/lessons/"), api.get("/homework/")]);
    expect(results.map((result) => result.data)).toEqual([{ authorized: true }, { authorized: true }]);
    expect(adapter.mock.calls.filter(([config]) => config.url === "/accounts/token/refresh/")).toHaveLength(1);
    expect(getSession()).toEqual({ access, refresh: "rotated-refresh" });
  });

  it("clears an invalid refresh and never recursively retries the refresh endpoint", async () => {
    const adapter = vi.fn<AxiosAdapter>((config) => unauthorized(config));
    const { api, saveSession, getSession } = await setup(adapter);
    await saveSession({ access: "old-access", refresh: "invalid" });
    await expect(api.get("/lessons/")).rejects.toThrow("Unauthorized");
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(getSession()).toBeNull();
    expect(storage.clear).toHaveBeenCalledOnce();
  });

  it("stops after one replay when the new token is also rejected", async () => {
    const adapter = vi.fn<AxiosAdapter>((config) => config.url === "/accounts/token/refresh/"
      ? Promise.resolve(ok(config, { access: jwt() })) : unauthorized(config));
    const { api, saveSession, getSession } = await setup(adapter);
    await saveSession({ access: "old-access", refresh: "refresh" });
    await expect(api.get("/lessons/")).rejects.toThrow();
    expect(adapter).toHaveBeenCalledTimes(3);
    expect(getSession()).toBeNull();
  });

  it("does not restore credentials when logout occurs during a refresh", async () => {
    let finishRefresh: () => void;
    const pending = new Promise<void>((resolve) => { finishRefresh = resolve; });
    const adapter = vi.fn<AxiosAdapter>(async (config) => {
      await pending;
      return ok(config, { access: jwt() });
    });
    const { saveSession, refreshAccessToken, clearSession, getSession } = await setup(adapter);
    await saveSession({ access: "old-access", refresh: "refresh" });
    const refresh = refreshAccessToken();
    await clearSession();
    finishRefresh!();
    expect(await refresh).toBeNull();
    expect(getSession()).toBeNull();
    expect(storage.write).toHaveBeenCalledTimes(1);
  });

  it("keeps credentials after a refresh transport failure", async () => {
    const { AxiosError } = await import("axios");
    const adapter: AxiosAdapter = async () => { throw new AxiosError("Offline", "ERR_NETWORK"); };
    const { saveSession, refreshAccessToken, getSession } = await setup(adapter);
    const tokens = { access: "old-access", refresh: "refresh" };
    await saveSession(tokens);
    await expect(refreshAccessToken()).rejects.toThrow("Offline");
    expect(getSession()).toEqual(tokens);
    expect(storage.clear).not.toHaveBeenCalled();
  });

  it("renews expired sessions on startup while preserving old browser sessions until expiry", async () => {
    storage.read.mockResolvedValue({ access: jwt(1), refresh: "stored-refresh" } as never);
    const access = jwt();
    const adapter = vi.fn<AxiosAdapter>(async (config) => ok(config, { access }));
    const { restoreAuthSession, getSession } = await setup(adapter);
    await restoreAuthSession();
    expect(getSession()).toEqual({ access, refresh: "stored-refresh" });
    expect(adapter).toHaveBeenCalledOnce();
  });

  it("fails closed and clears memory if storing credentials fails", async () => {
    const { saveSession, getSession } = await setup(async (config) => ok(config, {}));
    storage.write.mockRejectedValueOnce(new Error("Keychain unavailable"));
    await expect(saveSession({ access: jwt(), refresh: "refresh" })).rejects.toThrow("Não foi possível salvar");
    expect(getSession()).toBeNull();
    expect(storage.clear).toHaveBeenCalledOnce();
  });

  it("discards successful private responses that arrive after switching accounts", async () => {
    let finish!: () => void;
    let started!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const sent = new Promise<void>((resolve) => { started = resolve; });
    const { api, saveSession, clearSession, getSession } = await setup(async (config) => {
      started();
      await pending;
      return ok(config, { private: 'first account data' });
    });
    await saveSession({ access: jwt(), refresh: "first-refresh" });
    const response = api.get('/lessons/');
    await sent;
    await clearSession();
    const next = { access: 'second-account-access', refresh: 'second-refresh' };
    await saveSession(next);
    finish();
    await expect(response).rejects.toMatchObject({ __CANCEL__: true });
    expect(getSession()).toEqual(next);
  });
});

describe('AI consent request coordination', () => {
  it('asks once for concurrent denied requests and replays only after explicit permission', async () => {
    let allowed = false;
    const adapter = vi.fn<AxiosAdapter>(async (config) => {
      if (allowed) return ok(config, { ready: true });
      const { AxiosError } = await import('axios');
      throw new AxiosError('Consent required', 'ERR_BAD_REQUEST', config, undefined, {
        status: 403, statusText: 'Forbidden', data: { code: 'ai_consent_required' }, headers: {}, config,
      });
    });
    const { api, saveSession } = await setup(adapter);
    await saveSession({ access: jwt(), refresh: 'refresh' });
    const { registerAIConsentRequester } = await import('./aiConsent');
    const prompt = vi.fn(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); allowed = true; return true; });
    const unregister = registerAIConsentRequester(prompt);
    try {
      const responses = await Promise.all([api.post('/ai-study/sessions/'), api.post('/practice/sessions/')]);
      expect(responses.every((response) => response.data.ready)).toBe(true);
      expect(prompt).toHaveBeenCalledOnce();
      expect(adapter).toHaveBeenCalledTimes(4);
    } finally { unregister(); }
  });

  it('never replays a denied AI request after refusal or account change', async () => {
    const adapter = vi.fn<AxiosAdapter>(async (config) => {
      const { AxiosError } = await import('axios');
      throw new AxiosError('Consent required', 'ERR_BAD_REQUEST', config, undefined, {
        status: 403, statusText: 'Forbidden', data: { code: 'ai_consent_required' }, headers: {}, config,
      });
    });
    const { api, saveSession, clearSession } = await setup(adapter);
    await saveSession({ access: jwt(), refresh: 'refresh' });
    const { registerAIConsentRequester } = await import('./aiConsent');
    let unregister = registerAIConsentRequester(async () => false);
    await expect(api.post('/ai-study/sessions/')).rejects.toMatchObject({ __CANCEL__: true });
    unregister();
    unregister = registerAIConsentRequester(async () => { await clearSession(); return true; });
    await expect(api.post('/ai-study/sessions/')).rejects.toMatchObject({ __CANCEL__: true });
    unregister();
    expect(adapter).toHaveBeenCalledTimes(2);
  });
});
