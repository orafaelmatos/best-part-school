import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MicRecorder, { type RecordingState } from "@/components/MicRecorder";
import { recordingFileExtension } from "@/lib/recordingAudio";

const stopTrack = vi.fn();
const getUserMedia = vi.fn();
let supportedType = "audio/mp4";
let constructorFailure = false;
const recorders: FakeMediaRecorder[] = [];

class FakeMediaRecorder {
  static isTypeSupported(type: string) { return type === supportedType; }
  mimeType: string;
  state = "inactive";
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => void;
  constructor(_stream: MediaStream, options: MediaRecorderOptions) {
    if (constructorFailure) throw new Error("Recorder initialization failed");
    this.mimeType = `${options.mimeType};codecs=mp4a.40.2`;
    recorders.push(this);
  }
  start() { this.state = "recording"; }
  pause() { this.state = "paused"; }
  resume() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["recorded audio"], { type: this.mimeType }) });
    this.onstop?.();
  }
}

function renderRecorder() {
  supportedType = "audio/mp4";
  constructorFailure = false;
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
  const completed = vi.fn();
  function Harness() {
    const [state, setState] = useState<RecordingState>("idle");
    return <MicRecorder state={state} onStateChange={setState} onRecordingComplete={completed} />;
  }
  return { ...render(<Harness />), completed };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  recorders.length = 0;
});

describe("mobile microphone recording", () => {
  it("records MP4 and preserves its real MIME type and upload extension", async () => {
    const { completed } = renderRecorder();
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    fireEvent.click(screen.getByRole("button", { name: "Gravar" }));
    await screen.findByRole("button", { name: "Enviar" });
    now = 6000;
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    const [blob, seconds] = completed.mock.calls[0];
    expect(blob.type).toBe("audio/mp4;codecs=mp4a.40.2");
    expect(recordingFileExtension(blob.type)).toBe("mp4");
    expect(seconds).toBe(5);
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it("explains unsupported formats without requesting the microphone", async () => {
    const { completed } = renderRecorder();
    supportedType = "none";
    fireEvent.click(screen.getByRole("button", { name: "Gravar" }));
    expect(await screen.findByText("Este dispositivo não oferece um formato de gravação compatível.")).toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(completed).not.toHaveBeenCalled();
  });

  it("releases the microphone when recorder initialization fails", async () => {
    renderRecorder();
    constructorFailure = true;
    fireEvent.click(screen.getByRole("button", { name: "Gravar" }));
    await screen.findByText(/Verifique a permissão/);
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it("cancels an active recording without uploading it", async () => {
    const { completed } = renderRecorder();
    fireEvent.click(screen.getByRole("button", { name: "Gravar" }));
    await screen.findByRole("button", { name: "Cancelar" });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(completed).not.toHaveBeenCalled();
    expect(recorders[recorders.length - 1].state).toBe("inactive");
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it("stops an unmounted recording without submitting it", async () => {
    const { unmount, completed } = renderRecorder();
    fireEvent.click(screen.getByRole("button", { name: "Gravar" }));
    await screen.findByRole("button", { name: "Enviar" });
    unmount();
    expect(completed).not.toHaveBeenCalled();
    expect(recorders[recorders.length - 1].state).toBe("inactive");
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it("releases permission granted after the recorder has unmounted", async () => {
    const { unmount, completed } = renderRecorder();
    let grantPermission!: (stream: { getTracks: () => { stop: typeof stopTrack }[] }) => void;
    getUserMedia.mockReturnValue(new Promise((resolve) => { grantPermission = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Gravar" }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    unmount();
    await act(async () => grantPermission({ getTracks: () => [{ stop: stopTrack }] }));
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(completed).not.toHaveBeenCalled();
  });
});
