import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { Loader2, Pause, Play, Volume2 } from "lucide-react";
import { resolveVocabularyAudioUrl } from "@/lib/vocabularyAudio";

type Props = {
  audioUrl?: string | null;
  audioFileUrl?: string | null;
  text?: string | null;
  className?: string;
  label?: string;
};

const VocabularyAudioButton = ({ audioUrl, audioFileUrl, text, className = "", label = "Ouvir pronúncia" }: Props) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const resolvedAudioUrl = resolveVocabularyAudioUrl({
    audio_url: audioUrl,
    audio_file_url: audioFileUrl,
  });
  const normalizedText = (text || "").trim();
  const canUseSpeechFallback = typeof window !== "undefined" && "speechSynthesis" in window && Boolean(normalizedText);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio?.pause();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.load();
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsLoading(false);
    setIsPlaying(false);
  }, [resolvedAudioUrl]);

  if (!resolvedAudioUrl && !canUseSpeechFallback) return null;

  const speakText = () => {
    if (!canUseSpeechFallback || typeof window === "undefined") return false;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(normalizedText);
    utterance.lang = "en-US";
    utterance.rate = 0.9;
    utterance.pitch = 1;

    const englishVoice = window.speechSynthesis
      .getVoices()
      .find((voice) => voice.lang.toLowerCase().startsWith("en"));
    if (englishVoice) {
      utterance.voice = englishVoice;
    }

    utterance.onstart = () => {
      setIsLoading(false);
      setIsPlaying(true);
    };
    utterance.onend = () => {
      setIsPlaying(false);
    };
    utterance.onerror = () => {
      setIsLoading(false);
      setIsPlaying(false);
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    return true;
  };

  const toggleAudio = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    if (typeof window !== "undefined" && "speechSynthesis" in window && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      setIsLoading(false);
      return;
    }

    const audio = audioRef.current;
    if (!audio || !resolvedAudioUrl) {
      speakText();
      return;
    }

    if (!audio.paused) {
      audio.pause();
      return;
    }

    setIsLoading(true);
    try {
      audio.currentTime = 0;
      await audio.play();
    } catch (error) {
      const fallbackWorked = speakText();
      if (!fallbackWorked) {
        console.error("Erro ao reproduzir áudio do card", error);
        setIsLoading(false);
        setIsPlaying(false);
      }
    }
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
