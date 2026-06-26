import { useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Mic, Volume2 } from "lucide-react";
import { api } from "@/lib/api";
import AudioPlayer from "@/components/AudioPlayer";
import { absoluteMediaUrl } from "@/lib/config";

export type SpeakingFeedback = {
  id: string;
  audio_url?: string | null;
  transcript: string;
  overall_score: number;
  estimated_level: string;
  pronunciation_score: number;
  fluency_score: number;
  intonation_score: number;
  clarity_score: number;
  ai_feedback: string;
  corrected_sentence: string;
  natural_sentence: string;
  correct_words: string[];
  problem_words: string[];
  pronunciation_mistakes: string[];
  error_details?: Array<{
    word?: string;
    issue?: string;
    tip?: string;
  }>;
  grammar_explanation: string;
  improvement_tips: string[];
  practice_exercises: string[];
  vocabulary_suggestions: string[];
  native_alternative_sentence: string;
  tts_audio_url?: string | null;
};

const PronunciationFeedback = ({ feedback }: { feedback: SpeakingFeedback }) => {
  const [ttsUrl, setTtsUrl] = useState(feedback.tts_audio_url || "");
  const [loadingTts, setLoadingTts] = useState(false);
  const [expanded, setExpanded] = useState(false);

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
    <div className="space-y-4 rounded-[28px] border border-border/70 bg-card/95 p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Análise de speaking</p>
          <p className="text-xs text-muted-foreground">
            Feedback orientado para estudo, com foco em clareza, correção e naturalidade.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="inline-flex items-center gap-2 self-start rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? "Ocultar detalhes" : "Ver análise completa"}
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Resumo</p>
          <p className="mt-2 text-sm leading-6 text-foreground">{feedback.ai_feedback}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/70 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Comparar pronúncia</p>
          <div className="mt-3 space-y-3">
            <div className="rounded-2xl bg-white/80 p-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <Mic className="h-3.5 w-3.5" />
                Sua fala
              </div>
              <p className="mt-2 text-sm leading-6 text-foreground">
                {feedback.transcript || "Sem transcrição disponível."}
              </p>
              <div className="mt-3">
                {feedback.audio_url ? (
                  <AudioPlayer src={absoluteMediaUrl(feedback.audio_url)} compact />
                ) : (
                  <p className="text-xs text-muted-foreground">A gravação enviada aparece aqui para comparação.</p>
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-white/80 p-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                <Volume2 className="h-3.5 w-3.5" />
                Pronúncia sugerida
              </div>
              <p className="mt-2 text-sm leading-6 text-emerald-950">
                {feedback.natural_sentence || feedback.native_alternative_sentence || feedback.corrected_sentence || "Sem alternativa sugerida."}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={generateTts}
                  disabled={loadingTts}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {loadingTts ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
                  {ttsUrl ? "Gerar novamente" : "Ouvir pronúncia correta"}
                </button>
                {ttsUrl ? <span className="text-xs text-emerald-800/80">Compare com sua gravação acima.</span> : null}
              </div>
              {ttsUrl ? (
                <div className="mt-3">
                  <AudioPlayer src={absoluteMediaUrl(ttsUrl)} compact />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {expanded ? (
        <>
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-2xl bg-muted/60 p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Original</p>
              <p className="mt-2 text-sm leading-6">{feedback.transcript}</p>
            </div>
            <div className="rounded-2xl bg-muted/60 p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Corrigida</p>
              <p className="mt-2 text-sm leading-6">{feedback.corrected_sentence || "Sem correção necessária."}</p>
            </div>
            <div className="rounded-2xl bg-muted/60 p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Explicação gramatical</p>
              <p className="mt-2 text-sm leading-6">{feedback.grammar_explanation || "Sem observações gramaticais."}</p>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default PronunciationFeedback;
