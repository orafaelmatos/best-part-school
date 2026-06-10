import { useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Volume2 } from "lucide-react";
import { api } from "@/lib/api";
import AudioPlayer from "@/components/AudioPlayer";
import { absoluteMediaUrl } from "@/lib/config";

export type SpeakingFeedback = {
  id: string;
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

const Score = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-2xl border border-border/70 bg-background/90 px-3 py-2.5">
    <div className="flex items-center justify-between gap-3 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}/100</span>
    </div>
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  </div>
);

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
            Feedback orientado para estudo, com foco em pronúncia, fluência e naturalidade.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-slate-900 px-3 py-1 font-semibold text-white">
              Score {feedback.overall_score}/100
            </span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
              Nível {feedback.estimated_level || "A2"}
            </span>
          </div>
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

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Score label="Pronúncia" value={feedback.pronunciation_score} />
        <Score label="Fluência" value={feedback.fluency_score} />
        <Score label="Entonação" value={feedback.intonation_score} />
        <Score label="Clareza" value={feedback.clarity_score} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Resumo</p>
          <p className="mt-2 text-sm leading-6 text-foreground">{feedback.ai_feedback}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/70 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Versão mais natural</p>
          <p className="mt-2 text-sm leading-6 text-emerald-950">
            {feedback.natural_sentence || feedback.native_alternative_sentence || feedback.corrected_sentence || "Sem alternativa sugerida."}
          </p>
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

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/70 p-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Acertos</p>
              <ul className="space-y-2 text-sm">
                {(feedback.correct_words || []).map((item) => (
                  <li key={item} className="rounded-xl bg-white/80 px-3 py-2 text-emerald-950">
                    {item}
                  </li>
                ))}
                {!feedback.correct_words?.length && <li className="text-emerald-800/80">Nenhum destaque registrado.</li>}
              </ul>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Palavras para melhorar</p>
              <ul className="space-y-2 text-sm">
                {(feedback.problem_words || []).map((item) => (
                  <li key={item} className="rounded-xl bg-muted px-3 py-2">
                    {item}
                  </li>
                ))}
                {!feedback.problem_words?.length && <li className="text-muted-foreground">Nenhuma palavra crítica.</li>}
              </ul>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Ajustes de pronúncia</p>
              <ul className="space-y-2 text-sm">
                {(feedback.pronunciation_mistakes || []).map((item) => (
                  <li key={item} className="rounded-xl bg-muted px-3 py-2">
                    {item}
                  </li>
                ))}
                {!feedback.pronunciation_mistakes?.length && <li className="text-muted-foreground">Nenhum problema marcante.</li>}
              </ul>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Exercícios sugeridos</p>
              <ul className="space-y-2 text-sm">
                {(feedback.practice_exercises || []).map((item) => (
                  <li key={item} className="rounded-xl bg-muted px-3 py-2">
                    {item}
                  </li>
                ))}
                {!feedback.practice_exercises?.length && <li className="text-muted-foreground">Sem exercícios extras no momento.</li>}
              </ul>
            </div>
          </div>

          {(feedback.error_details?.length || feedback.improvement_tips?.length || feedback.vocabulary_suggestions?.length) && (
            <div className="grid gap-3 lg:grid-cols-3">
              <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Erros explicados</p>
                <ul className="space-y-2 text-sm">
                  {(feedback.error_details || []).map((item, index) => (
                    <li key={`${item.word || "detail"}-${index}`} className="rounded-xl bg-muted px-3 py-2">
                      <p className="font-medium">{item.word || "Detalhe"}</p>
                      <p className="text-muted-foreground">{item.issue}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.tip}</p>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Como melhorar</p>
                <ul className="space-y-2 text-sm">
                  {(feedback.improvement_tips || []).map((item) => (
                    <li key={item} className="rounded-xl bg-muted px-3 py-2">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Vocabulário útil</p>
                <ul className="space-y-2 text-sm">
                  {(feedback.vocabulary_suggestions || []).map((item) => (
                    <li key={item} className="rounded-xl bg-muted px-3 py-2">
                      {item}
                    </li>
                  ))}
                  {!feedback.vocabulary_suggestions?.length && <li className="text-muted-foreground">Nenhuma sugestão adicional.</li>}
                </ul>
              </div>
            </div>
          )}

          <div className="space-y-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={generateTts}
              disabled={loadingTts}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {loadingTts ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
              Ouvir pronúncia correta
            </button>
            <AudioPlayer src={absoluteMediaUrl(ttsUrl)} />
          </div>
        </>
      ) : null}
    </div>
  );
};

export default PronunciationFeedback;
