import AIContentReportButton from "@/components/AIContentReportButton";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Eye, EyeOff, Headphones, Languages, Lightbulb, ListChecks, Mic, MinusCircle, PenLine, RotateCcw, Send, Sparkles } from "lucide-react";
import { Alert, Badge, Button, Card, ChatBubble, Chip, IconTile, StudyBlock, inputClasses } from "@/components/student/ui";
import MicRecorder, { type RecordingState } from "@/components/MicRecorder";
import InterpreterAudio from "@/components/InterpreterAudio";
import SimultaneousRecorder from "@/components/SimultaneousRecorder";
import InterpreterComparisonPlayer from "@/components/InterpreterComparisonPlayer";
import { InterpreterMetrics } from "@/components/InterpreterReportCard";
import { absoluteMediaUrl } from "@/lib/config";
import { audioRequestId, recordingExtension } from "@/lib/speakingAudio";
import { languageNames, type InterpreterMessage, type InterpreterState, type InterpretationFeedback, type SimultaneousTiming } from "@/lib/interpreter";
import { cn } from "@/lib/utils";

type Props = {
  sessionId: string;
  message: InterpreterMessage;
  state: InterpreterState;
  answer?: InterpreterMessage;
  feedback?: InterpretationFeedback;
  busy: boolean;
  readOnly?: boolean;
  onAnswer: (data: FormData | Record<string, unknown>) => Promise<void>;
  onRetry: () => void;
  onActivityChange?: (busy: boolean) => void;
};

const disclosureClass = "inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md text-body font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden";
const statusLabels = { preserved: "Preservada", omitted: "Omitida", altered: "Alterada" } as const;
const statusTones = { preserved: "success", omitted: "warning", altered: "danger" } as const;
const statusIcons = { preserved: CheckCircle2, omitted: MinusCircle, altered: AlertTriangle } as const;
const responseModes = [["voice", "Interpretar por voz", Mic], ["text", "Escrever sozinho", PenLine], ["multiple_choice", "Com alternativas", ListChecks]] as const;

const InterpreterTurnCard = ({ sessionId, message, state, answer, feedback, busy, readOnly, onAnswer, onRetry, onActivityChange }: Props) => {
  const turn = message.metadata!.interpretation_turn!;
  const [responseMode, setResponseMode] = useState<"voice" | "text" | "multiple_choice">("voice");
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recording, setRecording] = useState<{ blob: Blob; seconds: number; timing?: SimultaneousTiming; sourceUrl?: string } | null>(null);
  const [simultaneousBusy, setSimultaneousBusy] = useState(false);
  const [preview, setPreview] = useState("");
  const [text, setText] = useState("");
  const [option, setOption] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [listened, setListened] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [showSuggested, setShowSuggested] = useState(false);
  const [requestId, setRequestId] = useState("");
  const submitted = useRef(false);
  const recordingBusy = simultaneousBusy || ["requesting", "recording", "paused", "processing", "uploading"].includes(recordingState);
  const simultaneous = state.settings.interpretation_mode === "simultaneous";
  const canRespond = !readOnly && !answer;
  const assistance = !state.settings.realistic || Boolean(feedback);
  const target = languageNames[turn.target_language];
  const sourceLang = turn.source_language === "pt" ? "pt-BR" : "en";
  const targetLang = turn.target_language === "pt" ? "pt-BR" : "en";
  useEffect(() => { onActivityChange?.(recordingBusy); return () => onActivityChange?.(false); }, [recordingBusy, onActivityChange]);

  useEffect(() => {
    if (!recording) { setPreview(""); return; }
    const url = URL.createObjectURL(recording.blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [recording]);

  const submit = async () => {
    if (submitted.current || busy || recordingBusy) return;
    const id = requestId || audioRequestId();
    setRequestId(id);
    submitted.current = true;
    try {
      if (responseMode === "voice" && recording) {
        const body = new FormData();
        body.append("message_id", message.id);
        body.append("request_id", id);
        body.append("response_mode", "voice");
        body.append("duration_seconds", String(recording.seconds));
        body.append("audio", recording.blob, `interpretacao.${recordingExtension(recording.blob.type)}`);
        if (recording.timing) body.append("simultaneous_timing", JSON.stringify(recording.timing));
        await onAnswer(body);
      } else {
        await onAnswer({ message_id: message.id, request_id: id, response_mode: responseMode,
          ...(responseMode === "text" ? { answer_text: text } : { selected_option_index: option }) });
      }
    } finally { submitted.current = false; }
  };

  const suggestion = <StudyBlock kind="example" title="Uma interpretação sugerida"><p lang={targetLang} className="leading-7">{turn.suggested_interpretation}</p></StudyBlock>;

  return <Card as="article" aria-label={`Trecho ${turn.index + 1}`} padding="md" className="min-w-0 space-y-5 sm:p-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-caption text-ink-secondary">{turn.review_of ? "Revisão" : `Trecho ${turn.index + 1}`} · {languageNames[turn.source_language]} → {target}</p>
        <h2 className="mt-1 text-h3 text-ink">{turn.speaker}</h2>
        {state.settings.session_style === "journey" ? <p className="mt-0.5 text-body text-ink-secondary">{state.plan.steps[turn.step_index].title}</p> : null}
      </div>
      <Badge tone="neutral" icon={<Languages aria-hidden="true" />}>Você é o intérprete</Badge>
    </header>

    {!simultaneous || !canRespond || responseMode !== "voice" ? <InterpreterAudio sessionId={sessionId} messageId={message.id} part="original" label="Ouvir fala original" initialUrl={turn.audio_url} speed={state.policy.speed}
      disabled={recordingBusy || busy} onPlayingChange={setPlaying} onEnded={() => setListened(true)} /> : null}

    {assistance ? <div className="space-y-3">
      <Button type="button" variant="ghost" size="sm" className="-ml-2 px-2" aria-expanded={showOriginal} onClick={() => { setShowOriginal((value) => !value); if (!showOriginal) setListened(true); }}>
        {showOriginal ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}{showOriginal ? "Ocultar transcrição original" : "Ver transcrição original"}
      </Button>
      {showOriginal ? <StudyBlock kind="translation" title="Transcrição original"><p lang={sourceLang} className="leading-7">{turn.transcript}</p></StudyBlock> : null}
      {state.settings.interpretation_mode === "guided" && !feedback ? state.policy.support === "full"
        ? <StudyBlock kind="tip" title="Apoio do tutor"><p>Dica: {turn.hint}</p></StudyBlock>
        : <details className="group">
          <summary className={disclosureClass}>
            <Lightbulb size={16} aria-hidden="true" />{state.policy.support === "minimal" ? "Consultar uma nuance do trecho" : "Preciso de uma dica"}
            <ChevronDown size={16} className="transition-transform duration-200 ease-standard group-open:rotate-180" aria-hidden="true" />
          </summary>
          <StudyBlock kind="tip" title="Dica" className="mt-2"><p>{turn.hint}</p></StudyBlock>
        </details> : null}
    </div> : null}

    {canRespond ? <div className="space-y-4 border-t border-line pt-5">
      <div>
        <h3 className="text-h4 text-ink">Sua vez! Interprete para o {target}.</h3>
        <p className="mt-1 text-body text-ink-secondary">Preserve o significado da mensagem. Você pode usar suas próprias palavras.</p>
      </div>
      <div role="group" className="flex flex-wrap gap-2" aria-label="Forma de resposta">
        {responseModes.map(([mode, label, Icon]) => <Chip key={mode} selected={responseMode === mode} disabled={recordingBusy || busy} className="disabled:opacity-50"
          onClick={() => { setResponseMode(mode); setRequestId(""); }}><Icon aria-hidden="true" />{label}</Chip>)}
      </div>
      {!listened && !(simultaneous && responseMode === "voice") ? <p className="flex items-start gap-2 text-body text-ink-secondary">
        <Headphones size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />Ouça a fala até o fim{assistance ? " ou consulte a transcrição" : ""} antes de responder.
      </p> : null}
      {responseMode === "voice" && simultaneous ? <>
        <SimultaneousRecorder sessionId={sessionId} messageId={message.id} initialUrl={turn.audio_url} speed={state.settings.playback_speed ?? state.policy.speed} disabled={busy}
          onBusyChange={setSimultaneousBusy} onReset={() => { setRecording(null); setRequestId(""); setListened(false); }}
          onComplete={(blob, seconds, timing, sourceUrl) => { setRecording({ blob, seconds, timing, sourceUrl }); setListened(true); }} />
        {preview && recording?.timing && recording.sourceUrl ? <InterpreterComparisonPlayer originalUrl={recording.sourceUrl} recordingUrl={preview} timing={recording.timing} disabled={recordingBusy || busy} /> : null}
      </> : responseMode === "voice" ? <>
        <MicRecorder state={recordingState} disabled={busy || playing || !listened}
          onStateChange={(value) => { setRecordingState(value); if (value === "requesting") { setRecording(null); setRequestId(""); } }}
          onRecordingComplete={(blob, seconds) => { setRecording({ blob, seconds }); setRecordingState("completed"); }}
          onUseText={() => { setResponseMode("text"); setRequestId(""); }} recordLabel="Gravar interpretação" stopLabel="Concluir gravação" completedLabel="Gravação pronta para ouvir e enviar"
          description="Grave a mensagem no idioma de destino. Você poderá ouvir sua interpretação antes de enviar." />
        {preview ? <div className="space-y-2 rounded-lg bg-surface-muted p-3">
          <p className="flex items-center gap-2 text-body font-medium text-ink"><CheckCircle2 size={16} className="shrink-0 text-success" aria-hidden="true" />Ouvir minha interpretação</p>
          <audio aria-label="Ouvir minha interpretação" controls src={preview} className="w-full min-w-0" />
        </div> : null}
      </> : responseMode === "text" ? <label className="block text-body font-medium text-ink">Sua interpretação em {target}
        <textarea aria-label={`Sua interpretação em ${target}`} lang={targetLang} value={text} maxLength={12000}
          disabled={busy || !listened} onChange={(e) => { setText(e.target.value); setRequestId(""); }} rows={4}
          className={cn(inputClasses, "mt-2 block min-h-32 py-3 font-normal leading-7")} placeholder={`Transmita a mensagem em ${target}…`} />
      </label> : <fieldset disabled={busy || !listened} className="min-w-0 space-y-2 disabled:opacity-60">
        <legend className="mb-2 text-body font-medium text-ink">Qual interpretação preserva o significado?</legend>
        {turn.alternatives.map((value, index) => <label key={index} className={cn(
          "flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border p-3 text-body-lg text-ink transition-colors duration-150 ease-standard focus-within:ring-2 focus-within:ring-primary",
          option === index ? "border-primary bg-primary-subtle" : "border-line bg-surface hover:bg-surface-muted",
        )}>
          <input type="radio" className="mt-1 size-5 shrink-0 accent-primary" name={`option-${message.id}`} checked={option === index} onChange={() => { setOption(index); setRequestId(""); }} />
          <span lang={targetLang} className="min-w-0">{value}</span>
        </label>)}
      </fieldset>}
      <Button type="button" fullWidth className="h-auto whitespace-normal py-2" loading={busy} loadingLabel="Avaliando interpretação…"
        disabled={busy || recordingBusy || playing || !listened || (responseMode === "voice" ? !recording : responseMode === "text" ? !text.trim() : option === null)}
        onClick={() => void submit().catch(() => undefined)}>
        <Send aria-hidden="true" />Enviar interpretação
      </Button>
    </div> : null}

    {answer ? <div className="space-y-3 border-t border-line pt-5">
      <h3 className="text-body font-semibold text-ink">Sua interpretação</h3>
      {answer.text ? <ChatBubble from="student" className="whitespace-pre-wrap">{answer.text}</ChatBubble> : null}
      {answer.audio_url ? <audio aria-label="Ouvir minha interpretação enviada" controls preload="none" src={absoluteMediaUrl(answer.audio_url) || undefined} className="w-full min-w-0" /> : null}
      {answer.audio_url && answer.metadata?.interpreter_answer?.simultaneous_timing && turn.audio_url ? <InterpreterComparisonPlayer originalUrl={turn.audio_url} recordingUrl={answer.audio_url} timing={answer.metadata.interpreter_answer.simultaneous_timing} /> : null}
    </div> : null}

    {feedback ? <section aria-label="Feedback da interpretação" className="space-y-4 border-t border-line pt-5">
      <div className="flex items-start gap-3">
        <IconTile icon={Sparkles} tone="ai" size="sm" />
        <div className="min-w-0">
          <p className="text-caption text-ai">Avaliação do tutor de IA</p>
          <h3 className="mt-0.5 text-body-lg font-semibold text-ink">{feedback.summary}</h3>
        </div>
      </div>
      {!feedback.target_language_observed ? <Alert tone="danger" title={`A interpretação precisa estar em ${target}.`} /> : null}
      {feedback.strengths.length ? <ul className="space-y-2 text-body-lg text-ink">{feedback.strengths.map((item) => <li key={item} className="flex items-start gap-2">
        <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-success" aria-hidden="true" /><span className="min-w-0"><span className="sr-only">Ponto forte: </span>{item}</span>
      </li>)}</ul> : null}
      {feedback.improvements.length ? <StudyBlock kind="correction" title="Para a próxima tentativa">
        <ul className="list-disc space-y-1 pl-5">{feedback.improvements.map((item) => <li key={item}>{item}</li>)}</ul>
      </StudyBlock> : null}
      {suggestion}
      <InterpreterAudio sessionId={sessionId} messageId={message.id} part="suggested" label={`Ouvir interpretação sugerida em ${target}`} initialUrl={turn.suggested_audio_url} />
      <details className="group">
        <summary className={disclosureClass}>Ver detalhes da avaliação<ChevronDown size={16} className="transition-transform duration-200 ease-standard group-open:rotate-180" aria-hidden="true" /></summary>
        <div className="mt-3 space-y-4">
          <InterpreterMetrics value={feedback} />
          {feedback.information.length ? <ul className="divide-y divide-line rounded-lg border border-line">{feedback.information.map((item) => {
            const StatusIcon = statusIcons[item.status];
            return <li key={item.unit_index} className="space-y-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 flex-1 text-body font-medium text-ink">{turn.key_information[item.unit_index]}</p>
                <Badge tone={statusTones[item.status]} icon={<StatusIcon aria-hidden="true" />}>{statusLabels[item.status]}</Badge>
              </div>
              <p className="text-body text-ink-secondary">{item.explanation}</p>
            </li>;
          })}</ul> : null}
          <p className="text-caption text-ink-muted">Fluidez, pronúncia e clareza da fala não avaliadas. {feedback.response_mode === "multiple_choice" ? "Esta resposta avalia apenas reconhecimento de significado." : "A avaliação considera o texto ou a transcrição da sua resposta."}</p>
        </div>
      </details>
      {!readOnly ? <Button type="button" variant="outline" disabled={busy} onClick={onRetry}><RotateCcw aria-hidden="true" />Tentar novamente</Button> : null}
    </section> : assistance && !canRespond ? <div className="space-y-3">
      <Button type="button" variant="ghost" size="sm" className="-ml-2 px-2" aria-expanded={showSuggested} onClick={() => setShowSuggested((value) => !value)}>
        {showSuggested ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}Ver interpretação sugerida
      </Button>
      {showSuggested ? suggestion : null}
    </div> : null}

    <AIContentReportButton messageId={message.id} />
  </Card>;
};

export default InterpreterTurnCard;
