import { afterEach, describe, expect, it, vi } from "vitest";
import { isLocalDevelopmentOrigin, localApiProxyTarget } from "./localDevelopment";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); delete window.__APP_CONFIG__; });

describe("local mobile API isolation", () => {
  it("keeps the proxy on this Mac even if a remote target is supplied", () => {
    expect(localApiProxyTarget()).toBe("http://127.0.0.1:8000");
    expect(localApiProxyTarget("8001")).toBe("http://127.0.0.1:8001");
    for (const value of ["https://vps.example.test", "8000/path", "0", "65536", "abc"]) {
      expect(() => localApiProxyTarget(value)).toThrow();
    }
  });

  it("allows only a local HTTP development origin", () => {
    for (const value of ["http://localhost:8081", "http://127.0.0.1:8081", "http://192.168.1.2:8081", "http://my-mac.local:8081"]) expect(isLocalDevelopmentOrigin(value)).toBe(true);
    for (const value of ["https://vps.example.test", "http://example.test", "capacitor://localhost", "not a URL"]) expect(isLocalDevelopmentOrigin(value)).toBe(false);
  });

  it("ignores remote .env and runtime API/media settings in local mode", async () => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_LOCAL_API", "1");
    vi.stubEnv("VITE_API_URL", "https://vps.example.test/api/");
    vi.stubEnv("VITE_MEDIA_BASE_URL", "https://vps.example.test");
    window.__APP_CONFIG__ = { VITE_API_URL: "https://another-vps.example.test/api/", VITE_MEDIA_BASE_URL: "https://another-vps.example.test" };
    const config = await import("./config");
    expect(config.API_BASE_URL).toBe(`${window.location.origin}/api/`);
    expect(config.MEDIA_BASE_URL).toBe(window.location.origin);
    expect(config.absoluteMediaUrl("/media/photo.png")).toBe(`${window.location.origin}/media/photo.png`);
  });

  it("refuses local mode in a production runtime", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_LOCAL_API", "1");
    await expect(import("./config")).rejects.toThrow("servidor de desenvolvimento");
  });
});
