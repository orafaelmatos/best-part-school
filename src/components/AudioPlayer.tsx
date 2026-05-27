import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { Loader2, Pause, Play } from "lucide-react";

const formatDuration = (seconds: number) => {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remaining}`;
};

const AudioPlayer = ({ src, compact = false }: { src?: string | null; compact?: boolean }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const waveSurferRef = useRef<WaveSurfer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    if (!containerRef.current || !src) return;

    setIsReady(false);
    setIsPlaying(false);

    const waveSurfer = WaveSurfer.create({
      container: containerRef.current,
      url: src,
      waveColor: "#d4d4d4",
      progressColor: "#171717",
      cursorColor: "transparent",
      height: compact ? 32 : 48,
      barWidth: 2,
      barGap: 2,
      barRadius: 2,
      normalize: true,
    });

    waveSurferRef.current = waveSurfer;
    waveSurfer.on("ready", () => {
      setDuration(waveSurfer.getDuration());
      waveSurfer.setPlaybackRate(speed);
      setIsReady(true);
    });
    waveSurfer.on("play", () => setIsPlaying(true));
    waveSurfer.on("pause", () => setIsPlaying(false));
    waveSurfer.on("finish", () => setIsPlaying(false));

    return () => {
      waveSurfer.destroy();
      waveSurferRef.current = null;
    };
  }, [compact, src]);

  useEffect(() => {
    waveSurferRef.current?.setPlaybackRate(speed);
  }, [speed]);

  if (!src) return null;

  return (
    <div className="flex w-full items-center gap-3 rounded-xl border border-border bg-background p-3">
      <button
        type="button"
        onClick={() => waveSurferRef.current?.playPause()}
        disabled={!isReady}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
        aria-label={isPlaying ? "Pausar audio" : "Tocar audio"}
      >
        {!isReady ? <Loader2 className="h-4 w-4 animate-spin" /> : isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <div ref={containerRef} className="w-full" />
      </div>
      <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">{formatDuration(duration)}</span>
      <select
        value={speed}
        onChange={(event) => setSpeed(Number(event.target.value))}
        className="rounded-md border border-border bg-card px-2 py-1 text-xs"
      >
        <option value={0.75}>0.75x</option>
        <option value={1}>1x</option>
        <option value={1.25}>1.25x</option>
        <option value={1.5}>1.5x</option>
      </select>
    </div>
  );
};

export default AudioPlayer;
