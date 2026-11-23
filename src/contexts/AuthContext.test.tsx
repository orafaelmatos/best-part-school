import { act, fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionTokens } from "@/lib/session-storage";

const fake = vi.hoisted(() => ({
  session: null as SessionTokens | null,
  listeners: new Set<(tokens: SessionTokens | null) => void>(),
}));
vi.mock("@/lib/api", () => ({ restoreAuthSession: async () => undefined }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/lib/session", () => ({
  getSession: () => fake.session,
  subscribeSession: (listener: (tokens: SessionTokens | null) => void) => {
    fake.listeners.add(listener);
    return () => { fake.listeners.delete(listener); };
  },
  saveSession: async (tokens: SessionTokens) => {
    fake.session = tokens;
    fake.listeners.forEach((listener) => listener(tokens));
  },
  clearSession: async () => {
    fake.session = null;
    fake.listeners.forEach((listener) => listener(null));
  },
}));
import { AuthProvider, useAuth } from "./AuthContext";

const jwt = (id: string) => `header.${btoa(JSON.stringify({ user_id: id, role: "student", exp: Date.now() / 1000 + 3600 }))}.signature`;
function Probe() {
  const { user, isLoading, login, logout } = useAuth();
  return <>
    <span>{isLoading ? "loading" : user?.user_id ?? "signed-out"}</span>
    <button onClick={() => { void logout(); }}>Sair</button>
    <button onClick={() => { void login(jwt("student-2"), "new-refresh"); }}>Trocar conta</button>
  </>;
}
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>);
  return client;
}
beforeEach(() => { fake.session = { access: jwt("student-1"), refresh: "refresh" }; });
afterEach(() => { cleanup(); fake.listeners.clear(); });

describe("account cache isolation", () => {
  it("removes user-specific cached data on logout", async () => {
    const client = setup();
    await screen.findByText("student-1");
    client.setQueryData(["lessons"], ["private lesson"]);
    fireEvent.click(screen.getByText("Sair"));
    await screen.findByText("signed-out");
    expect(client.getQueryData(["lessons"])).toBeUndefined();
  });

  it("removes cached data before publishing a different account", async () => {
    const client = setup();
    await screen.findByText("student-1");
    client.setQueryData(["lessons"], ["student one lesson"]);
    fireEvent.click(screen.getByText("Trocar conta"));
    await screen.findByText("student-2");
    expect(client.getQueryData(["lessons"])).toBeUndefined();
  });

  it("also clears cached data when an API expiration event ends the session", async () => {
    const client = setup();
    await screen.findByText("student-1");
    client.setQueryData(["finance"], ["private finance"]);
    act(() => {
      fake.session = null;
      fake.listeners.forEach((listener) => listener(null));
    });
    await waitFor(() => expect(screen.getByText("signed-out")).toBeInTheDocument());
    expect(client.getQueryData(["finance"])).toBeUndefined();
  });
});
