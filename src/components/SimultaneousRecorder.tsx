import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Headphones, Loader2, Mic, Pause, Play, Square, Trash2 } from "lucide-react";
import { Alert, Button, IconTile, ProgressBar, inputClasses } from "@/components/student/ui";
import { api } from "@/lib/api";
import { absoluteMediaUrl } from "@/lib/config";
import { audioRequestError, microphoneError, preferredRecordingType, recordingSupportError } from "@/lib/speakingAudio";
import { audioTime, SIMULTANEOUS_RATES, SimultaneousTimeline } from "@/lib/simultaneousAudio";
import type { SimultaneousTiming } from "@/lib/interpreter";
import { cn } from "@/lib/utils";

type State = "idle" | "requesting" | "recording" | "paused" | "finishing" | "stopping" | "completed" | "error";
type Props = {
  sessionId: string;
  messageId: string;
  initialUrl?: string | null;
  speed: number;
  disabled?: boolean;
  onComplete: (blob: Blob, seconds: number, timing: SimultaneousTiming, sourceUrl: string) => void;
  onBusyChange: (busy: boolean) => void;
  onReset: () => void;
};

const SimultaneousRecorder = ({ sessionId, messageId, initialUrl, speed, disabled, onComplete, onBusyChange, onReset }: Props) => {
  const sourceRef = useRef<HTMLAudioElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timelineRef = useRef(new SimultaneousTimeline());
  const generation = useRef(0);
  const mounted = useRef(true);
  const stateRef = useRef<State>("idle");
  const chunks = useRef<Blob[]>([]);
  const completeRef = useRef(false);
  const timingRef = useRef<SimultaneousTiming | null>(null);
  const callbacks = useRef({ onComplete, onBusyChange, onReset });
  callbacks.current = { onComplete, onBusyChange, onReset };
  const [state, setState] = useState<State>("idle");
  const [url, setUrl] = useState(initialUrl || "");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [rate, setRate] = useState(speed);
  const [elapsed, setElapsed] = useState(0);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const unsupported = recordingSupportError();
  const active = ["requesting", "recording", "paused", "finishing", "stopping"].includes(state);

  const change = (next: State) => {
    stateRef.current = next;
    setState(next);
    callbacks.current.onBusyChange(["requesting", "recording", "paused", "finishing", "stopping"].includes(next));
  };
  const release = () => { streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; };
  const dispose = () => {
    generation.current++;
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.ondataavailable = recorder.onstop = recorder.onerror = null;
      if (recorder.state !== "inactive") recorder.stop();
    }
    recorderRef.current = null;
    sourceRef.current?.pause();
    release();
  };
  const fail = (message: string) => {
    if (!mounted.current) return;
    dispose(); setLoading(false); setError(message); change("error");
  };
  useEffect(() => {
    mounted.current = true;
    const source = sourceRef.current;
    return () => { mounted.current = false; dispose(); source?.pause(); callbacks.current.onBusyChange(false); };
  }, []);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      if (mounted.current) setElapsed(timelineRef.current.elapsed());
      if (timelineRef.current.elapsed() > 1100) fail("A gravação atingiu o limite de tempo. Tente novamente.");
    }, 100);
    return () => clearInterval(timer);
  }, [active]);
  useEffect(() => {
    // Leave a short tail so the interpreter can finish the final sentence.
    if (state !== "finishing") return;
    const timer = setTimeout(() => stop(), 15000);
    return () => clearTimeout(timer);
  }, [state]);
  useEffect(() => {
    if (!url || ready || error) return;
    const timer = setTimeout(() => fail("O áudio demorou para carregar. Prepare o áudio novamente."), 20000);
    return () => clearTimeout(timer);
  }, [url, ready, error]);

  const prepare = async () => {
    if (loading || active) return;
    const token = ++generation.current;
    setLoading(true); setError(""); setReady(false);
    try {
      const response = await api.post(`/ai-study/sessions/${sessionId}/interpreter/audio/`, { message_id: messageId, part: "original" });
      if (mounted.current && token === generation.current) { setUrl(response.data.audio_url); sourceRef.current?.load(); }
    } catch (cause) { if (mounted.current && token === generation.current) setError(audioRequestError(cause)); }
    finally { if (mounted.current && token === generation.current) setLoading(false); }
  };
  const start = async () => {
    if (disabled || ["requesting", "recording", "paused", "finishing", "stopping"].includes(stateRef.current) || !ready || unsupported) return;
    dispose();
    const token = generation.current;
    setError(""); setElapsed(0); setPosition(0);
    chunks.current = []; completeRef.current = false; timingRef.current = null;
    timelineRef.current = new SimultaneousTimeline();
    callbacks.current.onReset(); change("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (!mounted.current || token !== generation.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      const type = preferredRecordingType();
      const recorder = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (token === generation.current && event.data.size) chunks.current.push(event.data); };
      recorder.onerror = () => { if (token === generation.current) fail("A gravação foi interrompida. Tente novamente."); };
      recorder.onstop = () => {
        if (!mounted.current || token !== generation.current) return;
        release(); recorderRef.current = null;
        const blob = new Blob(chunks.current, { type: recorder.mimeType || chunks.current[0]?.type });
        const timing = timingRef.current;
        if (!blob.size || !blob.type || !timing?.source_completed || !timing.segments.length) { fail("Não foi possível preparar a gravação completa. Tente novamente."); return; }
        change("completed");
        callbacks.current.onComplete(blob, timing.recording_duration_seconds, timing, url);
      };
      const source = sourceRef.current!;
      source.currentTime = 0; source.playbackRate = rate;
      recorder.start(); timelineRef.current.resume(); change("recording");
      try { await source.play(); if (token !== generation.current || !mounted.current) source.pause(); }
      catch { if (token === generation.current) fail("O navegador não iniciou o áudio original. Tente iniciar novamente."); }
    } catch (cause) { if (mounted.current && token === generation.current) fail(microphoneError(cause)); }
  };
  const pause = () => {
    if (!["recording", "finishing"].includes(stateRef.current)) return;
    const source = sourceRef.current!;
    timelineRef.current.pause(source.currentTime);
    source.pause(); recorderRef.current?.pause(); change("paused");
  };
  const resume = async () => {
    if (stateRef.current !== "paused") return;
    const token = generation.current;
    recorderRef.current?.resume(); timelineRef.current.resume();
    change(completeRef.current ? "finishing" : "recording");
    if (!completeRef.current) {
      const source = sourceRef.current;
      try { await source?.play(); if (token !== generation.current || !mounted.current) source?.pause(); }
      catch { if (token === generation.current) fail("Não foi possível retomar o áudio original. Grave novamente."); }
    }
  };
  const stop = () => {
    if (!completeRef.current || !["finishing", "paused"].includes(stateRef.current)) return;
    const source = sourceRef.current!;
    timingRef.current = timelineRef.current.finish(source.currentTime, source.duration, true);
    source.pause(); change("stopping"); recorderRef.current?.stop();
  };
  const cancel = () => { dispose(); setError(""); setElapsed(0); setPosition(0); change("idle"); callbacks.current.onReset(); };

  const status: Record<State, { text: string; icon: ReactNode }> = {
    idle: ready ? { text: "Áudio pronto. Inicie quando estiver preparado.", icon: <CheckCircle2 className="text-success" /> } : { text: "Prepare o áudio para começar.", icon: <Headphones className="text-ink-secondary" /> },
    requesting: { text: "Aguardando acesso ao microfone...", icon: <Loader2 className="text-primary motion-safe:animate-spin" /> },
    recording: { text: "Original em reprodução e microfone gravando.", icon: <span className="flex size-5 items-center justify-center"><span className="size-2.5 rounded-full bg-danger motion-safe:animate-pulse" /></span> },
    paused: { text: "Áudio e gravação pausados.", icon: <Pause className="text-ink-secondary" /> },
    finishing: { text: "O original terminou. Conclua sua frase e finalize a gravação (até 15 segundos).", icon: <Mic className="text-danger" /> },
    stopping: { text: "Preparando gravação...", icon: <Loader2 className="text-primary motion-safe:animate-spin" /> },
    completed: { text: "Gravação pronta. Revise os dois áudios antes de enviar.", icon: <CheckCircle2 className="text-success" /> },
    error: { text: "Você pode preparar o áudio e tentar novamente.", icon: <AlertTriangle className="text-warning" /> },
  };
  const current = status[state];

  return <section aria-label="Gravação simultânea" className="min-w-0 space-y-4 rounded-lg bg-surface-muted p-4">
    <div className="flex items-start gap-3">
      <IconTile icon={Mic} size="sm" className="bg-surface" />
      <div className="min-w-0">
        <h3 className="text-body font-semibold text-ink">Interpretação simultânea</h3>
        <p className="mt-1 text-body text-ink">Use fones. O áudio original continua enquanto você interpreta. O microfone grava somente sua interpretação.</p>
      </div>
    </div>
    <audio ref={sourceRef} aria-label="Áudio original da simultânea" src={absoluteMediaUrl(url) || undefined} preload="auto"
      onCanPlay={() => { const seconds = sourceRef.current?.duration; if (seconds && Number.isFinite(seconds) && seconds <= 600) { setReady(true); } else { fail("Não foi possível identificar a duração do original. Prepare o áudio novamente."); } }}
      onLoadedMetadata={() => { const audio = sourceRef.current!; if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration); }}
      onTimeUpdate={() => setPosition(sourceRef.current?.currentTime || 0)}
      onPlaying={() => { if (recorderRef.current?.state === "recording") timelineRef.current.beginSource(sourceRef.current!.currentTime, sourceRef.current!.playbackRate); }}
      onWaiting={() => timelineRef.current.endSource(sourceRef.current?.currentTime || 0)}
      onPause={() => timelineRef.current.endSource(sourceRef.current?.currentTime || 0)}
      onEnded={() => {
        if (!recorderRef.current || !["recording", "paused"].includes(stateRef.current)) return;
        timelineRef.current.endSource(sourceRef.current!.duration); completeRef.current = true;
        if (stateRef.current !== "paused") change("finishing");
      }}
      onError={() => { if (url) { setReady(false); fail("Não foi possível reproduzir o original. Prepare o áudio novamente."); } }} />
    <p role="status" className="flex items-start gap-2 rounded-md bg-surface px-3 py-2 text-body text-ink [&_svg]:mt-0.5 [&_svg]:size-5 [&_svg]:shrink-0">
      <span aria-hidden="true" className="contents">{current.icon}</span>{current.text}
    </p>
    <div className="space-y-2">
      <ProgressBar value={Math.min(Math.round(position), Math.round(duration))} max={Math.max(1, Math.round(duration))} label="Andamento da fala original" trackClassName="bg-surface" />
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-body text-ink">
        <p>Fala original: <span aria-label="Tempo do original" className="tabular-nums text-ink">{audioTime(position)} / {audioTime(duration)}</span></p>
        <p>Gravação: <span aria-label="Tempo da simultânea" className="tabular-nums text-ink">{audioTime(elapsed)}</span></p>
      </div>
    </div>
    <label className="flex flex-wrap items-center gap-2 text-body text-ink">Velocidade do original
      <select aria-label="Velocidade da simultânea" className={cn(inputClasses, "min-h-11 w-auto px-3")} value={rate} disabled={disabled || ["requesting", "stopping", "finishing"].includes(state)} onChange={(e) => {
        const value = Number(e.target.value); const source = sourceRef.current;
        if (source && stateRef.current === "recording" && !source.paused) timelineRef.current.beginSource(source.currentTime, value);
        if (source) source.playbackRate = value;
        setRate(value);
      }}>{SIMULTANEOUS_RATES.map((value) => <option key={value} value={value}>{value}x</option>)}</select>
    </label>
    <div className="flex flex-wrap gap-2 [&>button]:h-auto [&>button]:whitespace-normal [&>button]:py-2">
      {!ready && !active ? <Button variant="outline" disabled={disabled} loading={loading} loadingLabel="Preparando áudio…" onClick={() => void prepare()}><Headphones aria-hidden="true" />Preparar áudio</Button> : null}
      {!active ? <Button variant={state === "completed" ? "outline" : "primary"} disabled={disabled || !ready || Boolean(unsupported)} onClick={() => void start()}><Mic aria-hidden="true" />{state === "completed" ? "Gravar simultânea novamente" : "Iniciar áudio e gravação"}</Button> : null}
      {state === "recording" || state === "finishing" ? <Button variant="outline" onClick={pause}><Pause aria-hidden="true" />Pausar os dois</Button> : null}
      {state === "paused" ? <Button variant="secondary" onClick={() => void resume()}><Play aria-hidden="true" />Retomar os dois</Button> : null}
      {completeRef.current && (state === "finishing" || state === "paused") ? <Button onClick={stop}><Square aria-hidden="true" />Concluir simultânea</Button> : null}
      {active && state !== "stopping" ? <Button variant="ghost" onClick={cancel}><Trash2 aria-hidden="true" />Cancelar gravação</Button> : null}
    </div>
    {unsupported || error ? <Alert tone="danger" role="alert" title={unsupported || error} /> : null}
  </section>;
};

export default SimultaneousRecorder;
