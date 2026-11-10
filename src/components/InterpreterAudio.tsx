import { useEffect, useRef, useState } from "react";
import { Headphones, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { absoluteMediaUrl } from "@/lib/config";
import { audioRequestError } from "@/lib/speakingAudio";

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

  return <div className="space-y-2">
    {!url ? <Button type="button" variant="outline" className="h-auto min-h-10 max-w-full whitespace-normal" onClick={() => void load()} disabled={loading || disabled}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Headphones className="h-4 w-4" />}{loading ? "Preparando áudio..." : label}
    </Button> : <div className="space-y-2 rounded-2xl border border-border bg-background p-3">
      <p className="text-sm font-medium">{label}</p>
      <audio ref={audioRef} aria-label={label} src={absoluteMediaUrl(url) || undefined} controls preload="metadata" className="w-full min-w-0 max-w-full"
        onPlay={() => { if (disabled) { audioRef.current?.pause(); return; } onPlayingChange?.(true); }}
        onPause={() => onPlayingChange?.(false)} onEnded={() => { onPlayingChange?.(false); onEnded?.(); }}
        onLoadedMetadata={() => { if (audioRef.current) audioRef.current.playbackRate = rate; }}
        onError={() => { onPlayingChange?.(false); setError("Não foi possível reproduzir o áudio. Tente carregá-lo novamente."); }} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => {
          const player = audioRef.current;
          if (!player) return;
          player.currentTime = 0;
          void player.play().catch(() => setError("Use o botão de reprodução para ouvir o áudio."));
        }}><RotateCcw className="h-4 w-4" />Ouvir novamente</Button>
        <label className="text-xs">Velocidade <select aria-label={`Velocidade: ${label}`} className="ml-2 rounded-md border bg-background p-2" value={rate} onChange={(e) => setRate(Number(e.target.value))}>
          {[0.6, 0.75, 0.8, 0.9, 1, 1.25].map((value) => <option key={value} value={value}>{value}x</option>)}
        </select></label>
      </div>
    </div>}
    {error ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button type="button" size="sm" variant="outline" disabled={loading || disabled} onClick={() => { setUrl(""); void load(); }}>Tentar áudio novamente</Button></div> : null}
  </div>;
};

export default InterpreterAudio;
