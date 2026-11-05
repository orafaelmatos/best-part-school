import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Pause, Play, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { microphoneError, preferredRecordingType, recordingSupportError } from "@/lib/speakingAudio";

export type RecordingState = "idle" | "requesting" | "recording" | "paused" | "processing" | "uploading" | "completed" | "error";

type Props = {
  state: RecordingState;
  onStateChange: (state: RecordingState) => void;
  onRecordingComplete: (blob: Blob, durationSeconds: number) => void | Promise<void>;
  disabled?: boolean;
  errorMessage?: string;
  onUseText?: () => void;
};

const MicRecorder = ({ state, onStateChange, onRecordingComplete, disabled, errorMessage, onUseText }: Props) => {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const accumulatedRef = useRef(0);
  const segmentRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRecordingRef = useRef<{ blob: Blob; seconds: number } | null>(null);
  const callbacksRef = useRef({ onStateChange, onRecordingComplete });
  callbacksRef.current = { onStateChange, onRecordingComplete };
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const unsupported = recordingSupportError();

  const stopTimer = () => {
    if (timerRef.current !== null) clearInterval(timerRef.current);
    timerRef.current = null;
  };
  const elapsedMs = () => accumulatedRef.current + (segmentRef.current === null ? 0 : Date.now() - segmentRef.current);
  const freezeTime = () => {
    accumulatedRef.current = elapsedMs();
    segmentRef.current = null;
    setElapsed(accumulatedRef.current / 1000);
    stopTimer();
  };
  const releaseStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };
  const dispose = () => {
    generationRef.current += 1;
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.ondataavailable = recorder.onstop = recorder.onerror = null;
      if (recorder.state !== "inactive") recorder.stop();
    }
    recorderRef.current = null;
    stopTimer();
    releaseStream();
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.ondataavailable = recorder.onstop = recorder.onerror = null;
        if (recorder.state !== "inactive") recorder.stop();
      }
      if (timerRef.current !== null) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const deliver = async (recording: { blob: Blob; seconds: number }, generation: number) => {
    callbacksRef.current.onStateChange("processing");
    try {
      await callbacksRef.current.onRecordingComplete(recording.blob, recording.seconds);
    } catch {
      if (mountedRef.current && generation === generationRef.current) {
        setError("Não foi possível enviar a gravação. Tente enviar novamente ou responda por texto.");
        callbacksRef.current.onStateChange("error");
      }
    }
  };

  const start = async () => {
    if (disabled || recorderRef.current || unsupported) return;
    dispose();
    const generation = generationRef.current;
    setError("");
    lastRecordingRef.current = null;
    chunksRef.current = [];
    accumulatedRef.current = 0;
    segmentRef.current = null;
    setElapsed(0);
    callbacksRef.current.onStateChange("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current || generation !== generationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const mimeType = preferredRecordingType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (generation === generationRef.current && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        if (!mountedRef.current || generation !== generationRef.current) return;
        dispose();
        setError("A gravação foi interrompida. Tente novamente ou responda por texto.");
        callbacksRef.current.onStateChange("error");
      };
      recorder.onstop = () => {
        if (!mountedRef.current || generation !== generationRef.current) return;
        freezeTime();
        releaseStream();
        recorderRef.current = null;
        const type = recorder.mimeType || chunksRef.current.find((chunk) => chunk.type)?.type;
        const blob = new Blob(chunksRef.current, type ? { type } : undefined);
        chunksRef.current = [];
        if (!blob.size || !type) {
          setError("A gravação ficou vazia ou não pôde ser preparada. Grave novamente ou responda por texto.");
          callbacksRef.current.onStateChange("error");
          return;
        }
        const recording = { blob, seconds: Math.max(1, Math.round(accumulatedRef.current / 1000)) };
        lastRecordingRef.current = recording;
        void deliver(recording, generation);
      };
      recorder.start();
      segmentRef.current = Date.now();
      timerRef.current = setInterval(() => setElapsed(elapsedMs() / 1000), 250);
      callbacksRef.current.onStateChange("recording");
    } catch (cause) {
      if (!mountedRef.current || generation !== generationRef.current) return;
      dispose();
      setError(microphoneError(cause));
      callbacksRef.current.onStateChange("error");
    }
  };

  const pause = () => {
    if (recorderRef.current?.state !== "recording") return;
    recorderRef.current.pause();
    freezeTime();
    callbacksRef.current.onStateChange("paused");
  };
  const resume = () => {
    if (recorderRef.current?.state !== "paused") return;
    recorderRef.current.resume();
    segmentRef.current = Date.now();
    timerRef.current = setInterval(() => setElapsed(elapsedMs() / 1000), 250);
    callbacksRef.current.onStateChange("recording");
  };
  const cancel = () => {
    dispose();
    chunksRef.current = [];
    accumulatedRef.current = 0;
    segmentRef.current = null;
    setElapsed(0);
    setError("");
    callbacksRef.current.onStateChange("idle");
  };
  const busy = state === "requesting" || state === "uploading" || state === "processing";
  const status = {
    idle: "Sua vez de falar", requesting: "Aguardando acesso ao microfone...", recording: "Gravando sua resposta...",
    paused: "Gravação pausada", uploading: "Enviando sua gravação...", processing: "Transcrevendo e preparando o retorno...",
    completed: "Resposta enviada", error: "Você pode tentar novamente ou usar texto",
  }[state];

  return (
    <section aria-label="Resposta por voz" className="space-y-3 rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <p role="status" className="flex items-center gap-2 text-sm font-medium">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4 text-primary" />}
          {status}
        </p>
        <span aria-label="Duração da gravação" className="text-sm tabular-nums text-muted-foreground">
          {Math.floor(elapsed / 60)}:{Math.floor(elapsed % 60).toString().padStart(2, "0")}
        </span>
      </div>
      {unsupported || error || errorMessage ? <p role="alert" className="text-sm text-destructive">{unsupported || errorMessage || error}</p> : null}
      <div className="flex flex-wrap gap-2">
        {(["idle", "completed", "error"] as RecordingState[]).includes(state) && !unsupported ? (
          <Button type="button" onClick={() => void start()} disabled={disabled}><Mic className="h-4 w-4" />{state === "error" ? "Gravar novamente" : "Gravar resposta"}</Button>
        ) : null}
        {state === "error" && lastRecordingRef.current ? (
          <Button type="button" variant="outline" disabled={disabled} onClick={() => {
            setError("");
            void deliver(lastRecordingRef.current!, generationRef.current);
          }}>Enviar áudio novamente</Button>
        ) : null}
        {state === "recording" ? <Button type="button" variant="outline" onClick={pause}><Pause />Pausar</Button> : null}
        {state === "paused" ? <Button type="button" variant="outline" onClick={resume}><Play />Continuar gravação</Button> : null}
        {state === "recording" || state === "paused" ? <Button type="button" onClick={() => recorderRef.current?.stop()}><Square />Enviar áudio</Button> : null}
        {state === "recording" || state === "paused" || state === "requesting" ? <Button type="button" variant="ghost" onClick={cancel}><Trash2 />Cancelar gravação</Button> : null}
        {onUseText ? <Button type="button" variant="ghost" aria-label="Responder por texto" onClick={() => { if (!busy || state === "requesting") cancel(); onUseText(); }}><span className="sm:hidden">Usar texto</span><span className="hidden sm:inline">Responder por texto</span></Button> : null}
      </div>
      <p className="text-xs text-muted-foreground">Feedback sobre a transcrição; pronúncia não avaliada.</p>
    </section>
  );
};

export default MicRecorder;
