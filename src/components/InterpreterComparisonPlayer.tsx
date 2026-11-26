import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { Alert, Button, ProgressBar } from "@/components/student/ui";
import { absoluteMediaUrl } from "@/lib/config";
import { audioTime, sourceAtRecordingTime } from "@/lib/simultaneousAudio";
import type { SimultaneousTiming } from "@/lib/interpreter";

type Props = { originalUrl: string; recordingUrl: string; timing: SimultaneousTiming; disabled?: boolean };

const InterpreterComparisonPlayer = ({ originalUrl, recordingUrl, timing, disabled }: Props) => {
  const sourceRef = useRef<HTMLAudioElement>(null);
  const recordingRef = useRef<HTMLAudioElement>(null);
  const generation = useRef(0);
  const playingRef = useRef(false);
  const bufferingRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [error, setError] = useState("");
  const [sourceVolume, setSourceVolume] = useState(0.4);
  const [recordingVolume, setRecordingVolume] = useState(1);

  const pause = () => {
    generation.current++; playingRef.current = false;
    sourceRef.current?.pause(); recordingRef.current?.pause(); setPlaying(false);
  };
  const sync = async (token: number) => {
    const source = sourceRef.current; const recording = recordingRef.current;
    if (!source || !recording) return;
    if (bufferingRef.current) { source.pause(); return; }
    const target = sourceAtRecordingTime(timing, recording.currentTime);
    if (Math.abs(source.currentTime - target.position) > 0.2) source.currentTime = target.position;
    source.playbackRate = target.rate;
    if (!target.playing) { source.pause(); return; }
    if (source.paused) {
      await source.play();
      if (token !== generation.current || !playingRef.current) source.pause();
    }
  };
  useEffect(() => {
    const source = sourceRef.current; const recording = recordingRef.current;
    return () => { generation.current++; playingRef.current = false; source?.pause(); recording?.pause(); };
  }, [originalUrl, recordingUrl]);
  useEffect(() => { if (disabled) pause(); }, [disabled]);
  useEffect(() => { if (sourceRef.current) sourceRef.current.volume = sourceVolume; }, [sourceVolume]);
  useEffect(() => { if (recordingRef.current) recordingRef.current.volume = recordingVolume; }, [recordingVolume]);
  useEffect(() => {
    if (!playing) return;
    const token = generation.current;
    const timer = setInterval(() => {
      setPosition(recordingRef.current?.currentTime || 0);
      void sync(token).catch(() => { if (token === generation.current) { pause(); setError("Não foi possível reproduzir os dois áudios. Tente novamente."); } });
    }, 100);
    return () => clearInterval(timer);
  }, [playing, timing]);
  const play = async (restart = false) => {
    if (disabled) return;
    pause(); setError("");
    const token = generation.current;
    const recording = recordingRef.current;
    if (!recording) return;
    if (restart || recording.ended || recording.currentTime >= timing.recording_duration_seconds - 0.05) recording.currentTime = 0;
    playingRef.current = true;
    try {
      // Start both in the same user gesture; the recording is the replay clock.
      await Promise.all([recording.play(), sync(token)]);
      if (token !== generation.current || !playingRef.current) { recording.pause(); return; }
      setPlaying(true);
    } catch { if (token === generation.current) { pause(); setError("Não foi possível iniciar a comparação. Tente novamente."); } }
  };
  const total = timing.recording_duration_seconds;
  return <section aria-label="Comparação dos dois áudios" className="min-w-0 space-y-4 rounded-lg bg-surface-muted p-4">
    <div>
      <h3 className="text-body font-semibold text-ink">Revisar original e interpretação juntos</h3>
      <p className="mt-1 text-body text-ink">A revisão acompanha os tempos e as velocidades usados na sua gravação.</p>
    </div>
    <audio ref={sourceRef} aria-label="Original na comparação" src={absoluteMediaUrl(originalUrl) || undefined} preload="auto" onError={() => { pause(); setError("Não foi possível carregar o áudio original para comparar."); }} />
    <audio ref={recordingRef} aria-label="Interpretação na comparação" src={recordingUrl.startsWith("blob:") ? recordingUrl : absoluteMediaUrl(recordingUrl) || undefined} preload="auto"
      onEnded={() => { pause(); setPosition(total); }}
      onWaiting={() => { bufferingRef.current = true; sourceRef.current?.pause(); }}
      onPlaying={() => { bufferingRef.current = false; if (playingRef.current) void sync(generation.current).catch(() => { pause(); setError("Não foi possível retomar a comparação."); }); }}
      onError={() => { pause(); setError("Não foi possível carregar sua gravação para comparar."); }} />
    <div className="space-y-2">
      <ProgressBar value={Math.min(Math.round(position), Math.round(total))} max={Math.max(1, Math.round(total))} label="Andamento da comparação" trackClassName="bg-surface" />
      <p aria-label="Tempo da comparação" className="text-body tabular-nums text-ink">{audioTime(position)} / {audioTime(total)}</p>
    </div>
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" disabled={disabled} className="h-auto whitespace-normal py-2" onClick={() => playing ? pause() : void play()}>
        {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}{playing ? "Pausar comparação" : "Ouvir os dois juntos"}
      </Button>
      <Button variant="ghost" disabled={disabled} className="h-auto whitespace-normal py-2" onClick={() => void play(true)}><RotateCcw aria-hidden="true" />Recomeçar comparação</Button>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-body text-ink">Volume do original
        <input aria-label="Volume do original" type="range" min="0" max="1" step="0.1" value={sourceVolume} onChange={(e) => setSourceVolume(Number(e.target.value))} className="mt-1 block h-11 w-full accent-primary" />
      </label>
      <label className="block text-body text-ink">Volume da interpretação
        <input aria-label="Volume da interpretação" type="range" min="0" max="1" step="0.1" value={recordingVolume} onChange={(e) => setRecordingVolume(Number(e.target.value))} className="mt-1 block h-11 w-full accent-primary" />
      </label>
    </div>
    {error ? <Alert tone="danger" role="alert" title={error} /> : null}
  </section>;
};

export default InterpreterComparisonPlayer;
