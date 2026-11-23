import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SimultaneousRecorder from "./SimultaneousRecorder";

const stopTrack = vi.fn();
const getUserMedia = vi.fn();
const stream = { getTracks: () => [{ stop: stopTrack }] };
let now = 0;
let instances: FakeRecorder[];
class FakeRecorder {
  static isTypeSupported = () => true;
  state = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { instances.push(this); }
  start() { this.state = "recording"; }
  pause() { this.state = "paused"; }
  resume() { this.state = "recording"; }
  stop() { this.state = "inactive"; queueMicrotask(() => { this.ondataavailable?.({ data: new Blob(["encoded"], { type: this.mimeType }) }); this.onstop?.(); }); }
}

beforeEach(() => {
  now = 0; instances = []; stopTrack.mockReset(); getUserMedia.mockReset().mockResolvedValue(stream);
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, "paused", { configurable: true, value: false });
    fireEvent.playing(this); return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, "paused", { configurable: true, value: true }); fireEvent.pause(this);
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const setup = () => {
  const onComplete = vi.fn(), onBusyChange = vi.fn(), onReset = vi.fn();
  const rendered = render(<SimultaneousRecorder sessionId="session-v2" messageId="turn-1" initialUrl="/media/source.mp3" speed={1} onComplete={onComplete} onBusyChange={onBusyChange} onReset={onReset} />);
  const audio = screen.getByLabelText("Áudio original da simultânea") as HTMLAudioElement;
  Object.defineProperty(audio, "duration", { configurable: true, value: 8 });
  fireEvent.canPlay(audio);
  return { ...rendered, audio, onComplete, onBusyChange };
};

describe("SimultaneousRecorder", () => {
  it("records while the original plays, pauses both, and preserves rate changes for replay", async () => {
    const { audio, onComplete, onBusyChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Iniciar áudio e gravação" }));
    await screen.findByText("Original em reprodução e microfone gravando.");
    expect(instances[0].state).toBe("recording"); expect(audio.paused).toBe(false);
    now = 2000; audio.currentTime = 2;
    fireEvent.change(screen.getByLabelText("Velocidade da simultânea"), { target: { value: "0.75" } });
    now = 6000; audio.currentTime = 5;
    fireEvent.click(screen.getByRole("button", { name: "Pausar os dois" }));
    expect(instances[0].state).toBe("paused"); expect(audio.paused).toBe(true);
    now = 9000;
    fireEvent.click(screen.getByRole("button", { name: "Retomar os dois" }));
    await waitFor(() => expect(audio.paused).toBe(false));
    now = 13000; audio.currentTime = 8; fireEvent.ended(audio);
    expect(onComplete).not.toHaveBeenCalled();
    now = 14000;
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Concluir simultânea" })); });
    expect(onComplete).toHaveBeenCalledTimes(1);
    const [blob, seconds, timing] = onComplete.mock.calls[0];
    expect(blob.size).toBeGreaterThan(0); expect(seconds).toBe(11);
    expect(timing.source_completed).toBe(true); expect(timing.segments).toHaveLength(3);
    expect(timing.segments[2]).toMatchObject({ source_start_seconds: 5, source_end_seconds: 8, playback_rate: 0.75, recording_start_seconds: 6, recording_end_seconds: 10 });
    expect(stopTrack).toHaveBeenCalledTimes(1); expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });
  it("releases a late microphone grant after cancellation and never plays the source", async () => {
    let resolve!: (value: typeof stream) => void;
    getUserMedia.mockReturnValue(new Promise((done) => { resolve = done; }));
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Iniciar áudio e gravação" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar gravação" }));
    await act(async () => { resolve(stream); });
    expect(stopTrack).toHaveBeenCalledTimes(1); expect(instances).toHaveLength(0);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });
  it("stops recording if playback is blocked instead of sending an empty simultaneous attempt", async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error("blocked"));
    const { onComplete } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Iniciar áudio e gravação" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("O navegador não iniciou o áudio original");
    expect(instances[0].state).toBe("inactive"); expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });
  it("cannot finish before the source ends and cleans up both media on unmount", async () => {
    const { audio, onComplete, unmount } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Iniciar áudio e gravação" }));
    await screen.findByText("Original em reprodução e microfone gravando.");
    expect(screen.queryByRole("button", { name: "Concluir simultânea" })).not.toBeInTheDocument();
    unmount(); await act(async () => undefined);
    expect(audio.paused).toBe(true); expect(instances[0].state).toBe("inactive");
    expect(stopTrack).toHaveBeenCalledTimes(1); expect(onComplete).not.toHaveBeenCalled();
  });
  it("reports microphone denial without starting the source", async () => {
    getUserMedia.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    setup(); fireEvent.click(screen.getByRole("button", { name: "Iniciar áudio e gravação" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("O acesso ao microfone não foi permitido");
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });
  it("ignores a queued source-end event after the learner cancels", async () => {
    const { audio, onComplete } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Iniciar áudio e gravação" }));
    await screen.findByText("Original em reprodução e microfone gravando.");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar gravação" }));
    fireEvent.ended(audio);
    expect(screen.queryByRole("button", { name: "Concluir simultânea" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Iniciar áudio e gravação" })).toBeEnabled();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
