import { beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ enabled: false }));
const secure = vi.hoisted(() => ({
  get: vi.fn(async () => null),
  set: vi.fn(async () => undefined),
  remove: vi.fn(async () => true),
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => native.enabled } }));
vi.mock("@aparajita/capacitor-secure-storage", () => ({
  SecureStorage: secure,
  KeychainAccess: { whenUnlockedThisDeviceOnly: 1 },
}));
import { sessionStorage } from "./session-storage";

beforeEach(() => {
  native.enabled = false;
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    get length() { return values.size; },
  });
  vi.clearAllMocks();
  secure.get.mockResolvedValue(null);
});

describe("session storage by platform", () => {
  it("preserves web access tokens from before refresh support", async () => {
    localStorage.setItem("token", "legacy-access");
    expect(await sessionStorage.read()).toEqual({ access: "legacy-access", refresh: null });
    await sessionStorage.write({ access: "access", refresh: "refresh" });
    expect(await sessionStorage.read()).toEqual({ access: "access", refresh: "refresh" });
    await sessionStorage.clear();
    expect(await sessionStorage.read()).toBeNull();
    expect(secure.get).not.toHaveBeenCalled();
  });

  it("stores native credentials only in device-local secure storage", async () => {
    native.enabled = true;
    const tokens = { access: "access", refresh: "refresh" };
    await sessionStorage.write(tokens);
    expect(secure.set).toHaveBeenCalledWith("bps.auth.session.v1", tokens, false, false, 1);
    expect(localStorage.length).toBe(0);
    secure.get.mockResolvedValueOnce(tokens as never);
    expect(await sessionStorage.read()).toEqual(tokens);
    expect(secure.get).toHaveBeenCalledWith("bps.auth.session.v1", false, false);
    await sessionStorage.clear();
    expect(secure.remove).toHaveBeenCalledWith("bps.auth.session.v1", false);
  });

  it("does not fall back to browser storage if the native plugin fails", async () => {
    native.enabled = true;
    secure.set.mockRejectedValueOnce(new Error("Keychain unavailable"));
    await expect(sessionStorage.write({ access: "access", refresh: "refresh" })).rejects.toThrow("Keychain unavailable");
    expect(localStorage.length).toBe(0);
  });
});
