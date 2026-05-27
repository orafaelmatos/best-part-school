import { useState } from "react";
import { Loader2, Volume2 } from "lucide-react";
import { api } from "@/lib/api";
import AudioPlayer from "@/components/AudioPlayer";

export type SpeakingFeedback = {
  id: string;
  transcript: string;
  pronunciation_score: number;
  fluency_score: number;
  grammar_score: number;
  vocabulary_score: number;
  ai_feedback: string;
  corrected_sentence: string;
  natural_sentence: string;
  pronunciation_mistakes: string[];
  grammar_explanation: string;
  vocabulary_suggestions: string[];
  native_alternative_sentence: string;
  tts_audio_url?: string | null;
};

const absoluteMediaUrl = (url?: string | null) => {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return `http://localhost:8000${url}`;
};

const Score = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-lg border border-border bg-background p-3">
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}/100</span>
    </div>
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  </div>
);

const PronunciationFeedback = ({ feedback }: { feedback: SpeakingFeedback }) => {
  const [ttsUrl, setTtsUrl] = useState(feedback.tts_audio_url || "");
  const [loadingTts, setLoadingTts] = useState(false);

  const generateTts = async () => {
    setLoadingTts(true);
    try {
      const res = await api.post(`/ai-study/feedback/${feedback.id}/tts/`);
      setTtsUrl(res.data.audio_url);
    } finally {
      setLoadingTts(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <div>
        <p className="text-sm font-semibold">Pronunciation analysis</p>
        <p className="text-xs text-muted-foreground">Correção manual não é automática; esta análise serve como guia de estudo.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Score label="Pronúncia" value={feedback.pronunciation_score} />
        <Score label="Fluência" value={feedback.fluency_score} />
        <Score label="Gramática" value={feedback.grammar_score} />
        <Score label="Vocabulário" value={feedback.vocabulary_score} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-lg bg-muted p-3">
          <p className="text-xs font-medium uppercase text-muted-foreground">Original</p>
          <p className="mt-1 text-sm">{feedback.transcript}</p>
        </div>
        <div className="rounded-lg bg-muted p-3">
          <p className="text-xs font-medium uppercase text-muted-foreground">Corrigida</p>
          <p className="mt-1 text-sm">{feedback.corrected_sentence || "Sem correção necessária."}</p>
        </div>
        <div className="rounded-lg bg-muted p-3">
          <p className="text-xs font-medium uppercase text-muted-foreground">Natural / nativa</p>
          <p className="mt-1 text-sm">{feedback.natural_sentence || feedback.native_alternative_sentence || "Sem alternativa sugerida."}</p>
        </div>
      </div>

      <p className="text-sm leading-6">{feedback.ai_feedback}</p>

      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Pronúncia</p>
          <ul className="space-y-1 text-sm">
            {(feedback.pronunciation_mistakes || []).map((item) => <li key={item} className="rounded-md bg-muted px-2 py-1">{item}</li>)}
            {!feedback.pronunciation_mistakes?.length && <li className="text-muted-foreground">Nenhum problema marcante.</li>}
          </ul>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Vocabulário</p>
          <ul className="space-y-1 text-sm">
            {(feedback.vocabulary_suggestions || []).map((item) => <li key={item} className="rounded-md bg-muted px-2 py-1">{item}</li>)}
            {!feedback.vocabulary_suggestions?.length && <li className="text-muted-foreground">Vocabulário adequado.</li>}
          </ul>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Gramática</p>
          <p className="rounded-md bg-muted px-2 py-1 text-sm">{feedback.grammar_explanation || "Sem observações gramaticais."}</p>
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={generateTts}
          disabled={loadingTts}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {loadingTts ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
          Ouvir pronúncia correta
        </button>
        <AudioPlayer src={absoluteMediaUrl(ttsUrl)} />
      </div>
    </div>
  );
};

export default PronunciationFeedback;
