import assert from "node:assert/strict";
import test from "node:test";
import { developmentEnvironment, parseOptions, preflightLocalApi } from "./mobile-live.mjs";

test("local mode is explicit and its ports can be overridden by the caller", () => {
  assert.equal(parseOptions([]).localApi, false);
  const options = parseOptions(["--local-api", "--port", "8081", "--api-port", "8001", "--port", "8082"]);
  assert.equal(options.localApi, true);
  assert.equal(options.port, 8082);
  assert.equal(options.apiPort, 8001);
});

test("API port options cannot imply local mode or share the Vite port", () => {
  assert.throws(() => parseOptions(["--api-port", "8001"]), /junto de --local-api/);
  assert.throws(() => parseOptions(["--local-api", "--api-port", "8080"]), /portas diferentes/);
  for (const port of ["0", "80", "65536", "8000.5", "https://api.example.test"]) {
    assert.throws(() => parseOptions(["--local-api", "--api-port", port]), /--api-port/);
  }
});

test("native live reload still accepts only local hosts", () => {
  assert.equal(parseOptions(["--local-api", "--host", "192.168.1.20"]).host, "192.168.1.20");
  assert.equal(parseOptions(["--local-api", "--host", "macbook.local"]).host, "macbook.local");
  for (const host of ["example.com", "8.8.8.8", "0.0.0.0", "192.168.300.1", "http://localhost:8081"]) {
    assert.throws(() => parseOptions(["--local-api", "--host", host]), /--host/);
  }
});

test("local environment overrides remote API and media without changing inherited values", () => {
  const inherited = {
    VITE_API_URL: "https://api.example.test/api/",
    VITE_MEDIA_BASE_URL: "https://media.example.test",
    VITE_LOCAL_API: "0",
    BPS_LOCAL_API_PORT: "9999",
  };
  const environment = developmentEnvironment(parseOptions(["--local-api", "--api-port", "8001", "--port", "8081"]), inherited);
  assert.equal(environment.VITE_API_URL, "/api/");
  assert.equal(environment.VITE_MEDIA_BASE_URL, "");
  assert.equal(environment.VITE_LOCAL_API, "1");
  assert.equal(environment.BPS_LOCAL_API_PORT, "8001");
  assert.equal(environment.BPS_LIVE_RELOAD_URL, "http://localhost:8081");
  assert.equal(inherited.VITE_API_URL, "https://api.example.test/api/");
  assert.equal(inherited.VITE_MEDIA_BASE_URL, "https://media.example.test");
});

test("remote mode does not inherit an accidental local toggle", () => {
  const environment = developmentEnvironment(parseOptions([]), { VITE_LOCAL_API: "1" });
  assert.equal(environment.VITE_LOCAL_API, "0");
});

test("local readiness only contacts loopback and refuses redirects", async () => {
  let request;
  await preflightLocalApi(8001, async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ mode: "mobile-local", database: "sqlite-local" }) };
  });
  assert.equal(request.url, "http://127.0.0.1:8001/api/local/health/");
  assert.equal(request.options.redirect, "error");
  assert.ok(request.options.signal instanceof AbortSignal);
});

test("an unrelated backend cannot pass the local readiness check", async () => {
  for (const health of [{}, { mode: "production", database: "sqlite-local" }, { mode: "mobile-local", database: "postgresql" }]) {
    await assert.rejects(preflightLocalApi(8000, async () => ({ ok: true, json: async () => health })), /backend isolado/);
  }
});

test("missing local backend explains startup and never falls back to a remote API", async () => {
  let calls = 0;
  await assert.rejects(preflightLocalApi(8000, async () => {
    calls++;
    throw new Error("ECONNREFUSED");
  }), /npm run dev:api:mobile[\s\S]*Nenhuma API externa/);
  assert.equal(calls, 1);
});

test("HTTP errors and malformed diagnostics are rejected before starting the app", async () => {
  await assert.rejects(preflightLocalApi(8000, async () => ({ ok: false, status: 404 })), /HTTP 404/);
  await assert.rejects(preflightLocalApi(8000, async () => ({ ok: true, json: async () => { throw new SyntaxError("Unexpected token"); } })), /API local não está pronta/);
});

test("readiness port validation rejects malformed targets before fetching", async () => {
  let calls = 0;
  for (const port of ["8000", 80, 65536, NaN, 8000.5]) {
    await assert.rejects(preflightLocalApi(port, async () => { calls++; }), /Porta da API local inválida/);
  }
  assert.equal(calls, 0);
});
