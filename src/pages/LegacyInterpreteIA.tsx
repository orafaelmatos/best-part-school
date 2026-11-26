import AIContentReportButton from "@/components/AIContentReportButton";
import { startTransition, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  BookPlus,
  Check,
  CheckCircle2,
  CircleDashed,
  Ear,
  Eye,
  EyeOff,
  Headphones,
  History,
  Lightbulb,
  ListChecks,
  PenLine,
  Plus,
  RefreshCcw,
  Send,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import AudioPlayer from "@/components/AudioPlayer";
import QuickAddVocabularyCardDialog from "@/components/QuickAddVocabularyCardDialog";
import {
  Alert,
  Badge,
  Button,
  Card,
  ChatBubble,
  Chip,
  EmptyState,
  IconTile,
  ListGroup,
  ListItem,
  ProgressBar,
  ScreenTitle,
  SectionHeader,
  SkeletonCard,
  StudyBlock,
  cardVariants,
  inputClasses,
} from "@/components/student/ui";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { absoluteMediaUrl } from "@/lib/config";
import {
  aiStudySessionsQueryKey,
  buildInterpreterSessionPath,
  fetchAiStudySessions,
  formatDateTime,
  modeLabel,
  SessionSummary,
} from "@/lib/aiStudy";
import { cn } from "@/lib/utils";
import { APP_PATHS } from "@/lib/routes";

type TopicOption = {
  id: string;
  label: string;
  description: string;
};

type ResponseMode = "multiple_choice" | "transcription";

type InterpreterExerciseOption = {
  id: string;
  text: string;
};

type InterpreterJourneyStep = {
  id: string;
  label: string;
};

type InterpreterExercise = {
  id: string;
  round: number;
  scenario_key: string;
  scenario_label: string;
  level: string;
  instructions: string;
  tts_audio_url?: string | null;
  options: InterpreterExerciseOption[];
  correct_option_id: string;
  focus_words: string[];
  step_id?: string;
  step_title?: string;
  step_prompt?: string;
  step_index?: number;
  step_total?: number;
  is_final_step?: boolean;
  tts_unavailable?: boolean;
  journey_steps?: InterpreterJourneyStep[];
  response_mode_choices?: Array<{
    id: ResponseMode;
    label: string;
  }>;
};

type InterpreterFeedback = {
  challenge_message_id: string;
  response_mode: ResponseMode;
  selected_option_id?: string;
  status: "correct" | "close" | "incorrect";
  is_correct: boolean;
  similarity_score: number;
};

type InterpreterMessage = {
  id: string;
  role: "system" | "user" | "assistant";
  content_type: "text" | "audio" | "feedback" | "writing_feedback";
  text: string;
  created_at?: string;
  metadata?: {
    mode?: string;
    interpreter?: boolean;
    interpreter_exercise?: InterpreterExercise;
    interpreter_feedback?: InterpreterFeedback;
    challenge_message_id?: string;
    interpreter_response_mode?: ResponseMode;
  } | null;
};

type InterpreterSessionDetail = SessionSummary & {
  messages: InterpreterMessage[];
};

type ListeningActionResponse = {
  user_message?: InterpreterMessage | null;
  assistant_message?: InterpreterMessage | null;
  follow_up_message?: InterpreterMessage | null;
  session: SessionSummary;
};

const TOPIC_OPTIONS: TopicOption[] = [
  { id: "restaurant", label: "Restaurante", description: "Pedidos, mesa, conta e interações rápidas." },
  { id: "airport", label: "Aeroporto", description: "Portão, bagagem, check-in e orientações." },
  { id: "hotel", label: "Hotel", description: "Check-in, pedidos no quarto e dúvidas comuns." },
  { id: "work", label: "Trabalho", description: "Atualizações, reuniões e tarefas do dia." },
  { id: "job_interview", label: "Entrevista", description: "Respostas curtas sobre experiência e objetivos." },
  { id: "friends", label: "Conversa casual", description: "Planos, rotina e small talk natural." },
  { id: "phone_call", label: "Telefonema", description: "Chamadas curtas e confirmação de detalhes." },
  { id: "tourism", label: "Turismo", description: "Direções, passeios e recomendações em viagem." },
  { id: "custom", label: "Outro tópico", description: "Defina um contexto específico para o áudio." },
];

const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

const DEFAULT_RESPONSE_CHOICES: Array<{ id: ResponseMode; label: string }> = [
  { id: "multiple_choice", label: "Com alternativas" },
  { id: "transcription", label: "Escrever sozinho" },
];

const RESPONSE_MODE_ICONS = { multiple_choice: ListChecks, transcription: PenLine } as const;

const FEEDBACK_STATUS = {
  correct: { label: "Resposta correta", tone: "success", Icon: CheckCircle2, iconClass: "text-success" },
  close: { label: "Quase lá", tone: "warning", Icon: CircleDashed, iconClass: "text-warning" },
  incorrect: { label: "Resposta incorreta", tone: "danger", Icon: XCircle, iconClass: "text-danger" },
} as const;

const legendClass = "mb-3 text-h4 text-ink";

const getExercise = (message: InterpreterMessage) => message.metadata?.interpreter_exercise ?? null;
const getFeedback = (message: InterpreterMessage) => message.metadata?.interpreter_feedback ?? null;
const getChallengeMessageId = (message: InterpreterMessage) => message.metadata?.challenge_message_id ?? "";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/** Selectable topic card. The accessible name is label + description. */
const SetupTopicCard = ({
  topic,
  selected,
  onClick,
}: {
  topic: TopicOption;
  selected: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    aria-pressed={selected}
    onClick={onClick}
    className={cn(
      cardVariants({ variant: selected ? "highlight" : "default", padding: "md", interactive: true }),
      "relative min-h-16 w-full pr-12 text-left",
      selected && "border-primary",
    )}
  >
    <span className="block text-body font-semibold text-ink">{topic.label}</span>
    <span className="mt-1 block text-body text-ink-secondary">{topic.description}</span>
    {selected ? <Check size={20} className="absolute right-4 top-4 text-primary" aria-hidden="true" /> : null}
  </button>
);

const InterpreteIA = () => {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const seenMessagesRef = useRef<{ sessionId: string | null; count: number }>({ sessionId: null, count: 0 });

  const [sessionDraft, setSessionDraft] = useState<InterpreterSessionDetail | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string>("restaurant");
  const [customTopic, setCustomTopic] = useState("");
  const [selectedLevel, setSelectedLevel] = useState<(typeof CEFR_LEVELS)[number]>("A2");
  const [isCreating, setIsCreating] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [submittingChallengeId, setSubmittingChallengeId] = useState<string | null>(null);
  const [responseModeByMessage, setResponseModeByMessage] = useState<Record<string, ResponseMode>>({});
  const [selectedOptionByMessage, setSelectedOptionByMessage] = useState<Record<string, string>>({});
  const [answerTextByMessage, setAnswerTextByMessage] = useState<Record<string, string>>({});
  const [revealedAnswers, setRevealedAnswers] = useState<Record<string, boolean>>({});
  const [isQuickCardDialogOpen, setIsQuickCardDialogOpen] = useState(false);

  const selectedSessionId = sessionId ?? null;
  const selectedTopic = TOPIC_OPTIONS.find((topic) => topic.id === selectedTopicId) ?? TOPIC_OPTIONS[0];
  const resolvedTopicLabel = selectedTopic.id === "custom" ? customTopic.trim() : selectedTopic.label;

  const sessionsQuery = useQuery({
    queryKey: aiStudySessionsQueryKey("", ["listening"]),
    queryFn: () => fetchAiStudySessions("", ["listening"]),
  });

  const sessionDetailQuery = useQuery({
    queryKey: ["interpreter-session", selectedSessionId],
    enabled: Boolean(selectedSessionId),
    queryFn: async () => {
      const response = await api.get(`/ai-study/sessions/${selectedSessionId}/`);
      return response.data as InterpreterSessionDetail;
    },
  });

  const activeSession =
    sessionDraft && sessionDraft.id === selectedSessionId ? sessionDraft : sessionDetailQuery.data ?? null;

  const latestChallengeMessage = activeSession?.messages
    ? [...activeSession.messages].reverse().find((message) => Boolean(getExercise(message))) ?? null
    : null;
  const latestChallengeId = latestChallengeMessage?.id ?? null;

  useEffect(() => {
    if (sessionDetailQuery.data) {
      setSessionDraft(sessionDetailQuery.data);
    }
  }, [sessionDetailQuery.data]);

  // The page scrolls with the shell (no inner scroll box). When new messages arrive
  // (answer, feedback, next audio), bring the first new one into view. Opening a session
  // keeps the shell behavior of starting at the top of the page.
  useEffect(() => {
    const list = messageListRef.current;
    const currentId = activeSession?.id ?? null;
    const count = activeSession?.messages.length ?? 0;
    const previous = seenMessagesRef.current;
    seenMessagesRef.current = { sessionId: currentId, count };
    if (!list || !currentId || previous.sessionId !== currentId || count <= previous.count) return;
    const firstNew = list.children.item(previous.count) as HTMLElement | null;
    firstNew?.scrollIntoView?.({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  }, [activeSession?.id, activeSession?.messages]);

  useEffect(() => {
    setResponseModeByMessage({});
    setSelectedOptionByMessage({});
    setAnswerTextByMessage({});
    setRevealedAnswers({});
  }, [selectedSessionId]);

  const syncDraft = (nextSession: InterpreterSessionDetail) => {
    setSessionDraft(nextSession);
    queryClient.setQueryData(["interpreter-session", nextSession.id], nextSession);
  };

  const mergeSummaryIntoDraft = (summary: SessionSummary) => {
    setSessionDraft((current) => {
      if (!current || current.id !== summary.id) return current;
      const next = { ...current, ...summary };
      queryClient.setQueryData(["interpreter-session", next.id], next);
      return next;
    });
  };

  const invalidateSessionList = async () => {
    await queryClient.invalidateQueries({ queryKey: ["ai-study-sessions"] });
  };

  const appendMessages = (payload: ListeningActionResponse) => {
    setSessionDraft((current) => {
      if (!current) return current;
      const appendedMessages = [
        ...current.messages,
        ...(payload.user_message ? [payload.user_message] : []),
        ...(payload.assistant_message ? [payload.assistant_message] : []),
        ...(payload.follow_up_message ? [payload.follow_up_message] : []),
      ];
      const next: InterpreterSessionDetail = {
        ...current,
        ...payload.session,
        message_count: appendedMessages.length,
        messages: appendedMessages,
      };
      queryClient.setQueryData(["interpreter-session", next.id], next);
      return next;
    });
  };

  const handleCreateSession = async () => {
    if (!resolvedTopicLabel || !selectedLevel) {
      toast({
        title: "Selecione o tópico e o nível",
        description: "Precisamos dessas duas informações para gerar o primeiro áudio.",
        variant: "destructive",
      });
      return;
    }
    setIsCreating(true);
    try {
      const response = await api.post("/ai-study/sessions/", {
        mode: "listening",
        scenario_key: selectedTopic.id === "custom" ? "custom" : selectedTopic.id,
        scenario_label: resolvedTopicLabel,
        level: selectedLevel,
      });
      const createdSession = response.data as InterpreterSessionDetail;
      syncDraft(createdSession);
      startTransition(() => { void navigate(buildInterpreterSessionPath(createdSession.id)); });
      await invalidateSessionList();
    } catch {
      toast({
        title: "Não foi possível iniciar o treino",
        description: "Tente novamente em instantes.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenSession = (id: string) => {
    startTransition(() => { void navigate(buildInterpreterSessionPath(id)); });
  };

  const handleContinue = async () => {
    if (!activeSession || isContinuing) return;
    setIsContinuing(true);
    try {
      const response = await api.post(`/ai-study/sessions/${activeSession.id}/listening/next/`);
      const data = response.data as ListeningActionResponse;
      appendMessages(data);
      await invalidateSessionList();
    } catch {
      toast({
        title: "Não foi possível gerar o próximo áudio",
        description: "Tente novamente em instantes.",
        variant: "destructive",
      });
    } finally {
      setIsContinuing(false);
    }
  };

  const handleSubmitAnswer = async (message: InterpreterMessage) => {
    if (!activeSession) return;
    const exercise = getExercise(message);
    const responseMode = responseModeByMessage[message.id];
    if (!exercise || !responseMode) {
      toast({
        title: "Escolha como responder",
        description: "Selecione alternativas ou escrita livre antes de enviar.",
        variant: "destructive",
      });
      return;
    }

    const selectedOptionId = selectedOptionByMessage[message.id] || "";
    const answerText = (answerTextByMessage[message.id] || "").trim();
    if (responseMode === "multiple_choice" && !selectedOptionId) {
      toast({
        title: "Selecione uma alternativa",
        description: "Escolha a opção que melhor corresponde ao áudio.",
        variant: "destructive",
      });
      return;
    }
    if (responseMode === "transcription" && !answerText) {
      toast({
        title: "Digite sua transcrição",
        description: "Escreva o que você ouviu antes de enviar.",
        variant: "destructive",
      });
      return;
    }

    setSubmittingChallengeId(message.id);
    try {
      const response = await api.post(`/ai-study/sessions/${activeSession.id}/listening/answer/`, {
        message_id: message.id,
        response_mode: responseMode,
        selected_option_id: selectedOptionId,
        answer_text: answerText,
      });
      const data = response.data as ListeningActionResponse;
      appendMessages(data);
      mergeSummaryIntoDraft(data.session);
      await invalidateSessionList();
    } catch {
      toast({
        title: "Não foi possível enviar sua resposta",
        description: "Tente novamente em instantes.",
        variant: "destructive",
      });
    } finally {
      setSubmittingChallengeId(null);
    }
  };

  const handleDelete = async () => {
    if (!activeSession) return;
    const confirmed = window.confirm(`Excluir a sessão "${activeSession.title}"?`);
    if (!confirmed) return;
    try {
      await api.delete(`/ai-study/sessions/${activeSession.id}/`);
      setSessionDraft(null);
      await invalidateSessionList();
      navigate(APP_PATHS.interpreter);
    } catch {
      toast({
        title: "Não foi possível excluir a sessão",
        description: "Tente novamente em instantes.",
        variant: "destructive",
      });
    }
  };

  const getDraftResponseText = (message: InterpreterMessage) => {
    const responseMode = responseModeByMessage[message.id];
    if (responseMode === "multiple_choice") {
      const selectedId = selectedOptionByMessage[message.id];
      const exercise = getExercise(message);
      return exercise?.options.find((option) => option.id === selectedId)?.text || "";
    }
    if (responseMode === "transcription") {
      return (answerTextByMessage[message.id] || "").trim();
    }
    return "";
  };

  const getSubmittedResponseForChallenge = (challengeId: string) =>
    activeSession?.messages.find((message) => message.role === "user" && getChallengeMessageId(message) === challengeId) ?? null;

  const getFeedbackForChallenge = (challengeId: string) =>
    activeSession?.messages.find((message) => getFeedback(message)?.challenge_message_id === challengeId) ?? null;

  const renderDraftResponse = (message: InterpreterMessage) => {
    const draftText = getDraftResponseText(message);
    if (!draftText) return null;
    return (
      <div className="space-y-2">
        <p className="text-body font-semibold text-ink">Sua resposta</p>
        <ChatBubble from="student" className="whitespace-pre-line">
          <span lang="en">{draftText}</span>
        </ChatBubble>
      </div>
    );
  };

  const renderJourneyProgress = () => {
    const journey = activeSession?.guided_state?.listening_journey;
    const steps = journey?.steps || [];
    if (!steps.length) return null;

    const completedStepIds = new Set(journey?.completed_step_ids || []);
    const completedCount = completedStepIds.size;
    const currentIndex = Math.max(
      0,
      Math.min(journey?.current_step_index || 0, Math.max(steps.length - 1, 0)),
    );
    const currentStep = steps[currentIndex];
    const isCompleted = activeSession?.guided_state?.session_status === "completed";
    const progressLabel = isCompleted ? "Jornada concluída" : `Etapa ${Math.min(currentIndex + 1, steps.length)} de ${steps.length}`;

    return (
      <Card as="section" aria-labelledby="legacy-journey-title" padding="md" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="legacy-journey-title" className="text-caption text-ink-secondary">Jornada guiada</h2>
            <p className="mt-0.5 text-h4 text-ink">{progressLabel}</p>
            <p className="mt-1 text-body text-ink-secondary">
              {activeSession?.guided_state?.progress_summary || currentStep?.label || "A IA está conduzindo a próxima etapa."}
            </p>
          </div>
          <Badge tone={isCompleted ? "success" : "neutral"} icon={isCompleted ? <CheckCircle2 aria-hidden="true" /> : undefined}>
            {completedCount} de {steps.length} concluídas
          </Badge>
        </div>
        <ProgressBar value={Math.min(completedCount, steps.length)} max={steps.length} label="Etapas da jornada concluídas" />

        <ol aria-label="Etapas da jornada" className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {steps.map((step, index) => {
            const done = completedStepIds.has(step.id) || (isCompleted && index <= currentIndex);
            const active = !done && !isCompleted && index === currentIndex;
            return (
              <li
                key={step.id}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-md px-2 py-2 text-body",
                  active ? "bg-primary-subtle font-medium text-ink" : done ? "text-ink" : "text-ink-secondary",
                )}
              >
                {done ? (
                  <CheckCircle2 size={24} className="shrink-0 text-success" aria-hidden="true" />
                ) : (
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full text-label",
                      active ? "bg-primary text-primary-foreground" : "bg-surface-muted text-ink-secondary",
                    )}
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="sr-only">Etapa {index + 1}{done ? ", concluída" : active ? ", em andamento" : ""}: </span>
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      </Card>
    );
  };

  const renderChallengeActions = ({
    message,
    showSubmit,
    showRetryAudio,
  }: {
    message: InterpreterMessage;
    showSubmit: boolean;
    showRetryAudio: boolean;
  }) => {
    const responseMode = responseModeByMessage[message.id];
    const isSubmitting = submittingChallengeId === message.id;
    const isRevealed = Boolean(revealedAnswers[message.id]);
    const answerId = `legacy-answer-${message.id}`;

    return (
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {showSubmit ? (
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={() => void handleSubmitAnswer(message)}
              disabled={!responseMode || isContinuing}
              loading={isSubmitting}
              loadingLabel="Enviando resposta…"
            >
              <Send aria-hidden="true" />
              Enviar resposta
            </Button>
          ) : null}

          {showRetryAudio ? (
            <Button
              type="button"
              variant="secondary"
              className="h-auto w-full whitespace-normal py-2 sm:w-auto"
              onClick={() => void handleContinue()}
              disabled={isSubmitting}
              loading={isContinuing}
              loadingLabel="Gerando áudio…"
            >
              <RefreshCcw aria-hidden="true" />
              Gerar outro áudio desta etapa
            </Button>
          ) : null}

          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            aria-expanded={isRevealed}
            aria-controls={isRevealed ? answerId : undefined}
            onClick={() =>
              setRevealedAnswers((current) => ({
                ...current,
                [message.id]: !current[message.id],
              }))
            }
          >
            {isRevealed ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            {isRevealed ? "Ocultar resposta" : "Mostrar resposta"}
          </Button>
        </div>

        {isRevealed ? (
          <StudyBlock kind="example" title="Resposta" className="whitespace-pre-line">
            <p id={answerId} lang="en" className="leading-7">{message.text}</p>
          </StudyBlock>
        ) : null}
      </div>
    );
  };

  const renderChallengeCard = (message: InterpreterMessage, footer?: ReactNode) => {
    const exercise = getExercise(message);
    if (!exercise) return null;
    const responseMode = responseModeByMessage[message.id];
    const audioUrl = absoluteMediaUrl(exercise.tts_audio_url);
    const responseChoices = exercise.response_mode_choices?.length
      ? exercise.response_mode_choices
      : DEFAULT_RESPONSE_CHOICES;
    const stepLabel = `Etapa ${exercise.step_index || 1} de ${exercise.step_total || 1}`;
    const transcriptionId = `legacy-transcription-${message.id}`;

    return (
      <Card as="article" aria-label={`${stepLabel}, áudio ${exercise.round}`} padding="md" className="min-w-0 space-y-5 sm:p-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-caption text-ink-secondary">{stepLabel} · Áudio {exercise.round}</p>
            <h2 className="mt-1 text-h3 text-ink">{exercise.step_title || exercise.scenario_label}</h2>
            {exercise.step_title ? <p className="mt-0.5 text-body text-ink-secondary">{exercise.scenario_label}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">{exercise.level}</Badge>
            <Badge tone="neutral">{formatDateTime(message.created_at)}</Badge>
          </div>
        </header>

        <p className="text-body-lg text-ink">{exercise.instructions}</p>

        {audioUrl ? (
          <AudioPlayer src={audioUrl} compact />
        ) : exercise.tts_unavailable ? (
          <Alert tone="warning" title="O áudio desta etapa não ficou disponível agora.">
            Tente gerar outro áudio desta etapa em instantes.
          </Alert>
        ) : null}

        <div className="space-y-4 border-t border-line pt-5">
          <h3 className="text-h4 text-ink">Como você prefere responder?</h3>
          <div role="group" aria-label="Forma de resposta" className="flex flex-wrap gap-2">
            {responseChoices.map((choice) => {
              const Icon = RESPONSE_MODE_ICONS[choice.id] ?? ListChecks;
              return (
                <Chip
                  key={choice.id}
                  selected={responseMode === choice.id}
                  onClick={() => setResponseModeByMessage((current) => ({ ...current, [message.id]: choice.id }))}
                >
                  <Icon aria-hidden="true" />
                  {choice.label}
                </Chip>
              );
            })}
          </div>

          {responseMode === "multiple_choice" ? (
            <div role="group" aria-label="Alternativas" className="space-y-2">
              {exercise.options.map((option) => {
                const selected = selectedOptionByMessage[message.id] === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      setSelectedOptionByMessage((current) => ({
                        ...current,
                        [message.id]: option.id,
                      }))
                    }
                    className={cn(
                      "flex min-h-12 w-full items-start gap-3 rounded-lg border p-3 text-left text-body-lg text-ink transition-colors duration-150 ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      selected ? "border-primary bg-primary-subtle" : "border-line bg-surface hover:bg-surface-muted",
                    )}
                  >
                    <span lang="en" className="min-w-0 flex-1">{option.text}</span>
                    {selected ? <Check size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          {responseMode === "transcription" ? (
            <div>
              <label htmlFor={transcriptionId} className="block text-body font-medium text-ink">
                Escreva o que você ouviu
              </label>
              <textarea
                id={transcriptionId}
                lang="en"
                value={answerTextByMessage[message.id] || ""}
                onChange={(event) =>
                  setAnswerTextByMessage((current) => ({
                    ...current,
                    [message.id]: event.target.value,
                  }))
                }
                rows={4}
                placeholder="Escreva em inglês exatamente o que você ouviu."
                className={cn(inputClasses, "mt-2 block min-h-32 py-3 leading-7")}
              />
            </div>
          ) : null}

          {footer}
        </div>

        <section aria-label="Dicas" className="space-y-3 rounded-lg bg-surface-muted p-4">
          <p className="flex items-center gap-2 text-body font-semibold text-ink">
            <Lightbulb size={16} className="shrink-0 text-primary" aria-hidden="true" />
            Dicas
          </p>
          <ul className="list-disc space-y-1 pl-5 text-body text-ink-secondary marker:text-ink-secondary">
            <li>Ouça mais de uma vez antes de revelar a resposta.</li>
            <li>Se travar, comece por palavras-chave e depois monte a frase inteira.</li>
          </ul>
          {exercise.focus_words.length ? (
            <div>
              <p className="text-body font-medium text-ink">Palavras em foco</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {exercise.focus_words.map((word) => (
                  <li key={word}>
                    <Badge tone="neutral" lang="en" className="bg-surface">{word}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <AIContentReportButton messageId={message.id} />
      </Card>
    );
  };

  const renderFeedbackCard = (message: InterpreterMessage) => {
    const feedback = getFeedback(message);
    if (!feedback) return null;
    const status = FEEDBACK_STATUS[feedback.status] ?? FEEDBACK_STATUS.incorrect;
    const StatusIcon = status.Icon;

    return (
      <Card as="article" aria-label="Feedback da IA" padding="md" className="min-w-0 space-y-3 sm:p-5">
        <div className="flex items-start gap-3">
          <IconTile icon={Sparkles} tone="ai" size="sm" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-caption text-ai">Feedback da IA</p>
            <Badge tone={status.tone} icon={<StatusIcon className={status.iconClass} aria-hidden="true" />}>
              {status.label}
            </Badge>
          </div>
        </div>
        <p className="whitespace-pre-line text-body-lg text-ink">{message.text}</p>
        <p className="text-caption text-ink-muted">Similaridade estimada: {feedback.similarity_score}%</p>
        {message.role === "assistant" && <AIContentReportButton messageId={message.id} />}
      </Card>
    );
  };

  const renderSetup = () => (
    <>
      <ScreenTitle
        eyebrow={<Badge tone="ai" icon={<Headphones aria-hidden="true" />} className="mb-1">Intérprete IA</Badge>}
        title="Treine escuta com áudio gerado pela IA"
        description="Escolha um tópico e um nível. A IA conduz uma jornada por etapas, do início ao fim da situação, conforme você responde e acerta."
      />

      <fieldset className="min-w-0">
        <legend className={legendClass}>Tópico</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {TOPIC_OPTIONS.map((topic) => (
            <SetupTopicCard
              key={topic.id}
              topic={topic}
              selected={selectedTopicId === topic.id}
              onClick={() => setSelectedTopicId(topic.id)}
            />
          ))}
        </div>
        {selectedTopicId === "custom" ? (
          <label className="mt-4 block text-body font-medium text-ink">
            Descreva o tópico
            <input
              value={customTopic}
              onChange={(event) => setCustomTopic(event.target.value)}
              placeholder="Ex.: atendimento ao cliente, consulta médica, reunião de equipe…"
              className={cn(inputClasses, "mt-2 font-normal")}
            />
          </label>
        ) : null}
      </fieldset>

      <fieldset className="min-w-0">
        <legend className={legendClass}>Nível</legend>
        <div className="flex flex-wrap gap-2">
          {CEFR_LEVELS.map((level) => (
            <Chip key={level} selected={selectedLevel === level} className="min-w-14 justify-center" onClick={() => setSelectedLevel(level)}>
              {level}
            </Chip>
          ))}
        </div>
      </fieldset>

      <Card as="section" aria-label="Resumo do treino" className="space-y-4">
        <div className="flex items-start gap-3">
          <IconTile icon={Ear} />
          <div className="min-w-0">
            <h2 className="text-h4 text-ink">{resolvedTopicLabel || "Escolha um tópico"}</h2>
            <p className="text-body text-ink-secondary">Nível {selectedLevel}</p>
          </div>
        </div>
        <ol className="list-decimal space-y-1 pl-5 text-body text-ink-secondary marker:text-ink-muted">
          <li>A IA inicia uma jornada guiada dentro do contexto escolhido.</li>
          <li>Cada áudio pertence a uma etapa real da situação.</li>
          <li>Quando você acerta, a prática avança para a próxima fase.</li>
        </ol>
        <Button
          size="lg"
          fullWidth
          onClick={() => void handleCreateSession()}
          disabled={!resolvedTopicLabel}
          loading={isCreating}
          loadingLabel="Preparando treino…"
        >
          <Headphones aria-hidden="true" />
          Iniciar treino
        </Button>
      </Card>

      {sessionsQuery.data?.length ? (
        <section aria-label="Últimas sessões">
          <SectionHeader title="Últimas sessões" />
          <ListGroup>
            {sessionsQuery.data.slice(0, 3).map((session) => (
              <ListItem
                key={session.id}
                leading={<IconTile icon={History} tone="neutral" size="sm" />}
                title={session.title}
                description={`${session.guided_state?.scenario_label || modeLabel[session.mode]} · ${formatDateTime(session.last_interaction_at)}`}
                onClick={() => handleOpenSession(session.id)}
              />
            ))}
          </ListGroup>
        </section>
      ) : null}
    </>
  );

  const renderSession = (session: InterpreterSessionDetail) => (
    <>
      <ScreenTitle
        eyebrow={<Badge tone="ai" icon={<Headphones aria-hidden="true" />} className="mb-1">{modeLabel[session.mode]}</Badge>}
        title={session.title}
        description={`${session.message_count} mensagens · última interação em ${formatDateTime(session.last_interaction_at)}`}
      />

      <Card padding="md" className="flex flex-wrap items-center justify-between gap-3">
        {session.guided_state?.scenario_label || session.guided_state?.level ? (
          <div className="flex min-w-0 flex-wrap gap-2">
            {session.guided_state?.scenario_label ? <Badge tone="neutral">{session.guided_state.scenario_label}</Badge> : null}
            {session.guided_state?.level ? <Badge tone="neutral">Nível {session.guided_state.level}</Badge> : null}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setIsQuickCardDialogOpen(true)}>
            <BookPlus aria-hidden="true" />
            Adicionar palavra
          </Button>
          <Button size="sm" variant="ghost" onClick={() => navigate(APP_PATHS.interpreter)}>
            <Plus aria-hidden="true" />
            Novo treino
          </Button>
          <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft" onClick={() => void handleDelete()}>
            <Trash2 aria-hidden="true" />
            Excluir
          </Button>
        </div>
      </Card>

      {renderJourneyProgress()}

      <div ref={messageListRef} className="flex flex-col gap-4">
        {session.messages.map((message) => {
          if (getExercise(message)) {
            const submittedResponse = getSubmittedResponseForChallenge(message.id);
            const draftText = getDraftResponseText(message);
            const shouldRenderDraftActions = message.id === latestChallengeId && !submittedResponse && Boolean(draftText);
            return (
              <div key={message.id} className="scroll-mt-24">
                {renderChallengeCard(
                  message,
                  shouldRenderDraftActions ? (
                    <>
                      {renderDraftResponse(message)}
                      {renderChallengeActions({ message, showSubmit: true, showRetryAudio: false })}
                    </>
                  ) : null,
                )}
              </div>
            );
          }
          if (getFeedback(message)) {
            const feedback = getFeedback(message);
            const challengeId = feedback?.challenge_message_id || "";
            const shouldRenderPostAnswerActions = Boolean(
              challengeId &&
              challengeId === latestChallengeId &&
              getSubmittedResponseForChallenge(challengeId) &&
              getFeedbackForChallenge(challengeId)?.id === message.id &&
              feedback?.status !== "correct",
            );
            const challengeMessage = session.messages.find((item) => item.id === challengeId) ?? null;

            return (
              <div key={message.id} className="scroll-mt-24 space-y-4">
                {renderFeedbackCard(message)}
                {shouldRenderPostAnswerActions && challengeMessage
                  ? renderChallengeActions({ message: challengeMessage, showSubmit: false, showRetryAudio: true })
                  : null}
              </div>
            );
          }
          return (
            <div key={message.id} className="scroll-mt-24">
              <ChatBubble from={message.role === "user" ? "student" : "ai"} className="whitespace-pre-line">
                {message.text}
              </ChatBubble>
            </div>
          );
        })}
      </div>

      <QuickAddVocabularyCardDialog
        open={isQuickCardDialogOpen}
        onOpenChange={setIsQuickCardDialogOpen}
        sourceTag="Interprete IA"
      />
    </>
  );

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-3xl space-y-8 pb-8">
        {!selectedSessionId ? (
          renderSetup()
        ) : activeSession ? (
          renderSession(activeSession)
        ) : selectedSessionId && sessionDetailQuery.isLoading ? (
          <SkeletonCard label="Carregando sessão" lines={3} />
        ) : (
          <div className={cardVariants({ variant: "dashed", padding: "none" })}>
            <EmptyState
              icon={Headphones}
              title="Sessão não encontrada"
              description="Essa sessão não está mais disponível. Você pode iniciar um novo treino ou abrir outra sessão pelo histórico."
              action={<Button onClick={() => navigate(APP_PATHS.interpreter)}>Voltar ao intérprete</Button>}
            />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default InterpreteIA;
