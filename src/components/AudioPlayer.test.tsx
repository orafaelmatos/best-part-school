import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AudioPlayer from "@/components/AudioPlayer";

const create = vi.hoisted(() => vi.fn());
vi.mock("wavesurfer.js", () => ({ default: { create } }));

const player = () => {
  const events: Record<string, () => void> = {};
  return { events, on: vi.fn((name: string, callback: () => void) => { events[name] = callback; }),
    getDuration: vi.fn(() => 4), setPlaybackRate: vi.fn(), playPause: vi.fn().mockResolvedValue(undefined), destroy: vi.fn() };
};

describe("Audio player states and fallbacks", () => {
  let current: ReturnType<typeof player>;
  beforeEach(() => {
    current = player();
    create.mockImplementation(() => current);
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

  it("announces loading and enables playback only after decoding", () => {
    render(<AudioPlayer src="/audio.mp3" />);
    expect(screen.getByRole("status")).toHaveTextContent("Carregando");
    expect(screen.getByRole("button", { name: "Tocar áudio" })).toBeDisabled();
    act(() => current.events.ready());
    expect(screen.getByText("0:04")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tocar áudio" })).toBeEnabled();
    act(() => current.events.play());
    expect(screen.getByRole("button", { name: "Pausar áudio" })).toBeInTheDocument();
    act(() => current.events.finish());
    expect(screen.getByRole("button", { name: "Tocar áudio" })).toBeInTheDocument();
  });

  it("handles a failed play promise and offers text instead of losing the message", async () => {
    current.playPause.mockRejectedValue(new DOMException("blocked", "NotAllowedError"));
    render(<AudioPlayer src="/audio.mp3" />);
    act(() => current.events.ready());
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Tocar áudio" })); });
    expect(screen.getByRole("alert")).toHaveTextContent("continue pelo texto");
  });

  it("allows retry after a loading error and releases the old player", () => {
    render(<AudioPlayer src="/missing.mp3" />);
    act(() => current.events.error());
    expect(screen.getByRole("alert")).toHaveTextContent("continuar pelo texto");
    const old = current;
    current = player();
    fireEvent.click(screen.getByRole("button", { name: "Tentar áudio novamente" }));
    expect(old.destroy).toHaveBeenCalledOnce();
    act(() => current.events.ready());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("stops loading after a bounded timeout", () => {
    vi.useFakeTimers();
    render(<AudioPlayer src="/slow.mp3" />);
    act(() => vi.advanceTimersByTime(20_000));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("uses the latest speed on ready and releases resources when source changes", () => {
    const view = render(<AudioPlayer src="/one.mp3" />);
    act(() => current.events.ready());
    fireEvent.change(screen.getByRole("combobox", { name: "Velocidade do áudio" }), { target: { value: "0.75" } });
    const old = current;
    current = player();
    view.rerender(<AudioPlayer src="/two.mp3" />);
    expect(old.destroy).toHaveBeenCalledOnce();
    act(() => current.events.ready());
    expect(current.setPlaybackRate).toHaveBeenLastCalledWith(0.75);
    view.unmount();
    expect(current.destroy).toHaveBeenCalledOnce();
  });
});
