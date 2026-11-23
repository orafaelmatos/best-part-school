import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { Headphones, Languages, Loader2, Mic, BookOpen } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import InterpreterAudio from "@/components/InterpreterAudio";
import InterpreterTurnCard from "@/components/InterpreterTurnCard";
import InterpreterReportCard from "@/components/InterpreterReportCard";
import LegacyInterpreteIA from "@/pages/LegacyInterpreteIA";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { APP_PATHS } from "@/lib/routes";
import { buildInterpreterSessionPath, fetchAiStudySessions, formatDateTime } from "@/lib/aiStudy";
import { directionNames, interpretationModeNames, type InterpreterSession, type InterpreterSettings } from "@/lib/interpreter";
import { audioRequestError } from "@/lib/speakingAudio";
import { cn } from "@/lib/utils";

const topics = [
  { id: "preaching", label: "Pregação", description: "Christopher visita uma igreja no Brasil." },
  { id: "restaurant", label: "Restaurante", description: "Recepção, pedidos e atendimento à mesa." },
  { id: "airport", label: "Aeroporto", description: "Orientações, embarque e imprevistos." },
  { id: "hotel", label: "Hotel", description: "Recepção e necessidades dos hóspedes." },
  { id: "work", label: "Reunião de trabalho", description: "Apresentações, decisões e próximos passos." },
  { id: "job_interview", label: "Entrevista", description: "Uma conversa entre candidato e recrutador." },
  { id: "tourism", label: "Turismo", description: "Um guia recebe visitantes de outro país." },
  { id: "consultation", label: "Consulta", description: "Uma conversa entre profissional e paciente." },
  { id: "presentation", label: "Apresentação e eventos", description: "Conecte palestrantes e público." },
  { id: "custom", label: "Cenário personalizado", description: "Defina o evento que quer interpretar." },
];

const defaultSettings: InterpreterSettings = { direction: "en_pt", interpretation_mode: "consecutive", session_style: "journey", duration_minutes: 5, prepare_vocabulary: false, realistic: false };

const InterpreterExperience = ({ session }: { session?: InterpreterSession }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [topic, setTopic] = useState("preaching");
  const [custom, setCustom] = useState("");
  const [level, setLevel] = useState("A2");
  const [settings, setSettings] = useState(defaultSettings);
  const [busy, setBusy] = useState(false);
  const [activityBusy, setActivityBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const state = session?.guided_state?.interpreter;
  const readOnly = Boolean(session && user?.role === "teacher" && session.student !== user.user_id);
  const sessions = useQuery({ queryKey: ["ai-study-sessions", "", "listening"], queryFn: () => fetchAiStudySessions("", ["listening"]), enabled: !session });
  const current = session?.messages.find((m) => m.id === state?.active_turn_id);
  const feedbackFor = (id: string) => session?.messages.find((m) => m.metadata?.interpretation_feedback?.challenge_id === id)?.metadata?.interpretation_feedback;
  const answerFor = (id: string) => session?.messages.find((m) => m.metadata?.interpreter_answer?.challenge_id === id);
  const currentFeedback = current ? feedbackFor(current.id) : undefined;
  const selected = topics.find((item) => item.id === topic)!;

  const perform = async (path: string, data?: FormData | Record<string, unknown>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true); setError("");
    try {
      const response = await api.post(path, data);
      const next = response.data as InterpreterSession;
      queryClient.setQueryData(["interpreter-session", next.id], next);
      await queryClient.invalidateQueries({ queryKey: ["ai-study-sessions"] });
      if (!session) navigate(buildInterpreterSessionPath(next.id));
    } catch (cause) { setError(audioRequestError(cause)); throw cause; }
    finally { pending.current = false; setBusy(false); }
  };
  const action = (name: string, data?: FormData | Record<string, unknown>) => perform(`/ai-study/sessions/${session!.id}/interpreter/${name}/`, data);
  const retry = (id: string) => { void action("retry", { message_id: id }).catch(() => undefined); };
  const create = () => { void perform("/ai-study/sessions/", { mode: "listening", scenario_key: topic, scenario_label: topic === "custom" ? custom.trim() : selected.label, level, interpreter_settings: settings }).catch(() => undefined); };
  const setSetting = <K extends keyof InterpreterSettings>(key: K, value: InterpreterSettings[K]) => setSettings((previous) => ({ ...previous, [key]: value }));

  return <DashboardLayout><main className="mx-auto w-full max-w-6xl space-y-6 pb-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="flex items-center gap-2 text-sm font-semibold text-amber-700"><Languages className="h-4 w-4" />Intérprete IA</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{session ? session.title : "Dê voz à mensagem em outro idioma"}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{session ? state?.plan.situation : "Ouça pessoas em situações reais, compreenda a mensagem e interprete pelo microfone. O foco é preservar o significado."}</p>
      </div>
      {session ? <Button variant="outline" onClick={() => navigate(APP_PATHS.interpreter)} disabled={busy || activityBusy}>Novo treino</Button> : null}
    </header>
    {error ? <p role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</p> : null}
    {!session ? <>
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6 rounded-3xl border border-border bg-card p-4 sm:p-6">
          <fieldset><legend className="mb-3 text-base font-semibold">1. Escolha a situação</legend><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {topics.map((item) => <button type="button" key={item.id} aria-pressed={topic === item.id} onClick={() => setTopic(item.id)} className={cn("rounded-2xl border p-3 text-left transition", topic === item.id ? "border-amber-400 bg-amber-50 text-slate-900" : "border-border hover:bg-muted")}><span className="text-sm font-semibold">{item.label}</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{item.description}</span></button>)}
          </div></fieldset>
          {topic === "custom" ? <label className="block text-sm font-medium">Descreva a situação<input value={custom} maxLength={120} onChange={(e) => setCustom(e.target.value)} placeholder="Ex.: uma pesquisadora apresenta seu projeto em um evento" className="mt-2 w-full rounded-xl border border-input bg-background p-3 font-normal" /></label> : null}
          <fieldset><legend className="mb-3 text-base font-semibold">2. Direção da interpretação</legend><div className="flex flex-wrap gap-2">{(Object.entries(directionNames) as Array<[InterpreterSettings["direction"], string]>).map(([id, label]) => <Button key={id} variant={settings.direction === id ? "default" : "outline"} aria-pressed={settings.direction === id} onClick={() => setSetting("direction", id)}>{label}</Button>)}</div><p className="mt-2 text-xs text-muted-foreground">No modo alternado, você interpreta as falas dos dois personagens, cada uma para o outro idioma.</p></fieldset>
          <fieldset><legend className="mb-3 text-base font-semibold">3. Tipo de interpretação</legend><div className="grid gap-3 sm:grid-cols-2">
            {([["consecutive", "Interpretação consecutiva", "Ouça um trecho e interprete. O personagem espera sua resposta."], ["guided", "Treinamento guiado", "Repita o áudio e consulte dicas adaptadas ao seu nível."], ["simultaneous", "Interpretação simultânea", "Avançado: interprete enquanto o original continua. Pause e retome os dois juntos."]] as const).map(([id, label, description]) => <button type="button" key={id} aria-pressed={settings.interpretation_mode === id} onClick={() => setSettings((previous) => ({ ...previous, interpretation_mode: id, ...(id === "simultaneous" ? { segment_duration_seconds: previous.segment_duration_seconds ?? 60, playback_speed: previous.playback_speed ?? 1 } : {}) }))} className={cn("rounded-2xl border p-4 text-left", settings.interpretation_mode === id ? "border-amber-400 bg-amber-50 text-slate-900" : "border-border hover:bg-muted")}><span className="text-sm font-semibold">{label}</span><span className="mt-2 block text-xs leading-relaxed text-muted-foreground">{description}</span></button>)}
          </div></fieldset>
          {settings.interpretation_mode === "simultaneous" ? <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/30 p-4">
            <label className="block text-sm font-medium">Duração aproximada de cada fala<select aria-label="Duração da fala simultânea" className="mt-2 block w-full rounded-xl border border-input bg-background p-2" value={settings.segment_duration_seconds ?? 60} onChange={(e) => setSetting("segment_duration_seconds", Number(e.target.value))}>{[30, 60, 90, 120].map((seconds) => <option key={seconds} value={seconds}>{seconds} segundos</option>)}</select></label>
            <label className="block text-sm font-medium">Velocidade inicial<select aria-label="Velocidade inicial da simultânea" className="mt-2 block w-full rounded-xl border border-input bg-background p-2" value={settings.playback_speed ?? 1} onChange={(e) => setSetting("playback_speed", Number(e.target.value))}>{[0.6, 0.75, 0.8, 0.9, 1, 1.25].map((speed) => <option key={speed} value={speed}>{speed}x</option>)}</select></label>
            <p className="text-xs leading-relaxed text-muted-foreground">A duração orienta o tamanho da fala; o tempo real depende da voz e da velocidade. Use fones para ouvir o original enquanto interpreta. Você poderá revisar os dois áudios juntos.</p>
          </div> : null}
          <fieldset><legend className="mb-3 text-base font-semibold">4. Nível CEFR</legend><div className="flex flex-wrap gap-2">{["A1", "A2", "B1", "B2", "C1", "C2"].map((value) => <Button key={value} variant={level === value ? "default" : "outline"} aria-pressed={level === value} onClick={() => setLevel(value)}>{value}</Button>)}</div>
            <p className="mt-3 text-sm text-muted-foreground">{level.startsWith("A") ? "Frases curtas, vocabulário cotidiano, áudio lento e mais apoio." : level.startsWith("B") ? "Trechos mais longos, construções variadas e dicas pontuais." : "Trechos longos, expressões idiomáticas, vocabulário especializado e ritmo natural."}</p>
          </fieldset>
          <fieldset><legend className="mb-3 text-base font-semibold">5. Formato da sessão</legend><div className="flex flex-wrap gap-2"><Button variant={settings.session_style === "journey" ? "default" : "outline"} aria-pressed={settings.session_style === "journey"} onClick={() => setSetting("session_style", "journey")}>Jornada de cinco etapas</Button><Button variant={settings.session_style === "free" ? "default" : "outline"} aria-pressed={settings.session_style === "free"} onClick={() => setSetting("session_style", "free")}>Interpretação livre</Button></div>
            {settings.session_style === "free" ? <label className="mt-4 block text-sm">Duração aproximada<select className="ml-3 rounded-xl border border-input bg-background p-2" value={settings.duration_minutes} onChange={(e) => setSetting("duration_minutes", Number(e.target.value))}>{[2, 5, 10, 15].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutos</option>)}</select><span className="mt-2 block text-xs text-muted-foreground">O tempo varia conforme o ritmo das suas respostas. As etapas não são anunciadas durante a conversa.</span></label> : null}
          </fieldset>
          <div className="space-y-3 border-t border-border pt-4"><label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={settings.prepare_vocabulary} onChange={(e) => setSetting("prepare_vocabulary", e.target.checked)} /><span><span className="font-medium">Preparar vocabulário</span><span className="mt-1 block text-xs text-muted-foreground">Conheça expressões, exemplos e traduções antes de interpretar. Opcional.</span></span></label>
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={settings.realistic} onChange={(e) => setSetting("realistic", e.target.checked)} /><span><span className="font-medium">Simulação real</span><span className="mt-1 block text-xs text-muted-foreground">Transcrição e dicas ficam ocultas até você responder.</span></span></label></div>
          <Button className="w-full" size="lg" disabled={busy || (topic === "custom" && !custom.trim())} onClick={create}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}{busy ? "Preparando cenário..." : "Iniciar interpretação"}</Button>
        </div>
        <aside className="space-y-4 self-start rounded-3xl border border-border bg-card p-5 lg:sticky lg:top-6"><Headphones className="h-8 w-8 text-amber-600" /><h2 className="font-semibold">Seu treino de interpretação</h2><p className="text-sm">{topic === "custom" ? custom || "Seu cenário" : selected.label} · {level}</p><p className="text-sm text-muted-foreground">{directionNames[settings.direction]} · {interpretationModeNames[settings.interpretation_mode]}</p><ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground"><li>{settings.interpretation_mode === "simultaneous" ? "Inicie o áudio e o microfone juntos." : "Ouça a fala do personagem."}</li><li>{settings.interpretation_mode === "simultaneous" ? "Interprete enquanto o personagem fala." : "Grave sua interpretação no outro idioma."}</li><li>Ouça sua gravação e envie para receber feedback.</li><li>Continue a situação até o encerramento.</li></ol></aside>
      </div>
      <section aria-label="Últimas sessões" className="space-y-3"><h2 className="text-lg font-semibold">Últimas sessões</h2>{sessions.isLoading ? <p role="status" className="text-sm">Carregando sessões...</p> : sessions.isError ? <Button variant="outline" onClick={() => void sessions.refetch()}>Tentar carregar sessões novamente</Button> : sessions.data?.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{sessions.data.slice(0, 9).map((item) => <button key={item.id} className="rounded-2xl border border-border bg-card p-4 text-left hover:bg-muted" onClick={() => navigate(buildInterpreterSessionPath(item.id))}><span className="block text-sm font-semibold">{item.title}</span><span className="mt-1 block text-xs text-muted-foreground">{item.guided_state?.interpreter ? "Simulação de interpretação" : "Prática de listening anterior"} · {formatDateTime(item.last_interaction_at)}</span></button>)}</div> : <p className="text-sm text-muted-foreground">Suas sessões ficarão salvas aqui.</p>}</section>
    </> : state ? <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4"><p className="text-sm">{directionNames[state.settings.direction]} · {state.level} · {interpretationModeNames[state.settings.interpretation_mode]}</p>{!readOnly && state.status !== "completed" ? <Button variant="outline" disabled={busy || activityBusy || state.status === "reviewing"} onClick={() => void action("finish").catch(() => undefined)}>Encerrar sessão e ver relatório</Button> : null}</div>
      {readOnly ? <p className="text-sm text-muted-foreground">Visualização do professor. As respostas e o relatório são os mesmos apresentados ao aluno.</p> : null}
      {state.settings.session_style === "journey" ? <ol aria-label="Etapas da jornada" className="grid grid-cols-1 gap-2 sm:grid-cols-5">{state.plan.steps.map((step, index) => <li key={index} className={cn("rounded-xl border p-3 text-xs", current?.metadata?.interpretation_turn?.step_index === index ? "border-amber-400 bg-amber-50 text-amber-950" : "border-border bg-card text-muted-foreground")}>{index + 1}. {step.title}</li>)}</ol> : null}
      {state.status === "ready" ? <section className="space-y-5 rounded-3xl border border-border bg-card p-4 sm:p-6"><h2 className="flex items-center gap-2 text-xl font-semibold"><BookOpen className="h-5 w-5" />Preparar vocabulário</h2><p className="text-sm text-muted-foreground">Estas expressões podem aparecer na situação. A preparação é opcional.</p><div className="grid gap-4 sm:grid-cols-2">{state.plan.vocabulary.map((item, index) => <article key={index} className="space-y-3 rounded-2xl border border-border p-4"><h3 className="font-semibold">{item.expression} <span className="font-normal text-muted-foreground">— {item.translation}</span></h3><p lang="en" className="text-sm">{item.example}</p><p lang="pt-BR" className="text-sm text-muted-foreground">{item.example_translation}</p><InterpreterAudio sessionId={session.id} part="vocabulary" vocabularyIndex={index} label={`Ouvir ${item.expression}`} /><InterpreterAudio sessionId={session.id} part="example" vocabularyIndex={index} label="Ouvir exemplo" /></article>)}</div>{!readOnly ? <Button disabled={busy} onClick={() => void action("next").catch(() => undefined)}>{busy ? "Preparando primeira fala..." : "Começar a interpretar"}</Button> : null}</section> : null}
      {state.status !== "ready" && current ? <div className="space-y-4"><InterpreterTurnCard key={current.id} sessionId={session.id} message={current} state={state} answer={answerFor(current.id)} feedback={currentFeedback} busy={busy} readOnly={readOnly || state.status === "completed"}
        onAnswer={(data) => action("answer", data)} onRetry={() => retry(current.id)} onActivityChange={setActivityBusy} />
        {currentFeedback && !readOnly && state.status !== "completed" ? <Button size="lg" disabled={busy} onClick={() => void action("next").catch(() => undefined)}>{busy ? "Preparando próxima fala..." : "Próxima fala"}</Button> : null}
      </div> : null}
      {state.status === "completed" && state.report ? <InterpreterReportCard report={state.report} disabled={busy} onRetry={readOnly ? undefined : retry} /> : null}
      {session.messages.some((m) => m.metadata?.interpretation_turn && m.id !== current?.id) ? <details className="rounded-3xl border border-border bg-card p-4"><summary className="cursor-pointer font-semibold">Histórico das interpretações</summary><div className="mt-4 space-y-4">{session.messages.filter((m) => m.metadata?.interpretation_turn && m.id !== current?.id).map((message) => <InterpreterTurnCard key={message.id} sessionId={session.id} message={message} state={state} answer={answerFor(message.id)} feedback={feedbackFor(message.id)} busy={busy} readOnly onAnswer={async () => undefined} onRetry={() => undefined} />)}</div></details> : null}
    </> : null}
  </main></DashboardLayout>;
};

const InterpreteIA = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const query = useQuery({ queryKey: ["interpreter-session", sessionId], enabled: Boolean(sessionId), queryFn: async () => (await api.get(`/ai-study/sessions/${sessionId}/`)).data as InterpreterSession });
  if (!sessionId) return <InterpreterExperience key="setup" />;
  if (query.data && !query.data.guided_state?.interpreter) return <LegacyInterpreteIA />;
  if (query.data) return <InterpreterExperience key={sessionId} session={query.data} />;
  return <DashboardLayout><div className="rounded-3xl border border-border bg-card p-8">{query.isLoading ? <p role="status">Carregando sessão...</p> : <div role="alert"><p>Não foi possível abrir esta sessão.</p><Button className="mt-4" variant="outline" onClick={() => void query.refetch()}>Tentar novamente</Button></div>}</div></DashboardLayout>;
};

export default InterpreteIA;
