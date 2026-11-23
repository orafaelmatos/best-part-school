import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { focusManager } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NativeAppLifecycle from "@/components/NativeAppLifecycle";

const native = vi.hoisted(() => ({
  enabled: true,
  platform: "android",
  addListener: vi.fn(),
  minimizeApp: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => native.enabled,
    getPlatform: () => native.platform,
  },
}));
vi.mock("@capacitor/app", () => ({ App: native }));

const callbacks = new Map<string, (event?: { isActive: boolean }) => void>();
const remove = vi.fn();

function Location() {
  return <span data-testid="route">{useLocation().pathname}</span>;
}

function renderLifecycle(entries = ["/app"]) {
  return render(
    <MemoryRouter initialEntries={entries}>
      <NativeAppLifecycle />
      <Location />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  native.enabled = true;
  native.platform = "android";
  native.minimizeApp.mockResolvedValue(undefined);
  remove.mockResolvedValue(undefined);
  native.addListener.mockImplementation((event, callback) => {
    callbacks.set(event, callback);
    return Promise.resolve({ remove });
  });
  window.history.replaceState({ idx: 0 }, "");
});

afterEach(() => {
  cleanup();
  callbacks.clear();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe("native app lifecycle", () => {
  it("keeps web builds on the browser lifecycle", () => {
    native.enabled = false;
    renderLifecycle();
    expect(native.addListener).not.toHaveBeenCalled();
  });

  it("minimizes Android at the dashboard", async () => {
    renderLifecycle();
    act(() => callbacks.get("backButton")?.());
    expect(native.minimizeApp).toHaveBeenCalledOnce();
    expect(screen.getByTestId("route")).toHaveTextContent("/app");
  });

  it("returns through app history from a nested screen", () => {
    window.history.replaceState({ idx: 1 }, "");
    renderLifecycle(["/app/aulas", "/app/treinar-ia"]);
    act(() => callbacks.get("backButton")?.());
    expect(screen.getByTestId("route")).toHaveTextContent("/app/aulas");
    expect(native.minimizeApp).not.toHaveBeenCalled();
  });

  it("returns a directly opened nested screen to the dashboard", () => {
    renderLifecycle(["/app/treinar-ia"]);
    act(() => callbacks.get("backButton")?.());
    expect(screen.getByTestId("route")).toHaveTextContent("/app");
    expect(native.minimizeApp).not.toHaveBeenCalled();
  });

  it("updates query focus on iOS without installing an Android back handler", () => {
    native.platform = "ios";
    const focused = vi.spyOn(focusManager, "setFocused");
    renderLifecycle();
    act(() => callbacks.get("appStateChange")?.({ isActive: false }));
    act(() => callbacks.get("appStateChange")?.({ isActive: true }));
    expect(focused).toHaveBeenNthCalledWith(1, false);
    expect(focused).toHaveBeenNthCalledWith(2, true);
    expect(callbacks.has("backButton")).toBe(false);
  });

  it("removes listeners registered after the component unmounts", async () => {
    const registrations: ((value: { remove: typeof remove }) => void)[] = [];
    native.addListener.mockImplementation(() => new Promise((resolve) => registrations.push(resolve)));
    const { unmount } = renderLifecycle();
    unmount();
    await act(async () => registrations.forEach((resolve) => resolve({ remove })));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(2));
  });
});
