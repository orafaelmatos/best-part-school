import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  return <section aria-label="Comparação dos dois áudios" className="space-y-3 rounded-2xl border border-border bg-background p-3 sm:p-4">
    <h3 className="text-sm font-semibold">Revisar original e interpretação juntos</h3>
    <audio ref={sourceRef} aria-label="Original na comparação" src={absoluteMediaUrl(originalUrl) || undefined} preload="auto" onError={() => { pause(); setError("Não foi possível carregar o áudio original para comparar."); }} />
    <audio ref={recordingRef} aria-label="Interpretação na comparação" src={recordingUrl.startsWith("blob:") ? recordingUrl : absoluteMediaUrl(recordingUrl) || undefined} preload="auto"
      onEnded={() => { pause(); setPosition(timing.recording_duration_seconds); }}
      onWaiting={() => { bufferingRef.current = true; sourceRef.current?.pause(); }}
      onPlaying={() => { bufferingRef.current = false; if (playingRef.current) void sync(generation.current).catch(() => { pause(); setError("Não foi possível retomar a comparação."); }); }}
      onError={() => { pause(); setError("Não foi possível carregar sua gravação para comparar."); }} />
    <p aria-label="Tempo da comparação" className="text-sm tabular-nums">{audioTime(position)} / {audioTime(timing.recording_duration_seconds)}</p>
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={disabled} className="h-auto min-h-10 whitespace-normal" onClick={() => playing ? pause() : void play()}>{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{playing ? "Pausar comparação" : "Ouvir os dois juntos"}</Button><Button variant="ghost" disabled={disabled} onClick={() => void play(true)}><RotateCcw className="h-4 w-4" />Recomeçar comparação</Button></div>
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs">Volume do original<input aria-label="Volume do original" type="range" min="0" max="1" step="0.1" value={sourceVolume} onChange={(e) => setSourceVolume(Number(e.target.value))} className="mt-2 block w-full" /></label><label className="text-xs">Volume da interpretação<input aria-label="Volume da interpretação" type="range" min="0" max="1" step="0.1" value={recordingVolume} onChange={(e) => setRecordingVolume(Number(e.target.value))} className="mt-2 block w-full" /></label></div>
    <p className="text-xs text-muted-foreground">A revisão acompanha os tempos e as velocidades usados na sua gravação.</p>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
  </section>;
};

export default InterpreterComparisonPlayer;
