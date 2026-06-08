import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import AudioPlayer from "@/components/AudioPlayer";
import MicRecorder, { RecordingState } from "@/components/MicRecorder";
import PronunciationFeedback, { SpeakingFeedback } from "@/components/PronunciationFeedback";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { absoluteMediaUrl } from "@/lib/config";
import { cn } from "@/lib/utils";
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
  content_type: "text" | "audio" | "feedback";
  text: string;
  audio_url?: string | null;
  audio_detail?: {
    id: string;
    duration_seconds?: number | string | null;
    created_at?: string;
  } | null;
  feedback_detail?: SpeakingFeedback | null;
  created_at?: string;
  pending?: boolean;
};

type SessionSummary = {
  id: string;
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

const LessonCard = ({
  lesson,
  loading,
  actionLabel,
  onAction,
}: {
  lesson: LessonOption;
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

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[min(100%,54rem)] space-y-2.5", isUser ? "items-end" : "items-start")}>
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
              <AudioPlayer src={absoluteMediaUrl(message.audio_url)} compact />
              {message.text ? <p className="whitespace-pre-line">{message.text}</p> : null}
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
      </div>
    </div>
  );
};

const AssistenteIA = () => {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
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
      return Array.isArray(response.data) ? (response.data as SessionSummary[]) : [];
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
      return Array.isArray(response.data) ? (response.data as LessonOption[]) : [];
    },
  });

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
    return [...matching].sort(compareByPriority);
  }, [deferredLessonSearch, lessonsQuery.data]);

  const hasSavedSessions = (sessionsQuery.data?.length ?? 0) > 0;
  const isPickerVisible = pickerMode !== null || (!selectedSessionId && !sessionsQuery.isLoading && !hasSavedSessions);
  const isConversationPage = Boolean(selectedSessionId);
  const isBusy = isSending || sessionDetailQuery.isFetching;

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
    navigate("/treinar-ia?mode=new");
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

  const handleSelectSession = (sessionId: string) => {
    setIsChangingLesson(false);
    setIsRenaming(false);
    startTransition(() => navigate(buildSessionPath(sessionId)));
  };

  const handleCreateSession = async (lessonId: string) => {
    setCreatingLessonId(lessonId);
    try {
      const response = await api.post("/ai-study/sessions/", { lesson_id: lessonId });
      const createdSession = response.data as SessionDetail;
      syncDraft(createdSession);
      setRenameValue(createdSession.title || "");
      setIsChangingLesson(false);
      startTransition(() => navigate(buildSessionPath(createdSession.id)));
      await invalidateSessionList();
    } catch {
      toast({
        title: "Não foi possível iniciar a conversa",
        description: "Selecione outra aula ou tente novamente.",
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
    if (!activeSession) return;
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
      <div className={cn("space-y-6", isConversationPage && "h-[calc(100vh-4rem)] overflow-hidden")}>
        {!isConversationPage ? (
          <section className="rounded-[28px] border border-border bg-[radial-gradient(circle_at_top_left,_rgba(15,23,42,0.06),_transparent_45%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-6 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">Praticar com IA</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Converse com a IA usando o contexto real das suas aulas</h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Escolha a aula antes de abrir o chat. Depois disso, a conversa segue em uma página própria, igual ao fluxo de um chat dedicado.
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <div
          className={cn(
            "grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]",
            isConversationPage ? "h-full min-h-0" : "min-h-[calc(100vh-12rem)]",
          )}
        >
          <aside className="flex h-full flex-col rounded-[28px] border border-border bg-card/95 p-4 shadow-sm">
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
                        {pickerMode === "change" ? "Trocar aula de referência" : "Selecione a aula de referência"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Toda conversa precisa estar vinculada a uma aula para a IA manter o contexto correto.
                      </p>
                    </div>
                    <div className="relative w-full max-w-sm">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        value={lessonSearch}
                        onChange={(event) => setLessonSearch(event.target.value)}
                        placeholder="Buscar aula"
                        className="w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-primary/30 focus:ring-2 focus:ring-primary/10"
                      />
                    </div>
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
                  {lessonsQuery.isLoading ? (
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
                          loading={creatingLessonId === lesson.id}
                          actionLabel={pickerMode === "change" ? "Usar esta aula" : "Praticar esta aula"}
                          onAction={() =>
                            pickerMode === "change"
                              ? void handleChangeLesson(lesson.id)
                              : void handleCreateSession(lesson.id)
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : activeSession ? (
              <>
                <header className="border-b border-slate-200/80 bg-white/80 px-5 py-4 backdrop-blur">
                  <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                          Aula atual: {activeSession.lesson_detail?.title || "Sem aula"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsChangingLesson(true)}
                          className="text-xs font-medium text-muted-foreground transition hover:text-foreground"
                        >
                          Trocar aula
                        </button>
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

                <div ref={messageListRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
                  <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-6">
                    {activeSession.messages.length ? (
                      activeSession.messages.map((message) => <MessageBubble key={message.id} message={message} />)
                    ) : (
                      <div className="flex flex-1 items-center justify-center px-6">
                        <div className="max-w-2xl text-center">
                          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                            {activeSession.lesson_detail?.title || "Nova conversa"}
                          </p>
                          <p className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
                            O que você quer praticar nesta aula?
                          </p>
                          <p className="mt-3 text-sm leading-6 text-muted-foreground">
                            Escreva, peça correções, treine speaking com áudio ou solicite exercícios com base no conteúdo já estudado.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <footer className="border-t border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.62),rgba(255,255,255,0.97))] px-4 py-4 backdrop-blur">
                  <div className="mx-auto w-full max-w-5xl space-y-3">
                    {showRecorder || recordingState !== "idle" ? (
                      <MicRecorder
                        state={recordingState}
                        onStateChange={setRecordingState}
                        onRecordingComplete={uploadAudio}
                        disabled={!activeSession || isBusy}
                      />
                    ) : null}

                    <div className="rounded-[30px] border border-slate-200/80 bg-white/98 p-3 shadow-[0_10px_40px_-24px_rgba(15,23,42,0.4)]">
                      <div className="flex items-end gap-3">
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

                        <div className="flex min-h-[52px] flex-1 items-center rounded-[24px] bg-slate-50/80 px-1">
                          <textarea
                            value={input}
                            onChange={(event) => setInput(event.target.value)}
                            onKeyDown={handleComposerKeyDown}
                            placeholder="Escreva em inglês, peça correções, exercícios ou envie um áudio."
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
                    {hasSavedSessions ? "Escolha uma conversa ou crie uma nova" : "Selecione uma aula para começar"}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {hasSavedSessions
                      ? "Abra uma conversa pelo histórico à esquerda ou inicie um novo chat escolhendo primeiro a aula que você quer estudar."
                      : "A IA só inicia quando existe uma aula de referência. Isso mantém correções, vocabulário e exercícios sempre alinhados ao conteúdo estudado."}
                  </p>
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={openNewConversationPicker}
                      className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                    >
                      <BookOpen className="h-4 w-4" />
                      Escolher aula
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
