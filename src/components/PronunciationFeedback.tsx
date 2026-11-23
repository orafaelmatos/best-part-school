import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, Volume2 } from "lucide-react";
import { api } from "@/lib/api";
import AudioPlayer from "@/components/AudioPlayer";
import { absoluteMediaUrl } from "@/lib/config";
import { Button } from "@/components/ui/button";

export type LearningFeedback = {
  feedback_version: number;
  summary?: string;
  suggested_sentence: string;
  suggested_translation?: string;
  full_sentence?: string;
  full_translation?: string;
  comments?: string[];
  grammar?: { status: "correct" | "needs_work" | "not_assessed"; explanation: string };
  naturalness?: { status: "natural" | "alternative" | "not_assessed"; explanation: string };
  pronunciation: { status: "not_assessed"; source: "transcript"; score: null; explanation: string };
  changes?: Array<{ before: string; after: string; kind: "grammar" | "naturalness"; explanation: string }>;
  chunks: string[];
  needs_clarification?: boolean;
  clarification_question?: string;
  comparison?: string;
  previous_feedback_id?: string | null;
  practice_target?: string;
  feedback_language?: "pt-BR" | "en";
  analysis_unavailable?: boolean;
};

export type SpeakingFeedback = {
  id: string;
  audio_url?: string | null;
  transcript: string;
  overall_score: number | null;
  estimated_level: string;
  pronunciation_score: number | null;
  fluency_score: number | null;
  intonation_score: number | null;
  clarity_score: number | null;
  ai_feedback: string;
  corrected_sentence: string;
  natural_sentence: string;
  correct_words: string[];
  problem_words: string[];
  pronunciation_mistakes: string[];
  error_details?: Array<{ word?: string; issue?: string; tip?: string }>;
  grammar_explanation: string;
  improvement_tips: string[];
  practice_exercises: string[];
  vocabulary_suggestions: string[];
  native_alternative_sentence: string;
  tts_audio_url?: string | null;
  learning_feedback?: LearningFeedback;
};

// The server selects the saved phrase and returns its text for verification.
const FeedbackAudio = ({ feedbackId, text, chunkIndex, fullSentence = false, initialUrl }: {
  feedbackId: string; text: string; chunkIndex?: number; fullSentence?: boolean; initialUrl?: string | null;
}) => {
  const [url, setUrl] = useState(initialUrl || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [speed, setSpeed] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);
  const active = useRef(true);
  const autoplay = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { const audio = audioRef.current; return () => { audio?.pause(); }; }, [url]);
  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = speed; }, [speed, url]);
  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try { audio.currentTime = 0; audio.playbackRate = speed; await audio.play(); }
    catch { if (active.current) setError("Toque no player para ouvir a frase."); }
  }, [speed]);
  useEffect(() => {
    if (url && autoplay.current) { autoplay.current = false; void play(); }
  }, [url, play]);
  const listen = async () => {
    setError("");
    if (url) { await play(); return; }
    setLoading(true);
    try {
      const response = await api.post(`/ai-study/feedback/${feedbackId}/tts/`, {
        ...(chunkIndex === undefined ? {} : { chunk_index: chunkIndex }), full_sentence: fullSentence,
      }, { timeout: 60_000 });
      if (!active.current) return;
      if (response.data.text !== text || !response.data.audio_url) throw new Error("A frase do áudio não corresponde ao texto.");
      autoplay.current = true;
      setUrl(response.data.audio_url);
    } catch {
      if (active.current) setError("Não consegui gerar o áudio agora. Tente novamente ou continue pelo texto.");
    } finally { if (active.current) setLoading(false); }
  };
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void listen()}>
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Volume2 className="mr-2 h-4 w-4" />}
        {loading ? "Preparando áudio…" : url ? "Ouvir novamente" : "Ouvir pronúncia"}
      </Button>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">Velocidade
        <select aria-label="Velocidade da pronúncia sugerida" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}
          className="rounded-lg border border-border bg-background p-2">
          <option value={0.75}>0,75x</option><option value={1}>1x</option>
        </select>
      </label>
    </div>
    {url ? <audio ref={audioRef} aria-label={`Áudio sugerido: ${text}`} controls preload="metadata" src={absoluteMediaUrl(url)}
      className="w-full max-w-full" onError={() => { setUrl(""); setError("Não consegui reproduzir o áudio. Tente gerar novamente."); }} /> : null}
    {error ? <p role="alert" className="text-xs text-muted-foreground">{error}</p> : null}
  </div>;
};

const PronunciationFeedback = ({ feedback, onRepeat, onContinue, onNextSituation, disabled = false }: {
  feedback: SpeakingFeedback; onRepeat?: (feedback: SpeakingFeedback, chunkIndex?: number) => void;
  onContinue?: () => void; onNextSituation?: () => void; disabled?: boolean;
}) => {
  const details = feedback.learning_feedback;
  const isCurrent = details?.feedback_version === 1;
  const suggested = details?.suggested_sentence ?? (feedback.natural_sentence || feedback.native_alternative_sentence || feedback.corrected_sentence);
  const noChange = suggested === feedback.transcript;
  const [partsOpen, setPartsOpen] = useState(false);
  const summary = isCurrent ? details.summary : "Compare sua gravação com a frase sugerida e pratique no seu ritmo.";
  const statusLabels = { correct: "Correta", needs_work: "Pode melhorar", not_assessed: "Não avaliada", natural: "Natural", alternative: "Alternativa opcional" };
  return <section aria-label="Feedback de Speaking" data-speaking-focus className="space-y-4 rounded-[24px] border border-border/70 bg-card p-4 shadow-sm">
    <p className="text-sm leading-6" lang={details?.feedback_language === "en" ? "en" : "pt-BR"}>{summary}</p>
    <section aria-label="O que você falou" className="space-y-2 rounded-2xl bg-muted/40 p-3">
      <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Mic className="h-4 w-4" />O que você falou</p>
      <p lang="en" className="break-words">{feedback.transcript}</p>
      {feedback.audio_url ? <AudioPlayer src={absoluteMediaUrl(feedback.audio_url)} compact /> : null}
    </section>
    {suggested ? <section aria-label="Uma forma mais natural" className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3">
      <p className="text-xs font-semibold text-emerald-800">{details?.analysis_unavailable ? "Sua frase para praticar" : noChange ? "Sua frase já funciona" : "Uma forma mais natural"}</p>
      <p lang="en" className="break-words text-base font-medium text-emerald-950">{suggested}</p>
      {details?.suggested_translation ? <details className="text-sm"><summary className="cursor-pointer text-emerald-800">Ver tradução</summary>
        <p lang="pt-BR" className="mt-2">{details.suggested_translation}</p></details> : null}
      <FeedbackAudio key={`${feedback.id}:${suggested}`} feedbackId={feedback.id} text={suggested} initialUrl={feedback.tts_audio_url} />
      {details?.changes?.[0] ? <p className="text-sm text-emerald-950">{details.changes[0].explanation}</p> : null}
    </section> : null}
    {details?.comparison ? <p aria-label="Comparação com a tentativa anterior" className="rounded-xl bg-primary/5 p-3 text-sm">{details.comparison}</p> : null}
    {details?.comments?.length ? <section aria-label="O que você pode melhorar">
      <p className="text-xs font-semibold text-muted-foreground">O que você pode melhorar</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{details.comments.slice(0, 3).map((comment, index) => <li key={index}>{comment}</li>)}</ul>
    </section> : null}
    {details?.needs_clarification ? <p className="text-sm font-medium">{details.clarification_question}</p> : null}
    <details className="rounded-xl border border-border p-3 text-sm">
      <summary className="cursor-pointer font-medium">Ver mais detalhes</summary>
      <div className="mt-3 space-y-3">
        <section aria-label="Avaliação de pronúncia"><p className="font-semibold">Pronúncia · Não avaliada</p>
          <p className="mt-1 text-muted-foreground">{details?.pronunciation.explanation || "Sons, sílabas tônicas, ritmo e entonação precisam de análise do áudio. A transcrição sozinha não permite avaliar a pronúncia."}</p></section>
        <section aria-label="Avaliação de gramática"><p className="font-semibold">Gramática · {statusLabels[details?.grammar?.status || "not_assessed"]}</p>
          <p className="mt-1">{details?.grammar?.explanation}</p></section>
        <section aria-label="Avaliação de naturalidade"><p className="font-semibold">Naturalidade · {statusLabels[details?.naturalness?.status || "not_assessed"]}</p>
          <p className="mt-1">{details?.naturalness?.explanation}</p></section>
        {details?.changes?.map((change, index) => <section key={index} className="space-y-1 rounded-xl bg-muted/50 p-3">
          <p className="text-xs font-semibold">{change.kind === "grammar" ? "Ajuste de gramática" : "Sugestão de naturalidade"}</p>
          <p lang="en" className="break-words"><span className="text-muted-foreground">Original: </span>{change.before}</p>
          <p lang="en" className="break-words"><span className="text-muted-foreground">Sugestão: </span>{change.after}</p>
          <p>{change.explanation}</p>
        </section>)}
      </div>
    </details>
    {suggested && !details?.needs_clarification ? <div className="space-y-3 border-t border-border pt-3">
      <p className="text-sm">Agora que você ouviu a frase, que tal tentar falar novamente?</p>
      <div className="flex flex-wrap gap-2">
        {onRepeat ? <Button type="button" size="sm" disabled={disabled} onClick={() => onRepeat(feedback)}>
          <Mic className="mr-2 h-4 w-4" />{details?.practice_target && details.practice_target !== details.full_sentence ? "Tentar frase completa" : "Tentar pronunciar"}
        </Button> : null}
        {details?.chunks?.length ? <Button type="button" size="sm" variant="outline" onClick={() => setPartsOpen(!partsOpen)} aria-expanded={partsOpen}>Praticar por partes</Button> : null}
        {onContinue ? <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={onContinue}>Continuar conversa</Button> : null}
        {onNextSituation ? <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={onNextSituation}>Próxima situação</Button> : null}
      </div>
      {partsOpen ? <div className="space-y-3">{details?.chunks.map((chunk, index) => <section key={chunk + index} className="space-y-2 rounded-xl border border-border p-3">
        <p className="text-xs text-muted-foreground">Etapa {index + 1}</p><p lang="en" className="break-words">{chunk}</p>
        <FeedbackAudio key={`${feedback.id}:${index}:${chunk}`} feedbackId={feedback.id} text={chunk} chunkIndex={index} />
        {onRepeat ? <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={() => onRepeat(feedback, index)}>Repetir trecho {index + 1}</Button> : null}
      </section>)}<section className="space-y-2 rounded-xl border border-primary/30 p-3">
        <p className="text-xs font-semibold">Frase completa</p><p lang="en" className="break-words">{details?.full_sentence || suggested}</p>
        <FeedbackAudio key={`${feedback.id}:full`} feedbackId={feedback.id} text={details?.full_sentence || suggested} fullSentence />
        {details?.full_translation ? <details className="text-sm"><summary className="cursor-pointer">Ver tradução da frase completa</summary><p lang="pt-BR">{details.full_translation}</p></details> : null}
        {onRepeat ? <Button type="button" size="sm" disabled={disabled} onClick={() => onRepeat(feedback)}>Tentar frase completa</Button> : null}
      </section></div> : null}
    </div> : null}
  </section>;
};

export default PronunciationFeedback;
