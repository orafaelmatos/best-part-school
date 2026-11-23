import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import MicRecorder, { type RecordingState } from "@/components/MicRecorder";
import InterpreterAudio from "@/components/InterpreterAudio";
import SimultaneousRecorder from "@/components/SimultaneousRecorder";
import InterpreterComparisonPlayer from "@/components/InterpreterComparisonPlayer";
import { InterpreterMetrics } from "@/components/InterpreterReportCard";
import { absoluteMediaUrl } from "@/lib/config";
import { audioRequestId, recordingExtension } from "@/lib/speakingAudio";
import { languageNames, type InterpreterMessage, type InterpreterState, type InterpretationFeedback, type SimultaneousTiming } from "@/lib/interpreter";

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

  return <article aria-label={`Trecho ${turn.index + 1}`} className="space-y-5 rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-amber-700">{turn.review_of ? "Revisão" : `Trecho ${turn.index + 1}`} · {languageNames[turn.source_language]} → {target}</p>
        <h2 className="mt-1 text-xl font-semibold">{turn.speaker}</h2>
        {state.settings.session_style === "journey" ? <p className="mt-1 text-sm text-muted-foreground">{state.plan.steps[turn.step_index].title}</p> : null}
      </div>
      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-900">Você é o intérprete</span>
    </div>
    {!simultaneous || !canRespond || responseMode !== "voice" ? <InterpreterAudio sessionId={sessionId} messageId={message.id} part="original" label="Ouvir fala original" initialUrl={turn.audio_url} speed={state.policy.speed}
      disabled={recordingBusy || busy} onPlayingChange={setPlaying} onEnded={() => setListened(true)} /> : null}
    {assistance ? <div className="space-y-3">
      <Button type="button" variant="ghost" onClick={() => { setShowOriginal((value) => !value); if (!showOriginal) setListened(true); }}>{showOriginal ? "Ocultar transcrição original" : "Ver transcrição original"}</Button>
      {showOriginal ? <p lang={turn.source_language === "pt" ? "pt-BR" : "en"} className="rounded-2xl bg-muted p-4 text-base leading-relaxed">{turn.transcript}</p> : null}
      {state.settings.interpretation_mode === "guided" && !feedback ? state.policy.support === "full" ? <p className="rounded-2xl bg-amber-50 p-3 text-sm">Dica: {turn.hint}</p> : <details className="text-sm"><summary className="cursor-pointer">{state.policy.support === "minimal" ? "Consultar uma nuance do trecho" : "Preciso de uma dica"}</summary><p className="mt-2 text-muted-foreground">{turn.hint}</p></details> : null}
    </div> : null}
    {canRespond ? <div className="space-y-4 border-t border-border pt-4">
      <div><h3 className="font-semibold">Sua vez! Interprete para o {target}.</h3><p className="mt-1 text-sm text-muted-foreground">Preserve o significado da mensagem. Você pode usar suas próprias palavras.</p></div>
      <div className="flex flex-wrap gap-2" aria-label="Forma de resposta">
        {([["voice", "Interpretar por voz"], ["text", "Escrever sozinho"], ["multiple_choice", "Com alternativas"]] as const).map(([mode, label]) => <Button key={mode} type="button" size="sm" variant={responseMode === mode ? "default" : "outline"} aria-pressed={responseMode === mode}
          disabled={recordingBusy || busy} onClick={() => { setResponseMode(mode); setRequestId(""); }}>{label}</Button>)}
      </div>
      {!listened && !(simultaneous && responseMode === "voice") ? <p className="text-sm text-muted-foreground">Ouça a fala até o fim{assistance ? " ou consulte a transcrição" : ""} antes de responder.</p> : null}
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
        {preview ? <div><p className="mb-2 text-sm font-medium">Ouvir minha interpretação</p><audio aria-label="Ouvir minha interpretação" controls src={preview} className="w-full" /></div> : null}
      </> : responseMode === "text" ? <label className="block text-sm font-medium">Sua interpretação em {target}<textarea aria-label={`Sua interpretação em ${target}`} lang={turn.target_language === "pt" ? "pt-BR" : "en"} value={text} maxLength={12000}
        disabled={busy || !listened} onChange={(e) => { setText(e.target.value); setRequestId(""); }} rows={4} className="mt-2 w-full rounded-2xl border border-input bg-background p-3 font-normal" placeholder={`Transmita a mensagem em ${target}...`} /></label> : <fieldset disabled={busy || !listened} className="space-y-2"><legend className="mb-2 text-sm">Qual interpretação preserva o significado?</legend>
        {turn.alternatives.map((value, index) => <label key={index} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-3 text-sm"><input type="radio" name={`option-${message.id}`} checked={option === index} onChange={() => { setOption(index); setRequestId(""); }} /><span>{value}</span></label>)}
      </fieldset>}
      <Button type="button" disabled={busy || recordingBusy || playing || !listened || (responseMode === "voice" ? !recording : responseMode === "text" ? !text.trim() : option === null)} onClick={() => void submit().catch(() => undefined)}>{busy ? "Avaliando interpretação..." : "Enviar interpretação"}</Button>
    </div> : null}
    {answer ? <div className="space-y-3 border-t border-border pt-4"><h3 className="text-sm font-semibold">Sua interpretação</h3><p className="whitespace-pre-wrap text-sm leading-relaxed">{answer.text}</p>
      {answer.audio_url ? <audio aria-label="Ouvir minha interpretação enviada" controls preload="none" src={absoluteMediaUrl(answer.audio_url) || undefined} className="w-full" /> : null}
      {answer.audio_url && answer.metadata?.interpreter_answer?.simultaneous_timing && turn.audio_url ? <InterpreterComparisonPlayer originalUrl={turn.audio_url} recordingUrl={answer.audio_url} timing={answer.metadata.interpreter_answer.simultaneous_timing} /> : null}
    </div> : null}
    {feedback ? <section aria-label="Feedback da interpretação" className="space-y-4 rounded-2xl bg-muted/50 p-4">
      <h3 className="font-semibold">{feedback.summary}</h3>
      {!feedback.target_language_observed ? <p className="text-sm text-destructive">A interpretação precisa estar em {target}.</p> : null}
      {feedback.strengths.length ? <ul className="list-disc space-y-1 pl-5 text-sm">{feedback.strengths.map((item) => <li key={item}>{item}</li>)}</ul> : null}
      {feedback.improvements.length ? <div><p className="text-sm font-semibold">Para a próxima tentativa</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{feedback.improvements.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
      <details className="text-sm"><summary className="cursor-pointer font-medium">Ver detalhes da avaliação</summary><div className="mt-3 space-y-3"><InterpreterMetrics value={feedback} />
        {feedback.information.map((item) => <div key={item.unit_index}><p className="font-medium">{turn.key_information[item.unit_index]} — {({ preserved: "Preservada", omitted: "Omitida", altered: "Alterada" })[item.status]}</p><p className="text-muted-foreground">{item.explanation}</p></div>)}
        <p className="text-xs text-muted-foreground">Fluidez, pronúncia e clareza da fala não avaliadas. {feedback.response_mode === "multiple_choice" ? "Esta resposta avalia apenas reconhecimento de significado." : "A avaliação considera o texto ou a transcrição da sua resposta."}</p>
      </div></details>
      <div><h3 className="mb-2 text-sm font-semibold">Uma interpretação sugerida</h3><p lang={turn.target_language === "pt" ? "pt-BR" : "en"} className="mb-3 text-sm leading-relaxed">{turn.suggested_interpretation}</p><InterpreterAudio sessionId={sessionId} messageId={message.id} part="suggested" label={`Ouvir interpretação sugerida em ${target}`} initialUrl={turn.suggested_audio_url} /></div>
      {!readOnly ? <Button type="button" variant="outline" disabled={busy} onClick={onRetry}>Tentar novamente</Button> : null}
    </section> : assistance && !canRespond ? <><Button variant="ghost" onClick={() => setShowSuggested((value) => !value)}>Ver interpretação sugerida</Button>{showSuggested ? <p className="text-sm">{turn.suggested_interpretation}</p> : null}</> : null}
  </article>;
};

export default InterpreterTurnCard;
