import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { Loader2, Pause, Play, Volume2 } from "lucide-react";
import { api } from "@/lib/api";
import { resolveVocabularyAudioUrl } from "@/lib/vocabularyAudio";

type Props = {
  cardId?: string | null;
  audioUrl?: string | null;
  audioFileUrl?: string | null;
  text?: string | null;
  className?: string;
  label?: string;
  onGenerated?: (audioUrl: string) => void;
  requestAudio?: () => Promise<string>;
};

const VocabularyAudioButton = ({
  cardId,
  audioUrl,
  audioFileUrl,
  text,
  className = "",
  label = "Ouvir pronúncia",
  onGenerated,
  requestAudio,
}: Props) => {
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoplayAfterGenerateRef = useRef(false);
  const activeRef = useRef(true);
  const requestVersionRef = useRef(0);
  const regeneratedRef = useRef(false);
  const resolvedAudioUrl = resolveVocabularyAudioUrl({
    audio_url: generatedAudioUrl || audioUrl,
    audio_file_url: audioFileUrl,
  });
  const canGenerateAudio = Boolean((cardId || requestAudio) && text?.trim());

  const generateAudio = useCallback(async (force = false) => {
    if (!cardId && !requestAudio) return;
    setIsLoading(true);
    setError("");
    const version = ++requestVersionRef.current;
    try {
      const nextAudioUrl = requestAudio
        ? await requestAudio()
        : await api.post(`/vocabulary-cards/${cardId}/audio/`, force ? { force: true } : {}).then(
            (response) => response.data?.audio_file_url || response.data?.audio_url || "",
          );
      if (!activeRef.current || version !== requestVersionRef.current) return;
      if (nextAudioUrl) {
        setGeneratedAudioUrl(nextAudioUrl);
        onGenerated?.(nextAudioUrl);
      } else {
        setIsLoading(false);
        setError("Áudio indisponível. Você pode continuar com o exemplo escrito.");
      }
    } catch (error) {
      if (!activeRef.current || version !== requestVersionRef.current) return;
      console.error("Erro ao gerar áudio do card", error);
      setIsLoading(false);
      setIsPlaying(false);
      setError("Não foi possível ouvir agora. Você pode continuar com o exemplo escrito.");
    }
  }, [cardId, onGenerated, requestAudio]);

  const playAudioElement = useCallback(async (audio: HTMLAudioElement) => {
    setIsLoading(true);
    setError("");
    const version = requestVersionRef.current;
    try {
      audio.currentTime = 0;
      await audio.play();
      if (activeRef.current && version === requestVersionRef.current) setIsLoading(false);
    } catch (error) {
      if (!activeRef.current || version !== requestVersionRef.current) return;
      const errorName = error && typeof error === "object" && "name" in error ? error.name : "";
      if (cardId && !audioFileUrl && !regeneratedRef.current && errorName !== "NotAllowedError") {
        regeneratedRef.current = true;
        autoplayAfterGenerateRef.current = true;
        await generateAudio(true);
        return;
      }
      console.error("Erro ao reproduzir áudio do card", error);
      setIsLoading(false);
      setIsPlaying(false);
      setError("Não foi possível reproduzir o áudio. Continue pelo texto ou tente novamente.");
    }
  }, [audioFileUrl, cardId, generateAudio]);

  useEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; requestVersionRef.current += 1; };
  }, []);

  useEffect(() => {
    if (!isLoading) return;
    const timer = setTimeout(() => {
      requestVersionRef.current += 1;
      autoplayAfterGenerateRef.current = false;
      audioRef.current?.pause();
      setIsLoading(false);
      setIsPlaying(false);
      setError("O áudio demorou para carregar. Continue pelo texto ou tente novamente.");
    }, 30_000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio?.pause();
    };
  }, [resolvedAudioUrl]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.load();
    }
    setIsLoading(false);
    setIsPlaying(false);
  }, [resolvedAudioUrl]);

  useEffect(() => {
    requestVersionRef.current += 1;
    autoplayAfterGenerateRef.current = false;
    regeneratedRef.current = false;
    setGeneratedAudioUrl(null);
    setError("");
    setIsLoading(false);
  }, [audioUrl, audioFileUrl, cardId, text, requestAudio]);

  useEffect(() => {
    if (!autoplayAfterGenerateRef.current || !resolvedAudioUrl || !audioRef.current) return;
    autoplayAfterGenerateRef.current = false;
    void playAudioElement(audioRef.current);
  }, [playAudioElement, resolvedAudioUrl]);

  if (!resolvedAudioUrl && !canGenerateAudio) return null;

  const toggleAudio = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    const audio = audioRef.current;
    if (!audio || !resolvedAudioUrl) {
      autoplayAfterGenerateRef.current = true;
      await generateAudio();
      return;
    }

    if (!audio.paused) {
      audio.pause();
      return;
    }

    await playAudioElement(audio);
  };

  return (
    <>
      {resolvedAudioUrl && (
        <audio
          ref={audioRef}
          src={resolvedAudioUrl}
          preload="none"
          onCanPlay={() => setIsLoading(false)}
          onWaiting={() => setIsLoading(true)}
          onStalled={() => setIsLoading(true)}
          onPlaying={() => {
            setIsLoading(false);
            setIsPlaying(true);
          }}
          onError={() => {
            setIsLoading(false);
            setIsPlaying(false);
            setError("Não foi possível reproduzir o áudio. Continue pelo texto ou tente novamente.");
          }}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
        />
      )}
      <button
        type="button"
        onClick={toggleAudio}
        disabled={isLoading}
        aria-busy={isLoading}
        className={`inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted ${className}`}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Volume2 className="h-4 w-4" />
        )}
        <span>{isPlaying ? "Pausar áudio" : label}</span>
        {!isLoading && !isPlaying && <Play className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {isLoading ? <span role="status" className="sr-only">Carregando áudio...</span> : null}
      {error ? <p role="alert" className="text-xs text-muted-foreground">{error}</p> : null}
    </>
  );
};

export default VocabularyAudioButton;
