import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Lightbulb, Loader2, Mic, MinusCircle, Sparkles, Volume2, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import AudioPlayer from "@/components/AudioPlayer";
import { absoluteMediaUrl } from "@/lib/config";
import { Alert, Button, Card, StudyBlock } from "@/components/student/ui";
import { iconStroke } from "@/design-system/tokens";
import { cn } from "@/lib/utils";

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

const summaryClass = "flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-md text-body font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden";

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
      <Button type="button" size="sm" variant="outline" disabled={loading} aria-busy={loading || undefined} onClick={() => void listen()}>
        {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
        {loading ? "Preparando áudio…" : url ? "Ouvir novamente" : "Ouvir pronúncia"}
      </Button>
      <label className="flex items-center gap-2 text-body text-ink">Velocidade
        <select aria-label="Velocidade da pronúncia sugerida" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}
          className="min-h-11 rounded-md border border-line bg-surface px-3 text-body text-ink focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
          <option value={0.75}>0,75x</option><option value={1}>1x</option>
        </select>
      </label>
    </div>
    {url ? <audio ref={audioRef} aria-label={`Áudio sugerido: ${text}`} controls preload="metadata" src={absoluteMediaUrl(url)}
      className="w-full max-w-full" onError={() => { setUrl(""); setError("Não consegui reproduzir o áudio. Tente gerar novamente."); }} /> : null}
    {error ? <p role="alert" className="text-body text-ink">{error}</p> : null}
  </div>;
};

const statusIcons: Record<string, { Icon: LucideIcon; className: string }> = {
  correct: { Icon: CheckCircle2, className: "text-success" },
  natural: { Icon: CheckCircle2, className: "text-success" },
  needs_work: { Icon: AlertTriangle, className: "text-warning" },
  alternative: { Icon: Lightbulb, className: "text-ai" },
  not_assessed: { Icon: MinusCircle, className: "text-ink-muted" },
};

const StatusIcon = ({ status }: { status: string }) => {
  const { Icon, className } = statusIcons[status] || statusIcons.not_assessed;
  return <Icon size={20} strokeWidth={iconStroke} aria-hidden="true" className={cn("shrink-0", className)} />;
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
  const grammarStatus = details?.grammar?.status || "not_assessed";
  const naturalnessStatus = details?.naturalness?.status || "not_assessed";
  return <Card as="section" padding="md" aria-label="Feedback de Speaking" data-speaking-focus className="min-w-0 space-y-4 break-words">
    <div className="flex gap-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-ai-soft text-ai" aria-hidden="true"><Sparkles size={16} /></span>
      <p className="min-w-0 text-body-lg leading-7 text-ink" lang={details?.feedback_language === "en" ? "en" : "pt-BR"}>{summary}</p>
    </div>
    <section aria-label="O que você falou" className="space-y-2 rounded-lg bg-surface-muted px-4 py-3">
      <p className="flex items-center gap-1.5 text-label text-ink"><Mic size={16} strokeWidth={iconStroke} aria-hidden="true" className="shrink-0" />O que você falou</p>
      <p lang="en" className="break-words text-body-lg text-ink">{feedback.transcript}</p>
      {feedback.audio_url ? <AudioPlayer src={absoluteMediaUrl(feedback.audio_url)} compact /> : null}
    </section>
    {suggested ? <section aria-label="Uma forma mais natural" className="space-y-3 rounded-lg bg-success-soft px-4 py-3">
      <p className="flex items-center gap-1.5 text-label text-success">
        {noChange
          ? <CheckCircle2 size={16} strokeWidth={iconStroke} aria-hidden="true" className="shrink-0" />
          : <Lightbulb size={16} strokeWidth={iconStroke} aria-hidden="true" className="shrink-0" />}
        {details?.analysis_unavailable ? "Sua frase para praticar" : noChange ? "Sua frase já funciona" : "Uma forma mais natural"}
      </p>
      <p lang="en" className="break-words text-h4 text-ink">{suggested}</p>
      {details?.suggested_translation ? <details className="group/translation">
        <summary className={cn(summaryClass, "text-success")}>Ver tradução
          <ChevronDown size={16} aria-hidden="true" className="shrink-0 transition-transform duration-200 ease-standard group-open/translation:rotate-180" />
        </summary>
        <p lang="pt-BR" className="mt-1 text-body-lg text-ink">{details.suggested_translation}</p>
      </details> : null}
      <FeedbackAudio key={`${feedback.id}:${suggested}`} feedbackId={feedback.id} text={suggested} initialUrl={feedback.tts_audio_url} />
      {details?.changes?.[0] ? <p className="text-body text-ink">{details.changes[0].explanation}</p> : null}
    </section> : null}
    {details?.comparison ? <p aria-label="Comparação com a tentativa anterior" className="rounded-lg bg-info-soft px-4 py-3 text-body-lg text-ink">{details.comparison}</p> : null}
    {details?.comments?.length ? <section aria-label="O que você pode melhorar">
      <StudyBlock kind="tip" title="O que você pode melhorar">
        <ul className="list-disc space-y-1 pl-5 marker:text-ai">{details.comments.slice(0, 3).map((comment, index) => <li key={index}>{comment}</li>)}</ul>
      </StudyBlock>
    </section> : null}
    {details?.needs_clarification ? <Alert tone="info" title={details.clarification_question} /> : null}
    <details className="group/details border-t border-line pt-2">
      <summary className={cn(summaryClass, "text-primary")}>Ver mais detalhes
        <ChevronDown size={16} aria-hidden="true" className="shrink-0 transition-transform duration-200 ease-standard group-open/details:rotate-180" />
      </summary>
      <div className="mt-2 space-y-4 text-body-lg text-ink">
        <section aria-label="Avaliação de pronúncia">
          <div className="flex items-center gap-2"><StatusIcon status="not_assessed" /><p className="font-semibold">Pronúncia · Não avaliada</p></div>
          <p className="mt-1 text-body text-ink-secondary">{details?.pronunciation.explanation || "Sons, sílabas tônicas, ritmo e entonação precisam de análise do áudio. A transcrição sozinha não permite avaliar a pronúncia."}</p>
        </section>
        <section aria-label="Avaliação de gramática">
          <div className="flex items-center gap-2"><StatusIcon status={grammarStatus} /><p className="font-semibold">Gramática · {statusLabels[grammarStatus]}</p></div>
          <p className="mt-1">{details?.grammar?.explanation}</p>
        </section>
        <section aria-label="Avaliação de naturalidade">
          <div className="flex items-center gap-2"><StatusIcon status={naturalnessStatus} /><p className="font-semibold">Naturalidade · {statusLabels[naturalnessStatus]}</p></div>
          <p className="mt-1">{details?.naturalness?.explanation}</p>
        </section>
        {details?.changes?.map((change, index) => <section key={index}>
          <StudyBlock kind={change.kind === "grammar" ? "correction" : "tip"} title={change.kind === "grammar" ? "Ajuste de gramática" : "Sugestão de naturalidade"}>
            <div className="space-y-1">
              <p lang="en" className="break-words"><span lang="pt-BR" className="font-semibold">Original: </span>{change.before}</p>
              <p lang="en" className="break-words"><span lang="pt-BR" className="font-semibold">Sugestão: </span>{change.after}</p>
              <p className="pt-1 text-body">{change.explanation}</p>
            </div>
          </StudyBlock>
        </section>)}
      </div>
    </details>
    {suggested && !details?.needs_clarification ? <div className="space-y-3 border-t border-line pt-4">
      <p className="text-body-lg text-ink">Agora que você ouviu a frase, que tal tentar falar novamente?</p>
      <div className="flex flex-wrap gap-2">
        {onRepeat ? <Button type="button" size="sm" disabled={disabled} onClick={() => onRepeat(feedback)}>
          <Mic aria-hidden="true" />{details?.practice_target && details.practice_target !== details.full_sentence ? "Tentar frase completa" : "Tentar pronunciar"}
        </Button> : null}
        {details?.chunks?.length ? <Button type="button" size="sm" variant="outline" onClick={() => setPartsOpen(!partsOpen)} aria-expanded={partsOpen}>Praticar por partes</Button> : null}
        {onContinue ? <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={onContinue}>Continuar conversa</Button> : null}
        {onNextSituation ? <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={onNextSituation}>Próxima situação</Button> : null}
      </div>
      {partsOpen ? <div className="space-y-3">{details?.chunks.map((chunk, index) => <section key={chunk + index} className="space-y-2 rounded-lg bg-surface-muted px-4 py-3">
        <p className="text-label text-ink">Etapa {index + 1}</p><p lang="en" className="break-words text-body-lg text-ink">{chunk}</p>
        <FeedbackAudio key={`${feedback.id}:${index}:${chunk}`} feedbackId={feedback.id} text={chunk} chunkIndex={index} />
        {onRepeat ? <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={() => onRepeat(feedback, index)}>Repetir trecho {index + 1}</Button> : null}
      </section>)}<section className="space-y-2 rounded-lg bg-primary-subtle px-4 py-3">
        <p className="text-label text-primary-dark">Frase completa</p><p lang="en" className="break-words text-body-lg font-medium text-ink">{details?.full_sentence || suggested}</p>
        <FeedbackAudio key={`${feedback.id}:full`} feedbackId={feedback.id} text={details?.full_sentence || suggested} fullSentence />
        {details?.full_translation ? <details className="group/full">
          <summary className={cn(summaryClass, "text-primary-dark")}>Ver tradução da frase completa
            <ChevronDown size={16} aria-hidden="true" className="shrink-0 transition-transform duration-200 ease-standard group-open/full:rotate-180" />
          </summary>
          <p lang="pt-BR" className="mt-1 text-body-lg text-ink">{details.full_translation}</p>
        </details> : null}
        {onRepeat ? <Button type="button" size="sm" disabled={disabled} onClick={() => onRepeat(feedback)}>Tentar frase completa</Button> : null}
      </section></div> : null}
    </div> : null}
  </Card>;
};

export default PronunciationFeedback;
