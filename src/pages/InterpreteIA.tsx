import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { BookOpen, Check, ChevronDown, Headphones, History, Languages, Mic, Plus } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Alert, Badge, Button, Card, Chip, EmptyState, IconTile, ListGroup, ListItem, ProgressBar, ScreenTitle, SectionHeader, SkeletonCard, StudyBlock, cardVariants, inputClasses } from "@/components/student/ui";
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

const modes = [
  ["consecutive", "Interpretação consecutiva", "Ouça um trecho e interprete. O personagem espera sua resposta."],
  ["guided", "Treinamento guiado", "Repita o áudio e consulte dicas adaptadas ao seu nível."],
  ["simultaneous", "Interpretação simultânea", "Avançado: interprete enquanto o original continua. Pause e retome os dois juntos."],
] as const;

const defaultSettings: InterpreterSettings = { direction: "en_pt", interpretation_mode: "consecutive", session_style: "journey", duration_minutes: 5, prepare_vocabulary: false, realistic: false };

const legendClass = "mb-3 text-h4 text-ink";
const fieldLabelClass = "block text-body font-medium text-ink";

/** Selectable option card (situation, interpretation type). The accessible name is label + description. */
const OptionCard = ({ selected, label, description, onClick }: { selected: boolean; label: string; description: string; onClick: () => void }) => (
  <button type="button" aria-pressed={selected} onClick={onClick}
    className={cn(cardVariants({ variant: selected ? "highlight" : "default", padding: "md", interactive: true }), "relative min-h-16 w-full pr-12 text-left", selected && "border-primary")}>
    <span className="block text-body font-semibold text-ink">{label}</span>
    <span className={cn("mt-1 block text-body", selected ? "text-ink" : "text-ink-secondary")}>{description}</span>
    {selected ? <Check size={20} className="absolute right-4 top-4 text-primary" aria-hidden="true" /> : null}
  </button>
);

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
  const simultaneousSetup = settings.interpretation_mode === "simultaneous";
  const currentStep = current?.metadata?.interpretation_turn?.step_index;
  const history = session?.messages.filter((m) => m.metadata?.interpretation_turn && m.id !== current?.id) ?? [];

  return <DashboardLayout><div className="mx-auto w-full max-w-3xl space-y-8 pb-8">
    <ScreenTitle eyebrow={<Badge tone="ai" icon={<Languages aria-hidden="true" />} className="mb-1">Intérprete IA</Badge>}
      title={session ? session.title : "Dê voz à mensagem em outro idioma"}
      description={session ? state?.plan.situation : "Ouça pessoas em situações reais, compreenda a mensagem e interprete pelo microfone. O foco é preservar o significado."} />
    {error ? <Alert tone="danger" role="alert" title={error} /> : null}

    {!session ? <>
      <div className="space-y-8">
        <fieldset className="min-w-0"><legend className={legendClass}>1. Escolha a situação</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {topics.map((item) => <OptionCard key={item.id} selected={topic === item.id} label={item.label} description={item.description} onClick={() => setTopic(item.id)} />)}
          </div>
          {topic === "custom" ? <label className={cn(fieldLabelClass, "mt-4")}>Descreva a situação
            <input value={custom} maxLength={120} onChange={(e) => setCustom(e.target.value)} placeholder="Ex.: uma pesquisadora apresenta seu projeto em um evento" className={cn(inputClasses, "mt-2 font-normal")} />
          </label> : null}
        </fieldset>

        <fieldset className="min-w-0"><legend className={legendClass}>2. Direção da interpretação</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(directionNames) as Array<[InterpreterSettings["direction"], string]>).map(([id, label]) => <Chip key={id} selected={settings.direction === id} onClick={() => setSetting("direction", id)}>{label}</Chip>)}
          </div>
          <p className="mt-2 text-body text-ink-secondary">No modo alternado, você interpreta as falas dos dois personagens, cada uma para o outro idioma.</p>
        </fieldset>

        <fieldset className="min-w-0"><legend className={legendClass}>3. Tipo de interpretação</legend>
          <div className="grid grid-cols-1 gap-3">
            {modes.map(([id, label, description]) => <OptionCard key={id} selected={settings.interpretation_mode === id} label={label} description={description}
              onClick={() => setSettings((previous) => ({ ...previous, interpretation_mode: id, ...(id === "simultaneous" ? { segment_duration_seconds: previous.segment_duration_seconds ?? 60, playback_speed: previous.playback_speed ?? 1 } : {}) }))} />)}
          </div>
          {simultaneousSetup ? <Card variant="muted" padding="md" className="mt-3 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={fieldLabelClass}>Duração aproximada de cada fala
                <select aria-label="Duração da fala simultânea" className={cn(inputClasses, "mt-2 font-normal")} value={settings.segment_duration_seconds ?? 60} onChange={(e) => setSetting("segment_duration_seconds", Number(e.target.value))}>
                  {[30, 60, 90, 120].map((seconds) => <option key={seconds} value={seconds}>{seconds} segundos</option>)}
                </select>
              </label>
              <label className={fieldLabelClass}>Velocidade inicial
                <select aria-label="Velocidade inicial da simultânea" className={cn(inputClasses, "mt-2 font-normal")} value={settings.playback_speed ?? 1} onChange={(e) => setSetting("playback_speed", Number(e.target.value))}>
                  {[0.6, 0.75, 0.8, 0.9, 1, 1.25].map((speed) => <option key={speed} value={speed}>{speed}x</option>)}
                </select>
              </label>
            </div>
            <p className="text-body text-ink">A duração orienta o tamanho da fala; o tempo real depende da voz e da velocidade. Use fones para ouvir o original enquanto interpreta. Você poderá revisar os dois áudios juntos.</p>
          </Card> : null}
        </fieldset>

        <fieldset className="min-w-0"><legend className={legendClass}>4. Nível CEFR</legend>
          <div className="flex flex-wrap gap-2">{["A1", "A2", "B1", "B2", "C1", "C2"].map((value) => <Chip key={value} selected={level === value} className="min-w-14 justify-center" onClick={() => setLevel(value)}>{value}</Chip>)}</div>
          <p className="mt-3 text-body text-ink-secondary">{level.startsWith("A") ? "Frases curtas, vocabulário cotidiano, áudio lento e mais apoio." : level.startsWith("B") ? "Trechos mais longos, construções variadas e dicas pontuais." : "Trechos longos, expressões idiomáticas, vocabulário especializado e ritmo natural."}</p>
        </fieldset>

        <fieldset className="min-w-0"><legend className={legendClass}>5. Formato da sessão</legend>
          <div className="flex flex-wrap gap-2">
            <Chip selected={settings.session_style === "journey"} onClick={() => setSetting("session_style", "journey")}>Jornada de cinco etapas</Chip>
            <Chip selected={settings.session_style === "free"} onClick={() => setSetting("session_style", "free")}>Interpretação livre</Chip>
          </div>
          {settings.session_style === "free" ? <label className={cn(fieldLabelClass, "mt-4")}>Duração aproximada
            <select className={cn(inputClasses, "mt-2 font-normal sm:max-w-xs")} value={settings.duration_minutes} onChange={(e) => setSetting("duration_minutes", Number(e.target.value))}>
              {[2, 5, 10, 15].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutos</option>)}
            </select>
            <span className="mt-2 block text-body font-normal text-ink-secondary">O tempo varia conforme o ritmo das suas respostas. As etapas não são anunciadas durante a conversa.</span>
          </label> : null}
        </fieldset>

        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          <li><label className="flex min-h-16 cursor-pointer items-start gap-3 px-4 py-3">
            <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-primary" checked={settings.prepare_vocabulary} onChange={(e) => setSetting("prepare_vocabulary", e.target.checked)} />
            <span className="min-w-0"><span className="block text-body font-medium text-ink">Preparar vocabulário</span><span className="mt-0.5 block text-body text-ink-secondary">Conheça expressões, exemplos e traduções antes de interpretar. Opcional.</span></span>
          </label></li>
          <li><label className="flex min-h-16 cursor-pointer items-start gap-3 px-4 py-3">
            <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-primary" checked={settings.realistic} onChange={(e) => setSetting("realistic", e.target.checked)} />
            <span className="min-w-0"><span className="block text-body font-medium text-ink">Simulação real</span><span className="mt-0.5 block text-body text-ink-secondary">Transcrição e dicas ficam ocultas até você responder.</span></span>
          </label></li>
        </ul>

        <Card as="section" aria-label="Resumo do treino" className="space-y-4">
          <div className="flex items-start gap-3">
            <IconTile icon={Headphones} />
            <div className="min-w-0">
              <h2 className="text-h4 text-ink">Seu treino de interpretação</h2>
              <p className="mt-1 text-body text-ink">{topic === "custom" ? custom || "Seu cenário" : selected.label} · {level}</p>
              <p className="text-body text-ink-secondary">{directionNames[settings.direction]} · {interpretationModeNames[settings.interpretation_mode]}</p>
            </div>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-body text-ink-secondary marker:text-ink-muted">
            <li>{simultaneousSetup ? "Inicie o áudio e o microfone juntos." : "Ouça a fala do personagem."}</li>
            <li>{simultaneousSetup ? "Interprete enquanto o personagem fala." : "Grave sua interpretação no outro idioma."}</li>
            <li>Ouça sua gravação e envie para receber feedback.</li>
            <li>Continue a situação até o encerramento.</li>
          </ol>
          <Button size="lg" fullWidth disabled={topic === "custom" && !custom.trim()} loading={busy} loadingLabel="Preparando cenário…" onClick={create}>
            <Mic aria-hidden="true" />Iniciar interpretação
          </Button>
        </Card>
      </div>

      <section aria-label="Últimas sessões">
        <SectionHeader title="Últimas sessões" />
        {sessions.isLoading ? <SkeletonCard label="Carregando sessões" />
          : sessions.isError ? <Alert tone="danger" role="alert" title="Não carregamos suas sessões." action={<Button size="sm" variant="outline" onClick={() => void sessions.refetch()}>Tentar carregar sessões novamente</Button>}>Verifique sua conexão e tente de novo.</Alert>
            : sessions.data?.length ? <ListGroup>{sessions.data.slice(0, 9).map((item) => <ListItem key={item.id}
              leading={<IconTile icon={item.guided_state?.interpreter ? Languages : Headphones} tone="neutral" size="sm" />}
              title={item.title} description={`${item.guided_state?.interpreter ? "Simulação de interpretação" : "Prática de listening anterior"} · ${formatDateTime(item.last_interaction_at)}`}
              onClick={() => navigate(buildInterpreterSessionPath(item.id))} />)}</ListGroup>
              : <div className={cardVariants({ variant: "dashed", padding: "none" })}><EmptyState compact icon={History} title="Nenhuma sessão ainda" description="Suas sessões ficarão salvas aqui." /></div>}
      </section>
    </> : state ? <>
      <Card padding="md" className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap gap-2">
          <Badge tone="neutral">{directionNames[state.settings.direction]}</Badge>
          <Badge tone="neutral">{state.level}</Badge>
          <Badge tone="neutral">{interpretationModeNames[state.settings.interpretation_mode]}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={() => navigate(APP_PATHS.interpreter)} disabled={busy || activityBusy}><Plus aria-hidden="true" />Novo treino</Button>
          {!readOnly && state.status !== "completed" ? <Button size="sm" variant="outline" className="h-auto whitespace-normal py-2" disabled={busy || activityBusy || state.status === "reviewing"} onClick={() => void action("finish").catch(() => undefined)}>Encerrar sessão e ver relatório</Button> : null}
        </div>
      </Card>
      {readOnly ? <Alert tone="info" title="Visualização do professor">As respostas e o relatório são os mesmos apresentados ao aluno.</Alert> : null}

      {state.settings.session_style === "journey" ? <Card as="section" padding="md" aria-label="Jornada" className="space-y-3">
        {currentStep !== undefined ? <>
          <p className="text-body font-medium text-ink">Etapa {currentStep + 1} de {state.plan.steps.length}</p>
          <ProgressBar value={currentStep + 1} max={state.plan.steps.length} label="Etapas da jornada concluídas ou em andamento" />
        </> : null}
        <ol aria-label="Etapas da jornada" className="grid grid-cols-1 gap-2 sm:grid-cols-5">
          {state.plan.steps.map((step, index) => {
            const active = currentStep === index;
            return <li key={index} aria-current={active ? "step" : undefined} className={cn("flex items-start gap-2 rounded-md p-2 text-body sm:flex-col", active ? "bg-primary-subtle font-medium text-ink" : "text-ink-secondary")}>
              <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-label", active ? "bg-primary text-primary-foreground" : "bg-surface-muted text-ink")} aria-hidden="true">{index + 1}</span>
              <span className="min-w-0"><span className="sr-only">{index + 1}. </span>{step.title}</span>
            </li>;
          })}
        </ol>
      </Card> : null}

      {state.status === "ready" ? <section className="space-y-4">
        <div className="flex items-start gap-3">
          <IconTile icon={BookOpen} tone="ai" />
          <SectionHeader className="mb-0" title="Preparar vocabulário" description="Estas expressões podem aparecer na situação. A preparação é opcional." />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">{state.plan.vocabulary.map((item, index) => <Card as="article" key={index} padding="md" className="min-w-0 space-y-3">
          <h3 className="text-h4 text-ink"><span lang="en">{item.expression}</span> <span className="font-normal text-ink-secondary">— {item.translation}</span></h3>
          <StudyBlock kind="example" title="Exemplo">
            <p lang="en">{item.example}</p>
            <p lang="pt-BR" className="mt-1 text-body text-ink">{item.example_translation}</p>
          </StudyBlock>
          <div className="flex flex-col gap-2">
            <InterpreterAudio sessionId={session.id} part="vocabulary" vocabularyIndex={index} label={`Ouvir ${item.expression}`} />
            <InterpreterAudio sessionId={session.id} part="example" vocabularyIndex={index} label="Ouvir exemplo" />
          </div>
        </Card>)}</div>
        {!readOnly ? <Button size="lg" fullWidth loading={busy} loadingLabel="Preparando primeira fala…" onClick={() => void action("next").catch(() => undefined)}>Começar a interpretar</Button> : null}
      </section> : null}

      {state.status !== "ready" && current ? <div className="space-y-4">
        <InterpreterTurnCard key={current.id} sessionId={session.id} message={current} state={state} answer={answerFor(current.id)} feedback={currentFeedback} busy={busy} readOnly={readOnly || state.status === "completed"}
          onAnswer={(data) => action("answer", data)} onRetry={() => retry(current.id)} onActivityChange={setActivityBusy} />
        {currentFeedback && !readOnly && state.status !== "completed" ? <Button size="lg" fullWidth loading={busy} loadingLabel="Preparando próxima fala…" onClick={() => void action("next").catch(() => undefined)}>Próxima fala</Button> : null}
      </div> : null}

      {state.status === "completed" && state.report ? <InterpreterReportCard report={state.report} disabled={busy} onRetry={readOnly ? undefined : retry} /> : null}

      {history.length ? <details className="group space-y-4">
        <summary className={cardVariants({ padding: "md", interactive: true, className: "flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden" })}>
          <IconTile icon={History} tone="neutral" size="sm" />
          <span className="min-w-0 flex-1 text-body font-semibold text-ink">Histórico das interpretações</span>
          <Badge tone="neutral">{history.length}</Badge>
          <ChevronDown size={20} className="shrink-0 text-ink-muted transition-transform duration-200 ease-standard group-open:rotate-180" aria-hidden="true" />
        </summary>
        {history.map((message) => <InterpreterTurnCard key={message.id} sessionId={session.id} message={message} state={state} answer={answerFor(message.id)} feedback={feedbackFor(message.id)} busy={busy} readOnly onAnswer={async () => undefined} onRetry={() => undefined} />)}
      </details> : null}
    </> : null}
  </div></DashboardLayout>;
};

const InterpreteIA = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const query = useQuery({ queryKey: ["interpreter-session", sessionId], enabled: Boolean(sessionId), queryFn: async () => (await api.get(`/ai-study/sessions/${sessionId}/`)).data as InterpreterSession });
  if (!sessionId) return <InterpreterExperience key="setup" />;
  if (query.data && !query.data.guided_state?.interpreter) return <LegacyInterpreteIA />;
  if (query.data) return <InterpreterExperience key={sessionId} session={query.data} />;
  return <DashboardLayout>{query.isLoading ? <SkeletonCard label="Carregando sessão" lines={3} />
    : <Alert tone="danger" role="alert" title="Não foi possível abrir esta sessão." action={<Button size="sm" variant="outline" onClick={() => void query.refetch()}>Tentar novamente</Button>}>Verifique sua conexão e tente de novo.</Alert>}</DashboardLayout>;
};

export default InterpreteIA;
