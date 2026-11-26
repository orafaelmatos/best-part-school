import { useEffect, useRef, useState } from "react";
import { Headphones, RotateCcw } from "lucide-react";
import { Alert, Button, inputClasses } from "@/components/student/ui";
import { api } from "@/lib/api";
import { absoluteMediaUrl } from "@/lib/config";
import { audioRequestError } from "@/lib/speakingAudio";
import { cn } from "@/lib/utils";

type Props = {
  sessionId: string;
  messageId?: string;
  part: "original" | "suggested" | "vocabulary" | "example";
  vocabularyIndex?: number;
  label: string;
  initialUrl?: string | null;
  speed?: number;
  disabled?: boolean;
  onPlayingChange?: (playing: boolean) => void;
  onEnded?: () => void;
};

const SPEEDS = [0.6, 0.75, 0.8, 0.9, 1, 1.25];

const InterpreterAudio = ({ sessionId, messageId, part, vocabularyIndex, label, initialUrl, speed = 1, disabled, onPlayingChange, onEnded }: Props) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const mounted = useRef(true);
  const [url, setUrl] = useState(initialUrl || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rate, setRate] = useState(speed);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = rate; }, [rate, url]);
  useEffect(() => { if (disabled) audioRef.current?.pause(); }, [disabled]);

  const load = async () => {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await api.post(`/ai-study/sessions/${sessionId}/interpreter/audio/`, {
        part, ...(messageId ? { message_id: messageId } : {}),
        ...(vocabularyIndex !== undefined ? { vocabulary_index: vocabularyIndex } : {}),
      });
      if (mounted.current) setUrl(response.data.audio_url);
    } catch (cause) { if (mounted.current) setError(audioRequestError(cause)); }
    finally { if (mounted.current) setLoading(false); }
  };

  return <div className="min-w-0 space-y-2">
    {!url ? <Button type="button" variant={part === "original" ? "secondary" : "outline"} className="h-auto max-w-full whitespace-normal py-2 text-left"
      onClick={() => void load()} disabled={disabled} loading={loading} loadingLabel="Preparando áudio…">
      <Headphones aria-hidden="true" />{label}
    </Button> : <div className="min-w-0 space-y-3 rounded-lg bg-surface-muted p-3">
      <p className="flex items-center gap-2 text-body font-medium text-ink"><Headphones size={16} className="shrink-0 text-primary" aria-hidden="true" />{label}</p>
      <audio ref={audioRef} aria-label={label} src={absoluteMediaUrl(url) || undefined} controls preload="metadata" className="w-full min-w-0 max-w-full"
        onPlay={() => { if (disabled) { audioRef.current?.pause(); return; } onPlayingChange?.(true); }}
        onPause={() => onPlayingChange?.(false)} onEnded={() => { onPlayingChange?.(false); onEnded?.(); }}
        onLoadedMetadata={() => { if (audioRef.current) audioRef.current.playbackRate = rate; }}
        onError={() => { onPlayingChange?.(false); setError("Não foi possível reproduzir o áudio. Tente carregá-lo novamente."); }} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => {
          const player = audioRef.current;
          if (!player) return;
          player.currentTime = 0;
          void player.play().catch(() => setError("Use o botão de reprodução para ouvir o áudio."));
        }}><RotateCcw aria-hidden="true" />Ouvir novamente</Button>
        <label className="flex items-center gap-2 text-body text-ink">Velocidade
          <select aria-label={`Velocidade: ${label}`} className={cn(inputClasses, "min-h-11 w-auto px-3")} value={rate} onChange={(e) => setRate(Number(e.target.value))}>
            {SPEEDS.map((value) => <option key={value} value={value}>{value}x</option>)}
          </select>
        </label>
      </div>
    </div>}
    {error ? <Alert tone="danger" role="alert" title={error}
      action={<Button type="button" size="sm" variant="outline" disabled={loading || disabled} onClick={() => { setUrl(""); void load(); }}>Tentar áudio novamente</Button>} /> : null}
  </div>;
};

export default InterpreterAudio;
