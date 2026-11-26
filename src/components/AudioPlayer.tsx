import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { AlertCircle, Loader2, Pause, Play } from "lucide-react";
import { Button } from "@/components/student/ui";
import { colors } from "@/design-system/tokens";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

const formatDuration = (seconds: number) => {
  if (!Number.isFinite(seconds)) return "0:00";
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
};

const AudioPlayer = ({ src, compact = false }: { src?: string | null; compact?: boolean }) => {
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<WaveSurfer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!containerRef.current || !src) return;
    let active = true;
    let player: WaveSurfer | undefined;
    setIsReady(false);
    setIsPlaying(false);
    setError("");
    const fail = () => {
      if (!active) return;
      clearTimeout(timer);
      setIsReady(false);
      setIsPlaying(false);
      setError("Não foi possível reproduzir o áudio. Você pode continuar pelo texto ou tentar novamente.");
    };
    const timer = setTimeout(fail, 20_000);
    try {
      player = WaveSurfer.create({ container: containerRef.current, url: src,
        waveColor: colors.disabled, progressColor: colors.primary, cursorColor: "transparent",
        height: compact ? 32 : 48, barWidth: 2, barGap: 2, barRadius: 2, normalize: true });
      playerRef.current = player;
      player.on("ready", () => {
        if (!active || !player) return;
        clearTimeout(timer);
        setDuration(player.getDuration());
        player.setPlaybackRate(speedRef.current);
        setError("");
        setIsReady(true);
      });
      player.on("play", () => { if (active) setIsPlaying(true); });
      player.on("pause", () => { if (active) setIsPlaying(false); });
      player.on("finish", () => { if (active) setIsPlaying(false); });
      player.on("error", fail);
    } catch { fail(); }
    return () => {
      active = false;
      clearTimeout(timer);
      player?.destroy();
      playerRef.current = null;
    };
  }, [compact, src, retry]);

  useEffect(() => { playerRef.current?.setPlaybackRate(speed); }, [speed]);
  if (!src) return null;

  return (
    <div className="w-full space-y-2 rounded-lg border border-line bg-surface p-2 text-ink">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <button type="button" disabled={!isReady} aria-label={isPlaying ? "Pausar áudio" : "Tocar áudio"}
          onClick={async () => {
            const player = playerRef.current;
            try { await player?.playPause(); }
            catch { if (playerRef.current === player) { setIsPlaying(false); setError("Não consegui iniciar a reprodução. Tente novamente ou continue pelo texto."); } }
          }}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full transition-colors duration-150 ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50",
            error ? "bg-surface-muted text-ink-secondary" : "bg-primary text-primary-foreground hover:bg-primary-dark",
          )}>
          {error ? <AlertCircle size={20} aria-hidden="true" /> : !isReady ? <Loader2 size={20} className="animate-spin" aria-hidden="true" /> : isPlaying ? <Pause size={20} aria-hidden="true" /> : <Play size={20} aria-hidden="true" />}
        </button>
        <div ref={containerRef} className="min-w-0 flex-1" />
        <span className="shrink-0 text-caption tabular-nums text-ink-secondary">{formatDuration(duration)}</span>
        <select aria-label="Velocidade do áudio" value={speed} disabled={!isReady}
          onChange={(event) => setSpeed(Number(event.target.value))}
          className="min-h-11 max-w-20 shrink-0 rounded-md border border-line bg-surface px-1 text-caption text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">
          <option value={0.75}>0.75x</option><option value={1}>1x</option><option value={1.25}>1.25x</option><option value={1.5}>1.5x</option>
        </select>
      </div>
      {!isReady && !error ? <span role="status" className="sr-only">Carregando áudio...</span> : null}
      {error ? <div className="space-y-2 px-1 pb-1"><p role="alert" className="text-body text-ink-secondary">{error}</p>
        <Button type="button" size="sm" variant="outline" onClick={() => { void queryClient.invalidateQueries(); setRetry((value) => value + 1); }}>Tentar áudio novamente</Button>
      </div> : null}
    </div>
  );
};

export default AudioPlayer;
