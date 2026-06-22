import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import AudioPlayer from "@/components/AudioPlayer";
import MicRecorder, { RecordingState } from "@/components/MicRecorder";
import PronunciationFeedback, { SpeakingFeedback } from "@/components/PronunciationFeedback";
import WritingFeedbackCard, { WritingFeedback } from "@/components/WritingFeedbackCard";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { absoluteMediaUrl } from "@/lib/config";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Clock3,
  GraduationCap,
  Loader2,
  MessageSquarePlus,
  Mic,
  Pencil,
  Search,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";

type PracticeMode = "review" | "speaking" | "writing";

type LessonReference = {
  id: string;
  title: string;
  level: string;
  date?: string | null;
  status?: string;
  teacher_name?: string;
};

type LessonOption = {
  id: string;
  title: string;
  level: string;
  date?: string | null;
  status?: string;
  teacher_name?: string;
  summary_short?: string;
  vocabulary_count?: number;
  learned_words_count?: number;
  flashcard_count?: number;
  last_studied_at?: string | null;
  has_pending_activities?: boolean;
  is_recent?: boolean;
  is_recommended_review?: boolean;
};

type AIMessage = {
  id: string;
  role: "system" | "user" | "assistant";
  content_type: "text" | "audio" | "feedback" | "writing_feedback";
  text: string;
  audio_url?: string | null;
  audio_detail?: {
    id: string;
    duration_seconds?: number | string | null;
    created_at?: string;
  } | null;
  feedback_detail?: SpeakingFeedback | null;
  writing_feedback_detail?: WritingFeedback | null;
  created_at?: string;
  pending?: boolean;
};

type SessionSummary = {
  id: string;
  mode: PracticeMode;
  title: string;
  title_source: "auto" | "manual";
  status: string;
  lesson?: string | null;
  lesson_detail?: LessonReference | null;
  message_count: number;
  last_interaction_at?: string;
  created_at: string;
  updated_at: string;
};

type SessionDetail = SessionSummary & {
  messages: AIMessage[];
};

type MessageResponse = {
  user_message?: AIMessage | null;
  assistant_message?: AIMessage | null;
  session: SessionSummary;
};

type AudioResponse = {
  feedback: SpeakingFeedback;
  user_message?: AIMessage | null;
  assistant_message?: AIMessage | null;
  session: SessionSummary;
};

type PickerMode = "new" | "change" | null;

type Recommendation = {
  id: string;
  mode: PracticeMode;
  note?: string;
  teacher_name?: string;
  lesson?: string | null;
  lesson_detail?: LessonReference | null;
};

type ProgressOverview = {
  recommendation?: Recommendation | null;
  speaking_history: Array<{
    id: string;
    created_at: string;
    overall_score: number;
    estimated_level: string;
    problem_words: string[];
  }>;
  writing_history: Array<{
    id: string;
    created_at: string;
    text_type: string;
    writing_score: number;
    estimated_level: string;
  }>;
};

type ListResponse<T> =
  | T[]
  | {
      results?: T[];
    };

const unwrapListResponse = <T,>(data: ListResponse<T> | null | undefined): T[] => {
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.results) ? data.results : [];
};

const formatShortDate = (value?: string | null) => {
  if (!value) return "Sem data";
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
};

const formatLongDate = (value?: string | null) => {
  if (!value) return "Sem data";
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "Agora";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatTime = (value?: string | null) => {
  if (!value) return "Agora";
  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDuration = (value?: number | string | null) => {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${remaining}`;
};

const compareByPriority = (a: LessonOption, b: LessonOption) => {
  const score = (item: LessonOption) =>
    (item.is_recent ? 3 : 0) +
    (item.has_pending_activities ? 2 : 0) +
    (item.is_recommended_review ? 1 : 0);
  const priorityDelta = score(b) - score(a);
  if (priorityDelta !== 0) return priorityDelta;
  return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
};

const mergeSummaryIntoDetail = (detail: SessionDetail, summary: SessionSummary): SessionDetail => ({
  ...detail,
  ...summary,
});

const buildSessionPath = (sessionId: string) => `/treinar-ia/conversa/${sessionId}`;
const buildNewModePath = (mode?: PracticeMode) => (mode ? `/treinar-ia?mode=new&practiceMode=${mode}` : "/treinar-ia?mode=new");

const modeLabel: Record<PracticeMode, string> = {
  review: "Revisar Aula",
  speaking: "Speaking",
  writing: "Writing",
};

const modeDescription: Record<PracticeMode, string> = {
  review: "Converse usando a aula como contexto principal e revise gramática, vocabulário e exercícios do conteúdo estudado.",
  speaking: "Envie áudio, receba nota de pronúncia, fluência, entonação e clareza, e treine com exercícios focados nos erros.",
  writing: "Envie um texto para correção com nível CEFR, score, explicações, reescritas por nível e exercícios derivados.",
};

const composerPlaceholderByMode: Record<PracticeMode, string> = {
  review: "Peça revisão de vocabulário, gramática ou exercícios desta aula.",
  speaking: "Escreva um pedido rápido ou grave um áudio em inglês para avaliar sua pronúncia.",
  writing: "Cole seu texto em inglês para correção, score e reescritas por nível.",
};

const ConversationListItem = ({
  session,
  active,
  onClick,
}: {
  session: SessionSummary;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "w-full rounded-2xl border px-4 py-3 text-left transition",
      active
        ? "border-primary bg-primary text-primary-foreground shadow-sm"
        : "border-border bg-card hover:border-primary/20 hover:bg-muted/50",
    )}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{session.title || "Nova conversa"}</p>
        <p
          className={cn(
            "mt-1 truncate text-xs",
            active ? "text-primary-foreground/75" : "text-muted-foreground",
          )}
        >
          {session.lesson_detail?.title || "Aula não vinculada"}
        </p>
        <p
          className={cn(
            "mt-2 text-[11px] font-medium",
            active ? "text-primary-foreground/75" : "text-muted-foreground",
          )}
        >
          {modeLabel[session.mode]}
        </p>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-1 text-[10px] font-medium",
          active ? "bg-primary-foreground/15 text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {session.message_count}
      </span>
    </div>
    <div
      className={cn(
        "mt-3 flex items-center justify-between text-[11px]",
        active ? "text-primary-foreground/75" : "text-muted-foreground",
      )}
    >
      <span>{session.lesson_detail?.level || "Sem nível"}</span>
      <span>{formatDateTime(session.last_interaction_at)}</span>
    </div>
  </button>
);

const ModeCard = ({
  mode,
  recommended,
  onClick,
}: {
  mode: PracticeMode;
  recommended?: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex h-full flex-col rounded-[28px] border p-5 text-left transition",
      recommended
        ? "border-amber-300 bg-amber-50/60 shadow-[0_18px_50px_-34px_rgba(217,119,6,0.55)]"
        : "border-border bg-card/95 hover:border-slate-300 hover:shadow-sm",
    )}
  >
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-lg font-semibold text-foreground">{modeLabel[mode]}</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{modeDescription[mode]}</p>
      </div>
      {recommended ? (
        <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-700">
          Recomendado
        </span>
      ) : null}
    </div>
    <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-muted/50 px-4 py-3 text-sm">
      <span className="font-medium text-foreground">Selecionar</span>
    </div>
  </button>
);

const LessonCard = ({
  lesson,
  recommended,
  loading,
  actionLabel,
  onAction,
}: {
  lesson: LessonOption;
  recommended?: boolean;
  loading?: boolean;
  actionLabel: string;
  onAction: () => void;
}) => (
  <article className="flex h-full flex-col rounded-[26px] border border-border bg-card/95 p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-lg font-semibold text-foreground">{lesson.title}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {lesson.is_recent && <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700">Mais recente</span>}
          {lesson.is_recommended_review && <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-700">Revisão recomendada</span>}
          {recommended && <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-700">Professor recomendou esta aula</span>}
          {lesson.has_pending_activities && <span className="rounded-full bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-700">Atividades pendentes</span>}
        </div>
      </div>
      <div className="rounded-2xl bg-muted p-3 text-muted-foreground">
        <BookOpen className="h-5 w-5" />
      </div>
    </div>

    <div className="mt-5 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4" />
        <span>{formatLongDate(lesson.date)}</span>
      </div>
      <div className="flex items-center gap-2">
        <GraduationCap className="h-4 w-4" />
        <span>{lesson.teacher_name || "Professor não informado"}</span>
      </div>
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4" />
        <span>{lesson.learned_words_count ?? lesson.vocabulary_count ?? 0} palavras</span>
      </div>
      <div className="flex items-center gap-2">
        <Clock3 className="h-4 w-4" />
        <span>
          {lesson.last_studied_at ? `Último estudo: ${formatShortDate(lesson.last_studied_at)}` : "Ainda não praticada com IA"}
        </span>
      </div>
    </div>

    <p className="mt-5 flex-1 text-sm leading-6 text-foreground/80">{lesson.summary_short || "Sem resumo salvo para esta aula."}</p>

    <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-muted/50 px-4 py-3 text-sm">
      <div>
        <p className="font-medium text-foreground">{lesson.flashcard_count ?? 0} flashcards</p>
        <p className="text-xs text-muted-foreground">{lesson.level}</p>
      </div>
      <button
        type="button"
        onClick={onAction}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {actionLabel}
      </button>
    </div>
  </article>
);

const MessageBubble = ({ message }: { message: AIMessage }) => {
  const isUser = message.role === "user";
  const audioMeta = message.audio_detail;
  const speakerLabel =
    message.content_type === "audio"
      ? "Sua gravação"
      : isUser
        ? "Você"
        : message.content_type === "feedback"
          ? "Análise da IA"
          : "Assistente IA";

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("w-full max-w-[min(100%,58rem)] space-y-2.5", isUser ? "items-end" : "items-start")}>
        <p
          className={cn(
            "px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground",
            isUser ? "text-right" : "text-left",
          )}
        >
          {speakerLabel}
        </p>
        <div
          className={cn(
            "rounded-[28px] px-4 py-3.5 text-sm leading-6 shadow-sm",
            isUser
              ? "rounded-br-lg bg-slate-950 text-white"
              : "rounded-bl-lg border border-slate-200/80 bg-white/95 text-card-foreground",
          )}
        >
          {message.audio_url ? (
            <div className="space-y-3">
              <div className={cn("rounded-2xl p-3", isUser ? "bg-white/10" : "bg-slate-50")}>
                <AudioPlayer src={absoluteMediaUrl(message.audio_url)} compact />
              </div>
              {message.text ? (
                <div>
                  <p className={cn("text-[11px] font-semibold uppercase tracking-[0.18em]", isUser ? "text-white/70" : "text-muted-foreground")}>
                    Transcrição
                  </p>
                  <p className="mt-2 whitespace-pre-line">{message.text}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="whitespace-pre-line">{message.text}</p>
          )}
          <div
            className={cn(
              "mt-3 flex items-center justify-between gap-4 text-[11px]",
              isUser ? "text-white/70" : "text-muted-foreground",
            )}
          >
            <span>{message.pending ? "Enviando..." : formatTime(message.created_at)}</span>
            {audioMeta?.duration_seconds ? <span>{formatDuration(audioMeta.duration_seconds)}</span> : null}
          </div>
        </div>

        {message.audio_url && audioMeta?.created_at ? (
          <p className="px-1 text-[11px] text-muted-foreground">Áudio enviado em {formatDateTime(audioMeta.created_at)}</p>
        ) : null}

        {message.feedback_detail ? (
          <div className="rounded-[28px] border border-slate-200/80 bg-white/95 p-1 shadow-sm">
            <PronunciationFeedback feedback={message.feedback_detail} />
          </div>
        ) : null}

        {message.writing_feedback_detail ? (
          <div className="rounded-[28px] border border-slate-200/80 bg-white/95 p-1 shadow-sm">
            <WritingFeedbackCard feedback={message.writing_feedback_detail} />
          </div>
        ) : null}
      </div>
    </div>
  );
};

const AssistenteIA = () => {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [sessionDraft, setSessionDraft] = useState<SessionDetail | null>(null);
  const [conversationSearch, setConversationSearch] = useState("");
  const [lessonSearch, setLessonSearch] = useState("");
  const [isChangingLesson, setIsChangingLesson] = useState(false);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [showRecorder, setShowRecorder] = useState(false);
  const [creatingLessonId, setCreatingLessonId] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const deferredConversationSearch = useDeferredValue(conversationSearch);
  const deferredLessonSearch = useDeferredValue(lessonSearch);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const selectedSessionId = sessionId ?? null;
  const isNewConversationFlow = searchParams.get("mode") === "new";
  const selectedPracticeMode = (searchParams.get("practiceMode") as PracticeMode | null) ?? null;
  const pickerMode: PickerMode = isChangingLesson ? "change" : isNewConversationFlow ? "new" : null;

  const sessionsQuery = useQuery({
    queryKey: ["ai-study-sessions", deferredConversationSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (deferredConversationSearch.trim()) {
        params.set("search", deferredConversationSearch.trim());
      }
      const suffix = params.toString() ? `?${params.toString()}` : "";
      const response = await api.get(`/ai-study/sessions/${suffix}`);
      return unwrapListResponse<SessionSummary>(response.data as ListResponse<SessionSummary>);
    },
  });

  const sessionDetailQuery = useQuery({
    queryKey: ["ai-study-session", selectedSessionId],
    enabled: Boolean(selectedSessionId),
    queryFn: async () => {
      const response = await api.get(`/ai-study/sessions/${selectedSessionId}/`);
      return response.data as SessionDetail;
    },
  });

  const lessonsQuery = useQuery({
    queryKey: ["ai-study-context-lessons"],
    queryFn: async () => {
      const response = await api.get("/ai-study/context-lessons/");
      return unwrapListResponse<LessonOption>(response.data as ListResponse<LessonOption>);
    },
  });

  const progressQuery = useQuery({
    queryKey: ["ai-study-progress-overview", user?.role],
    enabled: user?.role === "student",
    queryFn: async () => {
      const response = await api.get("/ai-study/progress/overview/");
      return response.data as ProgressOverview;
    },
  });

  const recommendation = progressQuery.data?.recommendation ?? null;

  const activeSession =
    sessionDraft && sessionDraft.id === selectedSessionId ? sessionDraft : sessionDetailQuery.data ?? null;

  useEffect(() => {
    if (sessionDetailQuery.data) {
      setSessionDraft(sessionDetailQuery.data);
      setRenameValue(sessionDetailQuery.data.title || "");
    }
  }, [sessionDetailQuery.data]);

  useEffect(() => {
    const el = messageListRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [activeSession?.messages]);

  useEffect(() => {
    if (!selectedSessionId) {
      setSessionDraft(null);
      setRenameValue("");
      setIsRenaming(false);
      setShowRecorder(false);
      setRecordingState("idle");
    }
  }, [selectedSessionId]);

  useEffect(() => {
    if (!selectedSessionId) {
      setIsChangingLesson(false);
    }
  }, [selectedSessionId]);

  useEffect(() => {
    if (selectedSessionId || isNewConversationFlow || isChangingLesson || selectedPracticeMode || !recommendation?.mode) {
      return;
    }
    navigate(buildNewModePath(recommendation.mode), { replace: true });
  }, [isChangingLesson, isNewConversationFlow, navigate, recommendation?.mode, selectedPracticeMode, selectedSessionId]);

  const filteredLessons = useMemo(() => {
    const lessons = lessonsQuery.data || [];
    const query = deferredLessonSearch.trim().toLowerCase();
    const matching = lessons.filter((lesson) => {
      if (!query) return true;
      return [
        lesson.title,
        lesson.level,
        lesson.teacher_name,
        lesson.summary_short,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
    return [...matching].sort((a, b) => {
      const recommendationBoost =
        (String(b.id) === String(recommendation?.lesson || "") ? 1 : 0) -
        (String(a.id) === String(recommendation?.lesson || "") ? 1 : 0);
      if (recommendationBoost !== 0) return recommendationBoost;
      return compareByPriority(a, b);
    });
  }, [deferredLessonSearch, lessonsQuery.data, recommendation?.lesson]);

  const recentSpeakingHistory = progressQuery.data?.speaking_history || [];
  const recentWritingHistory = progressQuery.data?.writing_history || [];

  const hasSavedSessions = (sessionsQuery.data?.length ?? 0) > 0;
  const isPickerVisible = pickerMode !== null || (!selectedSessionId && !sessionsQuery.isLoading && !hasSavedSessions);
  const isConversationPage = Boolean(selectedSessionId);
  const isBusy = isSending || sessionDetailQuery.isFetching;
  const activeMode = activeSession?.mode;
  const composerPlaceholder = activeMode ? composerPlaceholderByMode[activeMode] : composerPlaceholderByMode.review;
  const canRecordAudio = activeMode === "speaking";

  const syncDraft = (nextSession: SessionDetail) => {
    setSessionDraft(nextSession);
    queryClient.setQueryData(["ai-study-session", nextSession.id], nextSession);
  };

  const updateDraftSummary = (summary: SessionSummary) => {
    setSessionDraft((current) => {
      if (!current || current.id !== summary.id) return current;
      const next = mergeSummaryIntoDetail(current, summary);
      queryClient.setQueryData(["ai-study-session", next.id], next);
      return next;
    });
  };

  const invalidateSessionList = async () => {
    await queryClient.invalidateQueries({ queryKey: ["ai-study-sessions"] });
  };

  const openNewConversationPicker = () => {
    setIsChangingLesson(false);
    setSessionDraft(null);
    setLessonSearch("");
    setInput("");
    setIsRenaming(false);
    setShowRecorder(false);
    setRecordingState("idle");
    navigate(buildNewModePath());
  };

  const closeLessonPicker = () => {
    setLessonSearch("");
    if (isChangingLesson && selectedSessionId) {
      setIsChangingLesson(false);
      navigate(buildSessionPath(selectedSessionId));
      return;
    }
    setIsChangingLesson(false);
    navigate("/treinar-ia");
  };

  const handleSelectMode = (mode: PracticeMode) => {
    setLessonSearch("");
    navigate(buildNewModePath(mode));
  };

  const handleSelectSession = (sessionId: string) => {
    setIsChangingLesson(false);
    setIsRenaming(false);
    startTransition(() => navigate(buildSessionPath(sessionId)));
  };

  const handleCreateSession = async (mode: PracticeMode, lessonId?: string) => {
    setCreatingLessonId(lessonId || mode);
    try {
      const payload: { mode: PracticeMode; lesson_id?: string } = { mode };
      if (lessonId) payload.lesson_id = lessonId;
      const response = await api.post("/ai-study/sessions/", payload);
      const createdSession = response.data as SessionDetail;
      syncDraft(createdSession);
      setRenameValue(createdSession.title || "");
      setIsChangingLesson(false);
      startTransition(() => navigate(buildSessionPath(createdSession.id)));
      await invalidateSessionList();
    } catch {
      toast({
        title: "Não foi possível iniciar a conversa",
        description: mode === "review" ? "Selecione outra aula ou tente novamente." : "Tente novamente em instantes.",
        variant: "destructive",
      });
    } finally {
      setCreatingLessonId(null);
    }
  };

  const handleChangeLesson = async (lessonId: string) => {
    if (!activeSession) return;
    setCreatingLessonId(lessonId);
    try {
      const response = await api.post(`/ai-study/sessions/${activeSession.id}/contexts/`, {
        lesson_id: lessonId,
      });
      const updatedSession = response.data as SessionDetail;
      syncDraft(updatedSession);
      setIsChangingLesson(false);
      await invalidateSessionList();
      toast({
        title: "Aula atualizada",
        description: `A conversa agora está vinculada a ${updatedSession.lesson_detail?.title || "essa aula"}.`,
      });
    } catch {
      toast({
        title: "Não foi possível trocar a aula",
        description: "Tente novamente em instantes.",
        variant: "destructive",
      });
    } finally {
      setCreatingLessonId(null);
    }
  };

  const handleRename = async () => {
    if (!activeSession || !renameValue.trim()) return;
    try {
      const response = await api.post(`/ai-study/sessions/${activeSession.id}/rename/`, {
        title: renameValue.trim(),
      });
      const summary = response.data as SessionSummary;
      updateDraftSummary(summary);
      setIsRenaming(false);
      await invalidateSessionList();
    } catch {
      toast({
        title: "Não foi possível renomear",
        description: "Tente novamente em instantes.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!activeSession) return;
    const confirmed = window.confirm(`Excluir a conversa "${activeSession.title}"?`);
    if (!confirmed) return;
    try {
      await api.delete(`/ai-study/sessions/${activeSession.id}/`);
      const deletedId = activeSession.id;
      setSessionDraft(null);
      setIsChangingLesson(false);
      setIsRenaming(false);
      await invalidateSessionList();
      const remainingSessions = (queryClient.getQueryData(["ai-study-sessions", deferredConversationSearch]) as SessionSummary[] | undefined) || [];
      const nextSession = remainingSessions.find((session) => session.id !== deletedId);
      if (nextSession) {
        startTransition(() => navigate(buildSessionPath(nextSession.id)));
      } else {
        navigate("/treinar-ia?mode=new");
      }
    } catch {
      toast({
        title: "Não foi possível excluir",
        description: "A conversa não foi removida.",
        variant: "destructive",
      });
    }
  };

  const sendText = async () => {
    if (!activeSession || !input.trim() || isSending) return;
    const text = input.trim();
    const optimisticId = `local-${Date.now()}`;
    const optimisticMessage: AIMessage = {
      id: optimisticId,
      role: "user",
      content_type: "text",
      text,
      pending: true,
      created_at: new Date().toISOString(),
    };

    setInput("");
    setIsSending(true);
    setSessionDraft((current) => {
      if (!current) return current;
      const next = {
        ...current,
        messages: [...current.messages, optimisticMessage],
      };
      queryClient.setQueryData(["ai-study-session", next.id], next);
      return next;
    });

    try {
      const response = await api.post(`/ai-study/sessions/${activeSession.id}/message/`, { text });
      const data = response.data as MessageResponse;
      setSessionDraft((current) => {
        if (!current) return current;
        const persistedMessages = current.messages.filter((message) => message.id !== optimisticId);
        const next: SessionDetail = {
          ...mergeSummaryIntoDetail(current, data.session),
          messages: [
            ...persistedMessages,
            ...(data.user_message ? [data.user_message] : []),
            ...(data.assistant_message ? [data.assistant_message] : []),
          ],
        };
        queryClient.setQueryData(["ai-study-session", next.id], next);
        return next;
      });
      await invalidateSessionList();
    } catch {
      setSessionDraft((current) => {
        if (!current) return current;
        const next = {
          ...current,
          messages: current.messages.filter((message) => message.id !== optimisticId),
        };
        queryClient.setQueryData(["ai-study-session", next.id], next);
        return next;
      });
      toast({
        title: "Mensagem não enviada",
        description: "Não foi possível conectar com a IA.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const uploadAudio = async (blob: Blob, durationSeconds: number) => {
    if (!activeSession || activeSession.mode !== "speaking") return;
    const optimisticId = `audio-${Date.now()}`;
    const optimisticMessage: AIMessage = {
      id: optimisticId,
      role: "user",
      content_type: "audio",
      text: "Processando sua fala...",
      pending: true,
      created_at: new Date().toISOString(),
    };

    setRecordingState("uploading");
    setIsSending(true);
    setSessionDraft((current) => {
      if (!current) return current;
      const next = {
        ...current,
        messages: [...current.messages, optimisticMessage],
      };
      queryClient.setQueryData(["ai-study-session", next.id], next);
      return next;
    });

    try {
      const formData = new FormData();
      const extension = blob.type.includes("wav") ? "wav" : "webm";
      formData.append("audio", blob, `speaking-${Date.now()}.${extension}`);
      formData.append("duration_seconds", String(durationSeconds));
      const response = await api.post(`/ai-study/sessions/${activeSession.id}/audio/`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const data = response.data as AudioResponse;
      setSessionDraft((current) => {
        if (!current) return current;
        const persistedMessages = current.messages.filter((message) => message.id !== optimisticId);
        const next: SessionDetail = {
          ...mergeSummaryIntoDetail(current, data.session),
          messages: [
            ...persistedMessages,
            ...(data.user_message ? [data.user_message] : []),
            ...(data.assistant_message ? [data.assistant_message] : []),
          ],
        };
        queryClient.setQueryData(["ai-study-session", next.id], next);
        return next;
      });
      setRecordingState("idle");
      setShowRecorder(false);
      await invalidateSessionList();
    } catch {
      setSessionDraft((current) => {
        if (!current) return current;
        const next = {
          ...current,
          messages: current.messages.filter((message) => message.id !== optimisticId),
        };
        queryClient.setQueryData(["ai-study-session", next.id], next);
        return next;
      });
      setRecordingState("error");
      toast({
        title: "Áudio não processado",
        description: "Verifique o microfone e tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendText();
    }
  };

  return (
    <DashboardLayout>
      <div
        className={cn(
          "space-y-6",
          isConversationPage && "h-[calc(100dvh-4.5rem)] overflow-hidden space-y-0",
        )}
      >
        {!isConversationPage ? (
          <section className="rounded-[28px] border border-border bg-[radial-gradient(circle_at_top_left,_rgba(15,23,42,0.06),_transparent_45%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-6 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">Praticar com IA</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Escolha o modo de prática e treine com feedback estruturado</h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Revise uma aula, receba análise de pronúncia ou corrija sua escrita com nível CEFR, score e exercícios derivados.
                </p>
              </div>
            </div>
            {recommendation ? (
              <div className="mt-6 rounded-[24px] border border-amber-300/80 bg-amber-50/70 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">Recomendação do professor</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{modeLabel[recommendation.mode]}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {recommendation.note || `Seu professor recomendou focar em ${modeLabel[recommendation.mode].toLowerCase()}.`}
                </p>
                {recommendation.lesson_detail ? (
                  <p className="mt-2 text-sm font-medium text-foreground">Aula sugerida: {recommendation.lesson_detail.title}</p>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        <div
          className={cn(
            "grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]",
            isConversationPage && "gap-3",
            isConversationPage ? "h-full min-h-0" : "min-h-[calc(100vh-12rem)]",
          )}
        >
          <aside className="flex h-full flex-col overflow-hidden rounded-[28px] border border-border bg-card/95 p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Conversas</h2>
                <p className="text-xs text-muted-foreground">Histórico permanente por aula</p>
              </div>
              <button
                type="button"
                onClick={openNewConversationPicker}
                className="rounded-xl border border-border p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="Nova conversa"
              >
                <MessageSquarePlus className="h-4 w-4" />
              </button>
            </div>

            <div className="relative mb-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={conversationSearch}
                onChange={(event) => setConversationSearch(event.target.value)}
                placeholder="Pesquisar conversa"
                className="w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-primary/30 focus:ring-2 focus:ring-primary/10"
              />
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto pr-1">
              {sessionsQuery.isLoading ? (
                <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted/50 px-4 py-5 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando conversas...
                </div>
              ) : sessionsQuery.data?.length ? (
                sessionsQuery.data.map((session) => (
                  <ConversationListItem
                    key={session.id}
                    session={session}
                    active={session.id === selectedSessionId}
                    onClick={() => handleSelectSession(session.id)}
                  />
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed border-border bg-muted/40 p-5 text-sm text-muted-foreground">
                  Nenhuma conversa salva ainda. Escolha uma aula para abrir o primeiro chat.
                </div>
              )}
            </div>
          </aside>

          <section
            className={cn(
              "relative flex flex-col overflow-hidden rounded-[32px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.72),rgba(255,255,255,0.98)_16%,rgba(255,255,255,0.98))] shadow-sm",
              isConversationPage ? "min-h-0 h-full" : "min-h-[760px]",
            )}
          >
            {isPickerVisible ? (
              <div className="flex h-full flex-col">
                <div className="border-b border-border px-6 py-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {pickerMode === "change"
                          ? "Trocar aula de referência"
                          : !selectedPracticeMode
                            ? "Escolha como você quer praticar"
                            : selectedPracticeMode === "review"
                              ? "Selecione a aula de referência"
                              : `Preparar modo ${modeLabel[selectedPracticeMode]}`}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {pickerMode === "change" || selectedPracticeMode === "review"
                          ? "A revisão de aula sempre usa uma aula vinculada para manter o contexto correto."
                          : !selectedPracticeMode
                            ? "Você pode revisar uma aula, treinar pronúncia ou enviar um texto para correção."
                            : modeDescription[selectedPracticeMode]}
                      </p>
                    </div>
                    {pickerMode === "change" || selectedPracticeMode === "review" ? (
                      <div className="relative w-full max-w-sm">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                          value={lessonSearch}
                          onChange={(event) => setLessonSearch(event.target.value)}
                          placeholder="Buscar aula"
                          className="w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-primary/30 focus:ring-2 focus:ring-primary/10"
                        />
                      </div>
                    ) : null}
                  </div>
                  {pickerMode && (pickerMode === "change" || hasSavedSessions) ? (
                    <button
                      type="button"
                      onClick={closeLessonPicker}
                      className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      {pickerMode === "change" ? "Voltar para a conversa" : "Voltar"}
                    </button>
                  ) : null}
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                  {!selectedPracticeMode && pickerMode !== "change" ? (
                    <div className="grid gap-4 xl:grid-cols-3">
                      {(["review", "speaking", "writing"] as PracticeMode[]).map((mode) => (
                        <ModeCard
                          key={mode}
                          mode={mode}
                          recommended={recommendation?.mode === mode}
                          onClick={() => handleSelectMode(mode)}
                        />
                      ))}
                    </div>
                  ) : pickerMode === "change" || selectedPracticeMode === "review" ? (
                    lessonsQuery.isLoading ? (
                      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Carregando aulas...
                      </div>
                    ) : filteredLessons.length === 0 ? (
                      <div className="rounded-[24px] border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">
                        Nenhuma aula encontrada com esse filtro.
                      </div>
                    ) : (
                      <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                        {filteredLessons.map((lesson) => (
                          <LessonCard
                            key={lesson.id}
                            lesson={lesson}
                            recommended={String(lesson.id) === String(recommendation?.lesson || "")}
                            loading={creatingLessonId === lesson.id}
                            actionLabel={pickerMode === "change" ? "Usar esta aula" : "Praticar esta aula"}
                            onAction={() =>
                              pickerMode === "change"
                                ? void handleChangeLesson(lesson.id)
                                : void handleCreateSession("review", lesson.id)
                            }
                          />
                        ))}
                      </div>
                    )
                  ) : selectedPracticeMode ? (
                    <div className="mx-auto flex h-full w-full max-w-4xl flex-col justify-center">
                      <div className="rounded-[28px] border border-border bg-card/95 p-6 shadow-sm">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="max-w-2xl">
                            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">{modeLabel[selectedPracticeMode]}</p>
                            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
                              {selectedPracticeMode === "speaking" ? "Treino de pronúncia com análise detalhada" : "Correção de escrita com CEFR e reescritas"}
                            </h2>
                            <p className="mt-3 text-sm leading-6 text-muted-foreground">{modeDescription[selectedPracticeMode]}</p>
                            {recommendation?.mode === selectedPracticeMode ? (
                              <p className="mt-3 text-sm font-medium text-amber-700">
                                Recomendação ativa de {recommendation.teacher_name || "seu professor"}.
                              </p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleCreateSession(selectedPracticeMode, recommendation?.mode === selectedPracticeMode ? recommendation.lesson || undefined : undefined)}
                            disabled={creatingLessonId === selectedPracticeMode}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                          >
                            {creatingLessonId === selectedPracticeMode ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            {selectedPracticeMode === "speaking" ? "Iniciar speaking" : "Iniciar writing"}
                          </button>
                        </div>

                        <div className="mt-6 grid gap-4 lg:grid-cols-2">
                          <div className="rounded-[24px] bg-muted/40 p-4">
                            <p className="text-sm font-semibold text-foreground">Como funciona</p>
                            <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                              {selectedPracticeMode === "speaking" ? (
                                <>
                                  <li>Envie um áudio ou use o microfone.</li>
                                  <li>Receba score geral, nível estimado e palavras com dificuldade.</li>
                                  <li>Pratique com exercícios derivados dos seus erros.</li>
                                </>
                              ) : (
                                <>
                                  <li>Envie um texto livre, redação, email, apresentação pessoal ou storytelling.</li>
                                  <li>Receba correção completa, score e nível CEFR estimado.</li>
                                  <li>Compare reescritas em B1, B2, C1 e C2.</li>
                                </>
                              )}
                            </ul>
                          </div>
                          <div className="rounded-[24px] bg-muted/40 p-4">
                            <p className="text-sm font-semibold text-foreground">Evolução recente</p>
                            <div className="mt-3 space-y-2 text-sm">
                              {selectedPracticeMode === "speaking"
                                ? recentSpeakingHistory.slice(0, 4).map((item) => (
                                    <div key={item.id} className="rounded-xl bg-white px-3 py-2">
                                      <p className="font-medium text-foreground">
                                        {new Date(item.created_at).toLocaleDateString("pt-BR")} · {item.overall_score}/100 · {item.estimated_level}
                                      </p>
                                      <p className="text-muted-foreground">
                                        {(item.problem_words || []).length ? item.problem_words.join(", ") : "Sem palavras críticas registradas."}
                                      </p>
                                    </div>
                                  ))
                                : recentWritingHistory.slice(0, 4).map((item) => (
                                    <div key={item.id} className="rounded-xl bg-white px-3 py-2">
                                      <p className="font-medium text-foreground">
                                        {new Date(item.created_at).toLocaleDateString("pt-BR")} · {item.writing_score}/100 · {item.estimated_level}
                                      </p>
                                      <p className="text-muted-foreground">{item.text_type}</p>
                                    </div>
                                  ))}
                              {(selectedPracticeMode === "speaking" ? recentSpeakingHistory.length === 0 : recentWritingHistory.length === 0) ? (
                                <p className="text-muted-foreground">Ainda não há registros neste modo.</p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : activeSession ? (
              <>
                <header className="border-b border-slate-200/80 bg-white/80 px-5 py-4 backdrop-blur">
                  <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">
                          {modeLabel[activeSession.mode]}
                        </span>
                        {activeSession.lesson_detail ? (
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                            Aula atual: {activeSession.lesson_detail.title}
                          </span>
                        ) : null}
                        {activeSession.mode === "review" ? (
                          <button
                            type="button"
                            onClick={() => setIsChangingLesson(true)}
                            className="text-xs font-medium text-muted-foreground transition hover:text-foreground"
                          >
                            Trocar aula
                          </button>
                        ) : null}
                      </div>

                      {isRenaming ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            value={renameValue}
                            onChange={(event) => setRenameValue(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void handleRename();
                              }
                            }}
                            className="min-w-[280px] rounded-xl border border-border bg-background px-3 py-2 text-lg font-semibold outline-none transition focus:border-primary/30 focus:ring-2 focus:ring-primary/10"
                          />
                          <button
                            type="button"
                            onClick={() => void handleRename()}
                            className="rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                          >
                            Salvar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsRenaming(false);
                              setRenameValue(activeSession.title || "");
                            }}
                            className="rounded-xl border border-border px-3 py-2 text-sm font-medium"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <>
                          <h2 className="truncate text-[30px] font-semibold tracking-tight text-foreground">{activeSession.title}</h2>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {activeSession.message_count} mensagens · última interação em {formatDateTime(activeSession.last_interaction_at)}
                          </p>
                        </>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      {!isRenaming ? (
                        <button
                          type="button"
                          onClick={() => setIsRenaming(true)}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" />
                          Renomear
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void handleDelete()}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                        Excluir
                      </button>
                    </div>
                  </div>
                </header>

                <div ref={messageListRef} className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
                  <div
                    className={cn(
                      "mx-auto flex min-h-full w-full max-w-6xl flex-col gap-5",
                      activeSession.messages.length ? "justify-end" : "",
                    )}
                  >
                    {activeSession.messages.length ? (
                      activeSession.messages.map((message) => <MessageBubble key={message.id} message={message} />)
                    ) : (
                      <div className="flex flex-1 items-center justify-center px-6 py-10">
                        <div className="max-w-2xl text-center">
                          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                            {activeSession.lesson_detail?.title || modeLabel[activeSession.mode]}
                          </p>
                          <p className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
                            {activeSession.mode === "review"
                              ? "O que você quer revisar nesta aula?"
                              : activeSession.mode === "speaking"
                                ? "Envie um áudio para avaliar sua pronúncia"
                                : "Envie um texto para análise de writing"}
                          </p>
                          <p className="mt-3 text-sm leading-6 text-muted-foreground">
                            {activeSession.mode === "review"
                              ? "Peça correções, exercícios, revisão de vocabulário ou explicações de gramática com base no conteúdo já estudado."
                              : activeSession.mode === "speaking"
                                ? "A IA vai analisar pronúncia, fluência, entonação e clareza, além de sugerir exercícios focados nos erros identificados."
                                : "A IA vai corrigir seu texto, estimar seu nível CEFR, explicar os erros e gerar reescritas por nível."}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <footer className="border-t border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.62),rgba(255,255,255,0.97))] px-4 py-3 backdrop-blur">
                  <div className="mx-auto w-full max-w-6xl space-y-3">
                    {canRecordAudio && (showRecorder || recordingState !== "idle") ? (
                      <MicRecorder
                        state={recordingState}
                        onStateChange={setRecordingState}
                        onRecordingComplete={uploadAudio}
                        disabled={!activeSession || isBusy}
                      />
                    ) : null}

                    <div className="rounded-[30px] border border-slate-200/80 bg-white/98 p-3 shadow-[0_10px_40px_-24px_rgba(15,23,42,0.4)]">
                      <div className="flex items-end gap-3">
                        {canRecordAudio ? (
                          <button
                            type="button"
                            onClick={() => setShowRecorder((current) => !current)}
                            disabled={!activeSession || isBusy}
                            className={cn(
                              "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border transition disabled:opacity-50",
                              showRecorder || recordingState !== "idle"
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                            )}
                            aria-label="Abrir microfone"
                          >
                            <Mic className="h-5 w-5" />
                          </button>
                        ) : null}

                        <div className="flex min-h-[52px] flex-1 items-center rounded-[24px] bg-slate-50/80 px-1">
                          <textarea
                            value={input}
                            onChange={(event) => setInput(event.target.value)}
                            onKeyDown={handleComposerKeyDown}
                            placeholder={composerPlaceholder}
                            disabled={!activeSession || isBusy}
                            rows={1}
                            className="max-h-32 min-h-[48px] flex-1 resize-none bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => void sendText()}
                          disabled={!activeSession || !input.trim() || isBusy}
                          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white transition hover:opacity-90 disabled:opacity-50"
                          aria-label="Enviar mensagem"
                        >
                          {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </footer>
              </>
            ) : selectedSessionId && sessionDetailQuery.isLoading ? (
              <div className="flex h-full items-center justify-center p-6">
                <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted/40 px-4 py-5 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando conversa...
                </div>
              </div>
            ) : selectedSessionId && sessionDetailQuery.isError ? (
              <div className="flex h-full items-center justify-center p-6">
                <div className="max-w-lg rounded-[28px] border border-dashed border-border bg-muted/40 px-8 py-10 text-center">
                  <p className="text-lg font-semibold text-foreground">Conversa não encontrada</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Essa conversa não está mais disponível. Escolha outra no histórico ou comece uma nova.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate("/treinar-ia")}
                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                  >
                    Voltar para o assistente
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-6">
                <div className="max-w-lg rounded-[28px] border border-dashed border-border bg-muted/40 px-8 py-10 text-center">
                  <p className="text-lg font-semibold text-foreground">
                    {hasSavedSessions ? "Escolha uma conversa ou crie uma nova" : "Escolha um modo para começar"}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {hasSavedSessions
                      ? "Abra uma conversa pelo histórico à esquerda ou inicie uma nova prática escolhendo o modo primeiro."
                      : "Comece por revisão de aula, speaking ou writing. O fluxo muda conforme o tipo de prática que você quer fazer."}
                  </p>
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={openNewConversationPicker}
                      className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                    >
                      <BookOpen className="h-4 w-4" />
                      Escolher modo
                    </button>
                    {sessionsQuery.data?.[0] ? (
                      <button
                        type="button"
                        onClick={() => handleSelectSession(sessionsQuery.data[0].id)}
                        className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium transition hover:bg-muted"
                      >
                        Abrir conversa mais recente
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AssistenteIA;
