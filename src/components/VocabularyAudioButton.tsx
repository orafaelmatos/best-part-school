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
};

const VocabularyAudioButton = ({
  cardId,
  audioUrl,
  audioFileUrl,
  text,
  className = "",
  label = "Ouvir pronúncia",
  onGenerated,
}: Props) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoplayAfterGenerateRef = useRef(false);
  const resolvedAudioUrl = resolveVocabularyAudioUrl({
    audio_url: generatedAudioUrl || audioUrl,
    audio_file_url: audioFileUrl,
  });
  const canGenerateAudio = Boolean(cardId && text?.trim());

  const generateAudio = useCallback(async (force = false) => {
    if (!cardId) return;
    setIsLoading(true);
    try {
      const response = await api.post(`/vocabulary-cards/${cardId}/audio/`, force ? { force: true } : {});
      const nextAudioUrl = response.data?.audio_file_url || response.data?.audio_url || "";
      if (nextAudioUrl) {
        setGeneratedAudioUrl(nextAudioUrl);
        onGenerated?.(nextAudioUrl);
      } else {
        setIsLoading(false);
      }
    } catch (error) {
      console.error("Erro ao gerar áudio do card", error);
      setIsLoading(false);
      setIsPlaying(false);
    }
  }, [cardId, onGenerated]);

  const playAudioElement = useCallback(async (audio: HTMLAudioElement) => {
    setIsLoading(true);
    try {
      audio.currentTime = 0;
      await audio.play();
    } catch (error) {
      if (cardId && !audioFileUrl) {
        autoplayAfterGenerateRef.current = true;
        await generateAudio(true);
        return;
      }
      console.error("Erro ao reproduzir áudio do card", error);
      setIsLoading(false);
      setIsPlaying(false);
    }
  }, [audioFileUrl, cardId, generateAudio]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio?.pause();
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.load();
    }
    setIsLoading(false);
    setIsPlaying(false);
  }, [resolvedAudioUrl]);

  useEffect(() => {
    setGeneratedAudioUrl(null);
  }, [audioUrl, audioFileUrl, cardId]);

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
          onPlaying={() => {
            setIsLoading(false);
            setIsPlaying(true);
          }}
          onError={() => {
            setIsLoading(false);
            setIsPlaying(false);
          }}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
        />
      )}
      <button
        type="button"
        onClick={toggleAudio}
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
    </>
  );
};

export default VocabularyAudioButton;
