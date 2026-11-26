import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { Loader2, Pause, Volume2 } from "lucide-react";
import { Button, IconButton } from "@/components/student/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
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
  /** Renders a 48px icon-only button; the label becomes its aria-label. */
  iconOnly?: boolean;
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
  iconOnly = false,
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

  const icon = isLoading ? (
    <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
  ) : isPlaying ? (
    <Pause aria-hidden="true" />
  ) : (
    <Volume2 aria-hidden="true" />
  );

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
      {iconOnly ? (
        <IconButton
          type="button"
          variant="outline"
          onClick={toggleAudio}
          disabled={isLoading}
          aria-busy={isLoading}
          aria-label={isPlaying ? "Pausar áudio" : label}
          className={cn("rounded-full", className)}
          icon={icon}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={toggleAudio}
          disabled={isLoading}
          aria-busy={isLoading}
          className={cn("rounded-full font-medium", className)}
        >
          {icon}
          <span>{isPlaying ? "Pausar áudio" : label}</span>
        </Button>
      )}
      {isLoading ? <span role="status" className="sr-only">Carregando áudio...</span> : null}
      {error ? <p role="alert" className="text-caption text-ink">{error}</p> : null}
    </>
  );
};

export default VocabularyAudioButton;
