import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Pause, Play, RotateCcw, Square, Trash2 } from "lucide-react";

export type RecordingState = "idle" | "recording" | "paused" | "processing" | "uploading" | "completed" | "error";

const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remaining}`;
};

const MicRecorder = ({
  state,
  onStateChange,
  onRecordingComplete,
  disabled,
}: {
  state: RecordingState;
  onStateChange: (state: RecordingState) => void;
  onRecordingComplete: (blob: Blob, durationSeconds: number) => void;
  disabled?: boolean;
}) => {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const elapsedBeforePauseRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");

  const stopTimer = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const startTimer = () => {
    stopTimer();
    startedAtRef.current = Date.now();
    timerRef.current = window.setInterval(() => {
      setElapsed(elapsedBeforePauseRef.current + (Date.now() - startedAtRef.current) / 1000);
    }, 250);
  };

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    return () => {
      stopTimer();
      cleanupStream();
    };
  }, []);

  const start = async () => {
    setError("");
    chunksRef.current = [];
    elapsedBeforePauseRef.current = 0;
    setElapsed(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/wav";
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stopTimer();
        cleanupStream();
        if (!chunksRef.current.length) return;
        onStateChange("processing");
        const blob = new Blob(chunksRef.current, { type: mimeType });
        onRecordingComplete(blob, Math.max(1, Math.round(elapsed)));
      };
      recorder.start();
      startTimer();
      onStateChange("recording");
    } catch {
      setError("Não foi possível acessar o microfone.");
      onStateChange("error");
    }
  };

  const pause = () => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.pause();
      elapsedBeforePauseRef.current = elapsed;
      stopTimer();
      onStateChange("paused");
    }
  };

  const resume = () => {
    if (recorderRef.current?.state === "paused") {
      recorderRef.current.resume();
      startTimer();
      onStateChange("recording");
    }
  };

  const stop = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  };

  const cancel = () => {
    chunksRef.current = [];
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    stopTimer();
    cleanupStream();
    elapsedBeforePauseRef.current = 0;
    setElapsed(0);
    onStateChange("idle");
  };

  const isBusy = state === "processing" || state === "uploading";

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Speaking recorder</p>
          <p className="text-xs text-muted-foreground">{state === "recording" ? "Gravando..." : state === "paused" ? "Pausado" : state === "uploading" ? "Enviando para análise..." : "Grave sua resposta em inglês."}</p>
        </div>
        <div className="text-lg font-semibold tabular-nums">{formatTime(elapsed)}</div>
      </div>

      <div className="mb-4 flex h-12 items-center gap-1 overflow-hidden rounded-xl bg-muted px-3">
        {Array.from({ length: 36 }).map((_, index) => (
          <span
            key={index}
            className={`w-1 rounded-full bg-primary/70 ${state === "recording" ? "animate-pulse" : ""}`}
            style={{ height: `${12 + ((index * 7) % 28)}px`, animationDelay: `${index * 35}ms` }}
          />
        ))}
      </div>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {state === "idle" || state === "completed" || state === "error" ? (
          <button type="button" onClick={start} disabled={disabled} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
            <Mic className="h-4 w-4" /> Gravar
          </button>
        ) : null}
        {state === "recording" && (
          <>
            <button type="button" onClick={pause} className="flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium">
              <Pause className="h-4 w-4" /> Pausar
            </button>
            <button type="button" onClick={stop} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              <Square className="h-4 w-4" /> Enviar
            </button>
          </>
        )}
        {state === "paused" && (
          <>
            <button type="button" onClick={resume} className="flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium">
              <Play className="h-4 w-4" /> Continuar
            </button>
            <button type="button" onClick={stop} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              <Square className="h-4 w-4" /> Enviar
            </button>
          </>
        )}
        {(state === "recording" || state === "paused") && (
          <button type="button" onClick={cancel} className="flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground">
            <Trash2 className="h-4 w-4" /> Cancelar
          </button>
        )}
        {state === "completed" && (
          <button type="button" onClick={start} className="flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium">
            <RotateCcw className="h-4 w-4" /> Regravar
          </button>
        )}
        {isBusy && <span className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Processando</span>}
      </div>
    </div>
  );
};

export default MicRecorder;
