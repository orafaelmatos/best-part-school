import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MicRecorder, { type RecordingState } from "@/components/MicRecorder";

class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static isTypeSupported = vi.fn((type: string) => type.startsWith("audio/webm"));
  static fail = false;
  static defaultType = "audio/mp4";
  state = "inactive";
  mimeType: string;
  empty = false;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(_stream: MediaStream, options?: { mimeType: string }) {
    if (FakeRecorder.fail) throw new Error("encoder unavailable");
    this.mimeType = options?.mimeType || FakeRecorder.defaultType;
    FakeRecorder.instances.push(this);
  }
  start() { this.state = "recording"; }
  pause() { this.state = "paused"; }
  resume() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    if (!this.empty) this.ondataavailable?.({ data: new Blob(["recorded"], { type: this.mimeType }) });
    this.onstop?.();
  }
}

const Harness = ({ done, onText = vi.fn() }: { done: (blob: Blob, seconds: number) => void | Promise<void>; onText?: () => void }) => {
  const [state, setState] = useState<RecordingState>("idle");
  return <MicRecorder state={state} onStateChange={setState} onUseText={onText}
    onRecordingComplete={async (blob, seconds) => { await done(blob, seconds); setState("completed"); }} />;
};

describe("Speaking microphone lifecycle", () => {
  let stopTrack: ReturnType<typeof vi.fn>;
  let getUserMedia: ReturnType<typeof vi.fn>;
  let originalMedia: PropertyDescriptor | undefined;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    FakeRecorder.instances = [];
    FakeRecorder.fail = false;
    FakeRecorder.defaultType = "audio/mp4";
    FakeRecorder.isTypeSupported.mockImplementation((type) => type.startsWith("audio/webm"));
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    stopTrack = vi.fn();
    getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
    originalMedia = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  });
  afterEach(() => {
    cleanup();
    if (originalMedia) Object.defineProperty(navigator, "mediaDevices", originalMedia);
    else Reflect.deleteProperty(navigator, "mediaDevices");
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.clearAllMocks();
  });
  const start = async () => { await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Gravar resposta" })); }); };

  it("records the actual format and duration, excluding paused time", async () => {
    const done = vi.fn();
    render(<Harness done={done} />);
    await start();
    act(() => vi.advanceTimersByTime(3000));
    fireEvent.click(screen.getByRole("button", { name: "Pausar" }));
    act(() => vi.advanceTimersByTime(5000));
    fireEvent.click(screen.getByRole("button", { name: "Continuar gravação" }));
    act(() => vi.advanceTimersByTime(2000));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Enviar áudio" })); });
    expect(done).toHaveBeenCalledOnce();
    expect(done.mock.calls[0][1]).toBe(5);
    expect(done.mock.calls[0][0].type).toBe("audio/webm;codecs=opus");
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent("Resposta enviada");
  });

  it("uses the browser's actual MIME when none of the preferred formats is advertised", async () => {
    FakeRecorder.isTypeSupported.mockReturnValue(false);
    const done = vi.fn();
    render(<Harness done={done} />);
    await start();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Enviar áudio" })); });
    expect(done.mock.calls[0][0].type).toBe("audio/mp4");
  });

  it.each([['NotAllowedError', 'não foi permitido'], ['NotFoundError', 'Nenhum microfone'], ['NotReadableError', 'ocupado']])(
    "offers text when microphone access fails with %s", async (name, text) => {
      getUserMedia.mockRejectedValue(new DOMException("failure", name));
      const onText = vi.fn();
      render(<Harness done={vi.fn()} onText={onText} />);
      await start();
      expect(screen.getByRole("alert")).toHaveTextContent(text);
      fireEvent.click(screen.getByRole("button", { name: "Responder por texto" }));
      expect(onText).toHaveBeenCalledOnce();
    },
  );

  it("does not pretend recording is available without MediaRecorder", () => {
    vi.stubGlobal("MediaRecorder", undefined);
    render(<Harness done={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("não está disponível");
    expect(screen.queryByRole("button", { name: "Gravar resposta" })).not.toBeInTheDocument();
  });

  it("releases tracks if the encoder constructor fails", async () => {
    FakeRecorder.fail = true;
    render(<Harness done={vi.fn()} />);
    await start();
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert")).toHaveTextContent("responda por texto");
  });

  it("cancels a pending permission request and closes a stream that arrives later", async () => {
    let resolveStream!: (stream: unknown) => void;
    getUserMedia.mockReturnValue(new Promise((resolve) => { resolveStream = resolve; }));
    const done = vi.fn();
    render(<Harness done={done} />);
    await start();
    expect(screen.getByRole("status")).toHaveTextContent("Aguardando");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar gravação" }));
    await act(async () => { resolveStream({ getTracks: () => [{ stop: stopTrack }] }); });
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(done).not.toHaveBeenCalled();
    expect(FakeRecorder.instances).toHaveLength(0);
  });

  it("never submits cancelled or unmounted recordings", async () => {
    const done = vi.fn();
    const view = render(<Harness done={done} />);
    await start();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar gravação" }));
    expect(done).not.toHaveBeenCalled();
    await start();
    view.unmount();
    expect(done).not.toHaveBeenCalled();
    expect(stopTrack).toHaveBeenCalledTimes(2);
    expect(FakeRecorder.instances[1].state).toBe("inactive");
  });

  it("shows a fallback for encoder errors and empty recordings", async () => {
    const done = vi.fn();
    render(<Harness done={done} />);
    await start();
    act(() => FakeRecorder.instances[0].onerror?.());
    expect(screen.getByRole("alert")).toHaveTextContent("interrompida");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Gravar novamente" })); });
    FakeRecorder.instances[1].empty = true;
    fireEvent.click(screen.getByRole("button", { name: "Enviar áudio" }));
    expect(screen.getByRole("alert")).toHaveTextContent("vazia");
    expect(done).not.toHaveBeenCalled();
  });

  it("retains the same clip for retry after upload failure", async () => {
    const done = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(undefined);
    render(<Harness done={done} />);
    await start();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Enviar áudio" })); });
    expect(screen.getByRole("alert")).toHaveTextContent("enviar novamente");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Enviar áudio novamente" })); });
    expect(done.mock.calls[0][0]).toBe(done.mock.calls[1][0]);
    expect(done.mock.calls[0][1]).toBe(done.mock.calls[1][1]);
    expect(getUserMedia).toHaveBeenCalledOnce();
  });

  it.each([['uploading', 'Enviando'], ['processing', 'Transcrevendo']])("announces the %s state", (state, text) => {
    render(<MicRecorder state={state as RecordingState} onStateChange={vi.fn()} onRecordingComplete={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent(text);
    expect(screen.queryByRole("button", { name: "Gravar resposta" })).not.toBeInTheDocument();
  });
});
