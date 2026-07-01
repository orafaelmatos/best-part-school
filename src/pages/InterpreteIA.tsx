import { startTransition, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  BookPlus,
  CheckCircle2,
  CircleDashed,
  Ear,
  Eye,
  Headphones,
  Loader2,
  RefreshCcw,
  Send,
  Trash2,
} from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import AudioPlayer from "@/components/AudioPlayer";
import QuickAddVocabularyCardDialog from "@/components/QuickAddVocabularyCardDialog";
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
  session: SessionSummary;
};

const TOPIC_OPTIONS: TopicOption[] = [
  { id: "restaurant", label: "Restaurante", description: "Pedidos, mesa, conta e interacoes rapidas." },
  { id: "airport", label: "Aeroporto", description: "Portao, bagagem, check-in e orientacoes." },
  { id: "hotel", label: "Hotel", description: "Check-in, pedidos no quarto e duvidas comuns." },
  { id: "work", label: "Trabalho", description: "Atualizacoes, reunioes e tarefas do dia." },
  { id: "job_interview", label: "Entrevista", description: "Respostas curtas sobre experiencia e objetivos." },
  { id: "friends", label: "Conversa casual", description: "Planos, rotina e small talk natural." },
  { id: "phone_call", label: "Telefonema", description: "Chamadas curtas e confirmacao de detalhes." },
  { id: "tourism", label: "Turismo", description: "Direcoes, passeios e recomendacoes em viagem." },
  { id: "custom", label: "Outro topico", description: "Defina um contexto especifico para o audio." },
];

const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

const getExercise = (message: InterpreterMessage) => message.metadata?.interpreter_exercise ?? null;
const getFeedback = (message: InterpreterMessage) => message.metadata?.interpreter_feedback ?? null;
const getChallengeMessageId = (message: InterpreterMessage) => message.metadata?.challenge_message_id ?? "";

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
    onClick={onClick}
    className={cn(
      "rounded-[26px] border p-4 text-left transition",
      selected
        ? "border-amber-300 bg-[linear-gradient(135deg,rgba(254,243,199,0.85),rgba(255,255,255,0.96))] shadow-[0_18px_48px_-34px_rgba(217,119,6,0.55)]"
        : "border-slate-200/80 bg-white/95 hover:border-slate-300 hover:bg-slate-50",
    )}
  >
    <p className="text-sm font-semibold text-foreground">{topic.label}</p>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">{topic.description}</p>
  </button>
);

const SetupLevelButton = ({
  level,
  selected,
  onClick,
}: {
  level: (typeof CEFR_LEVELS)[number];
  selected: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
      selected
        ? "border-slate-900 bg-slate-900 text-white"
        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
    )}
  >
    {level}
  </button>
);

const InterpreteIA = () => {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const messageListRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    const element = messageListRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [activeSession?.messages]);

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
      const next: InterpreterSessionDetail = {
        ...current,
        ...payload.session,
        messages: [
          ...current.messages,
          ...(payload.user_message ? [payload.user_message] : []),
          ...(payload.assistant_message ? [payload.assistant_message] : []),
        ],
      };
      queryClient.setQueryData(["interpreter-session", next.id], next);
      return next;
    });
  };

  const handleCreateSession = async () => {
    if (!resolvedTopicLabel || !selectedLevel) {
      toast({
        title: "Selecione o topico e o nivel",
        description: "Precisamos dessas duas informacoes para gerar o primeiro audio.",
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
      startTransition(() => navigate(buildInterpreterSessionPath(createdSession.id)));
      await invalidateSessionList();
    } catch {
      toast({
        title: "Nao foi possivel iniciar o interprete",
        description: "Tente novamente em instantes.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenSession = (id: string) => {
    startTransition(() => navigate(buildInterpreterSessionPath(id)));
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
        title: "Nao foi possivel gerar o proximo audio",
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
        description: "Escolha a opcao que melhor corresponde ao audio.",
        variant: "destructive",
      });
      return;
    }
    if (responseMode === "transcription" && !answerText) {
      toast({
        title: "Digite sua transcricao",
        description: "Escreva o que voce ouviu antes de enviar.",
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
        title: "Nao foi possivel enviar sua resposta",
        description: "Tente novamente em instantes.",
        variant: "destructive",
      });
    } finally {
      setSubmittingChallengeId(null);
    }
  };

  const handleDelete = async () => {
    if (!activeSession) return;
    const confirmed = window.confirm(`Excluir a sessao "${activeSession.title}"?`);
    if (!confirmed) return;
    try {
      await api.delete(`/ai-study/sessions/${activeSession.id}/`);
      setSessionDraft(null);
      await invalidateSessionList();
      navigate(APP_PATHS.interpreter);
    } catch {
      toast({
        title: "Nao foi possivel excluir a sessao",
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
      <div className="mt-4 flex justify-end">
        <div className="max-w-3xl rounded-[24px] bg-slate-950 px-4 py-3 text-sm leading-6 text-white shadow-sm">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/65">Sua resposta</p>
          <p className="whitespace-pre-line">{draftText}</p>
        </div>
      </div>
    );
  };

  const renderChallengeActions = ({
    message,
    showSubmit,
  }: {
    message: InterpreterMessage;
    showSubmit: boolean;
  }) => {
    const responseMode = responseModeByMessage[message.id];
    const isSubmitting = submittingChallengeId === message.id;
    const isRevealed = Boolean(revealedAnswers[message.id]);

    return (
      <div className="mt-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          {showSubmit ? (
            <button
              type="button"
              onClick={() => void handleSubmitAnswer(message)}
              disabled={!responseMode || isSubmitting || isContinuing}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar resposta
            </button>
          ) : null}

          <button
            type="button"
            onClick={() =>
              setRevealedAnswers((current) => ({
                ...current,
                [message.id]: !current[message.id],
              }))
            }
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Eye className="h-4 w-4" />
            {isRevealed ? "Ocultar resposta" : "Mostrar resposta"}
          </button>

          <button
            type="button"
            onClick={() => void handleContinue()}
            disabled={isContinuing || isSubmitting}
            className="inline-flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
          >
            {isContinuing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Continuar
          </button>
        </div>

        {isRevealed ? (
          <div className="rounded-[22px] border border-emerald-200 bg-emerald-50/80 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Resposta</p>
            <p className="mt-2 text-sm leading-6 text-slate-900">{message.text}</p>
          </div>
        ) : null}
      </div>
    );
  };

  const renderChallengeCard = (message: InterpreterMessage) => {
    const exercise = getExercise(message);
    if (!exercise) return null;
    const responseMode = responseModeByMessage[message.id];
    const audioUrl = absoluteMediaUrl(exercise.tts_audio_url);
    const responseChoices = exercise.response_mode_choices?.length
      ? exercise.response_mode_choices
      : [
          { id: "multiple_choice" as const, label: "Com alternativas" },
          { id: "transcription" as const, label: "Escrever sozinho" },
        ];

    return (
      <article
        key={message.id}
        className="rounded-[30px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95))] p-5 shadow-[0_20px_48px_-38px_rgba(15,23,42,0.48)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700">
              Audio {exercise.round}
            </p>
            <h3 className="mt-2 text-xl font-semibold text-foreground">{exercise.scenario_label}</h3>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-slate-900 px-3 py-1 font-medium text-white">{exercise.level}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
              {formatDateTime(message.created_at)}
            </span>
          </div>
        </div>

        <p className="mt-4 text-sm leading-6 text-muted-foreground">{exercise.instructions}</p>

        <div className="mt-5">{audioUrl ? <AudioPlayer src={audioUrl} compact /> : null}</div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="rounded-[24px] border border-slate-200/80 bg-white/85 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Como voce prefere responder?
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {responseChoices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  onClick={() => setResponseModeByMessage((current) => ({ ...current, [message.id]: choice.id }))}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-medium transition",
                    responseMode === choice.id
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                  )}
                >
                  {choice.label}
                </button>
              ))}
            </div>

            {responseMode === "multiple_choice" ? (
              <div className="mt-4 space-y-2">
                {exercise.options.map((option) => {
                  const selected = selectedOptionByMessage[message.id] === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() =>
                        setSelectedOptionByMessage((current) => ({
                          ...current,
                          [message.id]: option.id,
                        }))
                      }
                      className={cn(
                        "w-full rounded-2xl border px-4 py-3 text-left text-sm transition",
                        selected
                          ? "border-amber-300 bg-amber-50 text-slate-900"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                      )}
                    >
                      {option.text}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {responseMode === "transcription" ? (
              <div className="mt-4">
                <textarea
                  value={answerTextByMessage[message.id] || ""}
                  onChange={(event) =>
                    setAnswerTextByMessage((current) => ({
                      ...current,
                      [message.id]: event.target.value,
                    }))
                  }
                  rows={4}
                  placeholder="Escreva em ingles exatamente o que voce ouviu."
                  className="w-full rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                />
              </div>
            ) : null}
          </div>

          <div className="rounded-[24px] bg-[linear-gradient(180deg,rgba(255,247,237,0.92),rgba(255,255,255,0.98))] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">Dicas</p>
            <div className="mt-3 space-y-3 text-sm text-slate-700">
              <p>Ouça mais de uma vez antes de revelar a resposta.</p>
              <p>Se travar, comece por palavras-chave e depois monte a frase inteira.</p>
              {exercise.focus_words.length ? (
                <div>
                  <p className="font-semibold text-slate-900">Palavras em foco</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {exercise.focus_words.map((word) => (
                      <span key={word} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
                        {word}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </article>
    );
  };

  const renderFeedbackCard = (message: InterpreterMessage) => {
    const feedback = getFeedback(message);
    if (!feedback) return null;
    const toneClasses =
      feedback.status === "correct"
        ? "border-emerald-200 bg-emerald-50/80 text-emerald-900"
        : feedback.status === "close"
          ? "border-amber-200 bg-amber-50/80 text-amber-900"
          : "border-rose-200 bg-rose-50/80 text-rose-900";

    return (
      <article key={message.id} className={cn("rounded-[24px] border px-4 py-4 shadow-sm", toneClasses)}>
        <div className="flex items-center gap-2 text-sm font-semibold">
          {feedback.status === "correct" ? <CheckCircle2 className="h-4 w-4" /> : <CircleDashed className="h-4 w-4" />}
          Feedback da IA
        </div>
        <p className="mt-2 text-sm leading-6">{message.text}</p>
        <p className="mt-3 text-xs font-medium opacity-80">Similaridade estimada: {feedback.similarity_score}%</p>
      </article>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {!selectedSessionId ? (
          <section className="overflow-hidden rounded-[34px] border border-slate-200/80 bg-[linear-gradient(145deg,rgba(255,247,237,0.78),rgba(255,255,255,0.98)_24%,rgba(239,246,255,0.75))] shadow-[0_30px_70px_-50px_rgba(15,23,42,0.5)]">
            <div className="grid gap-8 px-6 py-7 xl:grid-cols-[minmax(0,1fr)_24rem] xl:px-8 xl:py-8">
              <div className="space-y-6">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700 shadow-sm">
                    <Headphones className="h-4 w-4" />
                    Interprete IA
                  </div>
                  <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">Treine escuta com audio gerado pela IA</h1>
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                    Escolha um topico e um nivel. A IA gera um audio em ingles, voce decide se quer responder com alternativas
                    ou escrevendo sozinho, pode revelar o texto quando precisar e seguir para o proximo desafio.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Topico</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {TOPIC_OPTIONS.map((topic) => (
                        <SetupTopicCard
                          key={topic.id}
                          topic={topic}
                          selected={selectedTopicId === topic.id}
                          onClick={() => setSelectedTopicId(topic.id)}
                        />
                      ))}
                    </div>
                  </div>

                  {selectedTopicId === "custom" ? (
                    <div className="rounded-[24px] border border-slate-200/80 bg-white/90 p-4">
                      <p className="text-sm font-semibold text-foreground">Descreva o topico</p>
                      <input
                        value={customTopic}
                        onChange={(event) => setCustomTopic(event.target.value)}
                        placeholder="Ex.: atendimento ao cliente, consulta medica, reuniao de equipe..."
                        className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                      />
                    </div>
                  ) : null}

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Nivel</p>
                    <div className="mt-3 flex flex-wrap gap-3">
                      {CEFR_LEVELS.map((level) => (
                        <SetupLevelButton
                          key={level}
                          level={level}
                          selected={selectedLevel === level}
                          onClick={() => setSelectedLevel(level)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <aside className="self-start rounded-[30px] border border-slate-200/80 bg-white/92 p-5 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.38)]">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Resumo do treino</p>
                <div className="mt-4 rounded-[24px] bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.98))] p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-amber-100 p-3 text-amber-800">
                      <Ear className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-slate-950">{resolvedTopicLabel || "Escolha um topico"}</p>
                      <p className="text-sm text-muted-foreground">Nivel {selectedLevel}</p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3 text-sm leading-6 text-slate-600">
                    <p>1. A IA gera um audio curto e natural em ingles.</p>
                    <p>2. Voce escolhe entre alternativas ou transcricao livre.</p>
                    <p>3. Revele a resposta quando quiser e siga para o proximo audio.</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleCreateSession()}
                  disabled={isCreating || !resolvedTopicLabel}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-[22px] bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Headphones className="h-4 w-4" />}
                  Iniciar treino
                </button>

                {sessionsQuery.data?.length ? (
                  <div className="mt-6 border-t border-slate-200/80 pt-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Ultimas sessoes</p>
                    <div className="mt-3 space-y-2">
                      {sessionsQuery.data.slice(0, 3).map((session) => (
                        <button
                          key={session.id}
                          type="button"
                          onClick={() => handleOpenSession(session.id)}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm transition hover:border-slate-300 hover:bg-slate-50"
                        >
                          <p className="font-semibold text-foreground">{session.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {session.guided_state?.scenario_label || modeLabel[session.mode]} · {formatDateTime(session.last_interaction_at)}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </aside>
            </div>
          </section>
        ) : activeSession ? (
          <section className="flex h-[calc(100dvh-4.5rem)] flex-col overflow-hidden rounded-[34px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95))] shadow-[0_26px_70px_-48px_rgba(15,23,42,0.5)]">
            <header className="border-b border-slate-200/80 bg-white/90 px-5 py-4 backdrop-blur">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">
                      {modeLabel[activeSession.mode]}
                    </span>
                    {activeSession.guided_state?.scenario_label ? (
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
                        {activeSession.guided_state.scenario_label}
                      </span>
                    ) : null}
                    {activeSession.guided_state?.level ? (
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                        Nivel {activeSession.guided_state.level}
                      </span>
                    ) : null}
                  </div>
                  <h2 className="mt-3 text-[30px] font-semibold tracking-tight text-slate-950">{activeSession.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {activeSession.message_count} mensagens · ultima interacao em {formatDateTime(activeSession.last_interaction_at)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setIsQuickCardDialogOpen(true)}
                    className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-900 transition hover:bg-emerald-100"
                  >
                    <BookPlus className="h-4 w-4" />
                    Card: adicionar nova palavra
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(APP_PATHS.interpreter)}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Novo treino
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-rose-50 hover:text-rose-700"
                  >
                    <Trash2 className="h-4 w-4" />
                    Excluir
                  </button>
                </div>
              </div>
            </header>

            <div ref={messageListRef} className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
                {activeSession.messages.map((message) => {
                  if (getExercise(message)) {
                    const submittedResponse = getSubmittedResponseForChallenge(message.id);
                    const draftText = getDraftResponseText(message);
                    const shouldRenderDraftActions = message.id === latestChallengeId && !submittedResponse && Boolean(draftText);
                    return (
                      <div key={message.id} className="space-y-4">
                        {renderChallengeCard(message)}
                        {shouldRenderDraftActions ? (
                          <>
                            {renderDraftResponse(message)}
                            {renderChallengeActions({ message, showSubmit: true })}
                          </>
                        ) : null}
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
                      getFeedbackForChallenge(challengeId)?.id === message.id,
                    );
                    const challengeMessage = activeSession.messages.find((item) => item.id === challengeId) ?? null;

                    return (
                      <div key={message.id} className="space-y-4">
                        {renderFeedbackCard(message)}
                        {shouldRenderPostAnswerActions && challengeMessage
                          ? renderChallengeActions({ message: challengeMessage, showSubmit: false })
                          : null}
                      </div>
                    );
                  }
                  return (
                    <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-3xl rounded-[24px] px-4 py-3 text-sm leading-6 shadow-sm",
                          message.role === "user"
                            ? "bg-slate-950 text-white"
                            : "border border-slate-200/80 bg-white text-slate-900",
                        )}
                      >
                        <p className="whitespace-pre-line">{message.text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <QuickAddVocabularyCardDialog
              open={isQuickCardDialogOpen}
              onOpenChange={setIsQuickCardDialogOpen}
              sourceTag="Interprete IA"
            />
          </section>
        ) : selectedSessionId && sessionDetailQuery.isLoading ? (
          <div className="flex min-h-[20rem] items-center justify-center rounded-[30px] border border-slate-200/80 bg-white/92">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando sessao...
            </div>
          </div>
        ) : (
          <div className="rounded-[30px] border border-dashed border-slate-200 bg-white/92 px-8 py-12 text-center">
            <p className="text-lg font-semibold text-foreground">Sessao nao encontrada</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Essa sessao nao esta mais disponivel. Voce pode iniciar um novo treino ou abrir outra sessao pela sidebar.
            </p>
            <button
              type="button"
              onClick={() => navigate(APP_PATHS.interpreter)}
              className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Voltar ao interprete
            </button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default InterpreteIA;
