import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import AudioPlayer from "@/components/AudioPlayer";
import SpeakingVocabularyActivity from "@/components/SpeakingVocabularyActivity";
import SpeakingSimulationReplay from "@/components/SpeakingSimulationReplay";
import SpeakingTurnCard, { SpeakingHelpCard } from "@/components/SpeakingTurnCard";
import SpeakingSessionOverview from "@/components/SpeakingSessionOverview";
import SpeakingReportCard from "@/components/SpeakingReportCard";
import { WritingActivityCard, WritingCorrectionCard, WritingHelpCard } from "@/components/WritingActivityCard";
import WritingReportCard from "@/components/WritingReportCard";
import type { WritingActivity, WritingCorrection, WritingHelp, WritingReport } from "@/lib/writing";
import type { SpeakingReport } from "@/lib/aiStudy";
import { Button } from "@/components/ui/button";
import { audioRequestError, audioRequestId, recordingExtension, recordingSupportError } from "@/lib/speakingAudio";
import LessonReviewReportCard from "@/components/LessonReviewReportCard";
import { reviewActivityChoices, reviewActivityIcons } from "@/lib/lessonReview";
import { reviewAudioAsWav } from "@/lib/reviewAudio";
import MicRecorder, { RecordingState } from "@/components/MicRecorder";
import PronunciationFeedback, { SpeakingFeedback } from "@/components/PronunciationFeedback";
import QuickAddVocabularyCardDialog from "@/components/QuickAddVocabularyCardDialog";
import type { WritingFeedback } from "@/components/WritingFeedbackCard";
import { useToast } from "@/hooks/use-toast";
import {
  AIStudyMode,
  aiStudySessionsQueryKey,
  buildNewModePath,
  buildSessionPath,
  fetchAiStudySessions,
  formatDateTime,
  GuidedChoice,
  GuidedState,
  LessonReference,
  ListResponse,
  modeLabel,
  PracticeMode,
  SessionSummary,
  SpeakingVocabularyActivity as SpeakingActivity,
  SpeakingTurnContent,
  SpeakingHelp,
  SpeakingPhase,
  unwrapListResponse,
} from "@/lib/aiStudy";
import { api } from "@/lib/api";
import { absoluteMediaUrl } from "@/lib/config";
import { APP_PATHS } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  ArrowRight,
  ArrowLeft,
  BookPlus,
  BookOpen,
  CalendarDays,
  Clock3,
  GraduationCap,
  Loader2,
  Mic,
  Pencil,
  Search,
  Send,
  Sparkles,
  Trash2,
  type LucideIcon,
} from "lucide-react";

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
  metadata?: {
    review_audio_url?: string | null;
    review_feedback?: { is_correct: boolean };
    guided?: boolean;
    stage?: string;
    choices?: GuidedChoice[];
    choice_layout?: string;
    helper_text?: string;
    allow_free_text?: boolean;
    input_placeholder?: string;
    expected_input?: string;
    current_task?: string;
    recommended_choice_id?: string;
    summary_items?: string[];
    supports_streaming?: boolean;
    mode?: AIStudyMode;
    speaking_activity?: SpeakingActivity;
    speaking_simulation?: { question: string; situation_id: string; step_index: number; support_level: string };
    speaking_turn?: SpeakingTurnContent;
    speaking_help?: SpeakingHelp;
    pedagogical_phase?: SpeakingPhase;
    speaking_level?: string;
    speaking_prompt_id?: string;
    speaking_report?: SpeakingReport;
    speaking_clarification?: boolean;
    writing_activity?: WritingActivity;
    writing_correction?: WritingCorrection;
    writing_help?: WritingHelp;
    writing_report?: WritingReport;
    assessment_source?: "text" | "transcript" | null;
  } | null;
  created_at?: string;
  pending?: boolean;
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
  feedback: SpeakingFeedback | null;
  user_message?: AIMessage | null;
  assistant_message?: AIMessage | null;
  session: SessionSummary;
};

type GuidedActionPayload = {
  action_type: string;
  value: string;
  label: string;
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

type TranslationPopoverState = {
  text: string;
  translation: string;
  status: "loading" | "ready" | "error";
  top: number;
  left: number;
};

const normalizeSelectedText = (value: string) => value.replace(/\s+/g, " ").trim();

const getReviewError = (error: unknown, fallback: string) => {
  if (isAxiosError(error)) {
    const data = error.response?.data;
    if (typeof data?.detail === "string") return data.detail;
    if (Array.isArray(data) && typeof data[0] === "string") return data[0];
  }
  return error instanceof Error && !isAxiosError(error) ? error.message : fallback;
};

const isTranslatableSelection = (value: string) => {
  if (value.length < 2 || value.length > 280) return false;
  return (value.match(/[A-Za-z]/g) || []).length >= 2;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getTranslationPopoverPosition = (rect: DOMRect) => {
  const maxWidth = Math.min(window.innerWidth - 24, 360);
  const left = clamp(rect.left + rect.width / 2 - maxWidth / 2, 12, window.innerWidth - maxWidth - 12);
  const preferredTop = rect.bottom + 14;
  const fallbackTop = Math.max(12, rect.top - 154);
  const top = preferredTop <= window.innerHeight - 170 ? preferredTop : fallbackTop;
  return { top, left };
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

const modeDescription: Record<PracticeMode, string> = {
  review: "Revise o que você já estudou.",
  speaking: "Pratique sua fala em inglês.",
  writing: "Aprenda a construir frases e evolua sua escrita com uma aula guiada.",
};

const composerPlaceholderByMode: Record<PracticeMode, string> = {
  review: "Peça revisão de vocabulário, gramática ou exercícios desta aula.",
  speaking: "Responda em inglês ou envie um áudio para o próximo desafio guiado.",
  writing: "Escreva sua resposta em inglês para o próximo desafio guiado.",
};

const modeCardMeta: Record<
  PracticeMode,
  {
    icon: LucideIcon;
    eyebrow: string;
    accent: string;
    surface: string;
    iconWrap: string;
    badge: string;
    ctaLabel: string;
  }
> = {
  review: {
    icon: BookOpen,
    eyebrow: "Com aula de apoio",
    accent: "text-sky-700",
    surface:
      "border-sky-200/80 bg-[linear-gradient(145deg,rgba(240,249,255,0.98),rgba(255,255,255,0.96)_44%,rgba(236,253,245,0.9))] shadow-[0_28px_65px_-45px_rgba(14,116,144,0.45)]",
    iconWrap: "bg-sky-500/12 text-sky-700 ring-sky-300/55",
    badge: "Ideal para revisar conteúdo estudado",
    ctaLabel: "Selecionar revisão",
  },
  speaking: {
    icon: Mic,
    eyebrow: "Treino guiado",
    accent: "text-amber-700",
    surface:
      "border-amber-200/80 bg-[linear-gradient(145deg,rgba(255,247,237,0.98),rgba(255,255,255,0.96)_40%,rgba(254,243,199,0.82))] shadow-[0_28px_65px_-45px_rgba(180,83,9,0.38)]",
    iconWrap: "bg-amber-500/12 text-amber-700 ring-amber-300/55",
    badge: "Mais indicado para pronúncia e fluidez",
    ctaLabel: "Selecionar speaking",
  },
  writing: {
    icon: Pencil,
    eyebrow: "Escrita passo a passo",
    accent: "text-emerald-700",
    surface:
      "border-emerald-200/80 bg-[linear-gradient(145deg,rgba(236,253,245,0.98),rgba(255,255,255,0.96)_38%,rgba(220,252,231,0.88))] shadow-[0_28px_65px_-45px_rgba(5,150,105,0.32)]",
    iconWrap: "bg-emerald-500/12 text-emerald-700 ring-emerald-300/55",
    badge: "Ótimo para escrita com feedback pedagógico",
    ctaLabel: "Selecionar writing",
  },
};

const ModeCard = ({
  mode,
  recommended,
  onClick,
}: {
  mode: PracticeMode;
  recommended?: boolean;
  onClick: () => void;
}) => {
  const meta = modeCardMeta[mode];
  const Icon = meta.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-[30px] border p-5 text-left transition-all duration-200 hover:-translate-y-1",
        meta.surface,
        recommended && "ring-2 ring-amber-300/75",
      )}
    >
      <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-white/40 blur-3xl transition duration-200 group-hover:scale-110" />

      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-3">
            <span
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-[18px] ring-1 shadow-[0_16px_34px_-24px_rgba(15,23,42,0.35)]",
                meta.iconWrap,
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className={cn("text-[11px] font-semibold uppercase tracking-[0.24em]", meta.accent)}>{meta.eyebrow}</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{modeLabel[mode]}</p>
            </div>
          </div>
          {recommended ? (
            <span className="rounded-full border border-amber-300/70 bg-amber-100/85 px-3 py-1 text-[11px] font-semibold text-amber-800 shadow-[0_14px_30px_-22px_rgba(180,83,9,0.5)]">
              Recomendado
            </span>
          ) : null}
        </div>

        <p className="relative mt-4 flex-1 text-base leading-7 text-slate-700">{modeDescription[mode]}</p>

        <div className="relative mt-5 flex items-center justify-between gap-3 rounded-[20px] bg-slate-900 px-4 py-3 text-sm text-white shadow-[0_20px_40px_-28px_rgba(15,23,42,0.55)] transition group-hover:translate-y-0.5">
          <span className="font-semibold">{meta.ctaLabel}</span>
          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </div>
      </div>
    </button>
  );
};

const MobileModeButton = ({
  mode,
  recommended,
  onClick,
}: {
  mode: PracticeMode;
  recommended?: boolean;
  onClick: () => void;
}) => {
  const meta = modeCardMeta[mode];
  const Icon = meta.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex min-h-[6.5rem] flex-col items-center justify-center gap-2 rounded-[22px] border bg-white/95 px-2 py-3 text-center shadow-[0_14px_32px_-28px_rgba(15,23,42,0.3)]",
        recommended ? "border-amber-300 ring-2 ring-amber-200/80" : "border-slate-200",
      )}
    >
      <span className={cn("flex h-10 w-10 items-center justify-center rounded-2xl ring-1", meta.iconWrap)}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-sm font-semibold leading-5 text-slate-950">{modeLabel[mode]}</span>
      {recommended ? (
        <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-amber-400" aria-label="Recomendado" />
      ) : null}
    </button>
  );
};

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
  <article className="flex h-full flex-col rounded-[22px] border border-border bg-card/95 p-4 shadow-sm md:rounded-[26px] md:p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-base font-semibold text-foreground md:text-lg">{lesson.title}</p>
        <div className="mt-2 hidden flex-wrap gap-2 md:flex">
          {lesson.is_recent && <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700">Mais recente</span>}
          {lesson.is_recommended_review && <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-700">Revisão recomendada</span>}
          {recommended && <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-700">Professor recomendou esta aula</span>}
          {lesson.has_pending_activities && <span className="rounded-full bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-700">Atividades pendentes</span>}
        </div>
        <p className="mt-1 text-xs text-muted-foreground md:hidden">{formatShortDate(lesson.date)}</p>
      </div>
      <div className="rounded-2xl bg-muted p-3 text-muted-foreground">
        <BookOpen className="h-5 w-5" />
      </div>
    </div>

    <div className="mt-5 hidden gap-3 text-sm text-muted-foreground md:grid md:grid-cols-2">
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

    <p className="mt-5 hidden flex-1 text-sm leading-6 text-foreground/80 md:block">{lesson.summary_short || "Sem resumo salvo para esta aula."}</p>

    <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-muted/50 px-3 py-3 text-sm md:mt-5 md:px-4">
      <div className="hidden md:block">
        <p className="font-medium text-foreground">{lesson.flashcard_count ?? 0} flashcards</p>
        <p className="text-xs text-muted-foreground">{lesson.level}</p>
      </div>
      <p className="text-xs font-medium text-muted-foreground md:hidden">{lesson.level || "Sem nivel"}</p>
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

const GuidedChoices = ({
  choices,
  layout,
  helperText,
  disabled,
  onSelect,
  progressive,
}: {
  choices: GuidedChoice[];
  layout?: string;
  helperText?: string;
  disabled?: boolean;
  onSelect: (choice: GuidedChoice) => void;
  progressive?: boolean;
}) => {
  if (!choices.length) return null;
  const isGrid = layout === "grid";

  const renderChoices = (items: GuidedChoice[]) => (
      <div className={cn("gap-2", isGrid ? "grid sm:grid-cols-2" : "flex flex-wrap")}>
        {items.map((choice) => {
          const Icon = choice.action_type === "review_activity" ? reviewActivityIcons[choice.value as keyof typeof reviewActivityIcons] : undefined;
          return (
            <button
              key={choice.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(choice)}
              className={cn(
                "text-left transition disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2",
                isGrid
                  ? "rounded-2xl border border-slate-200 bg-slate-50/90 p-3 hover:border-slate-300 hover:bg-white"
                  : choice.variant === "primary"
                    ? "rounded-full bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:opacity-90"
                    : choice.variant === "outline"
                      ? "rounded-full border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      : "rounded-full bg-slate-100 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200",
              )}
            >
              {isGrid ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    {Icon ? <span className="rounded-xl bg-sky-100 p-2 text-sky-700"><Icon className="h-4 w-4" aria-hidden="true" /></span> : choice.emoji ? <span className="text-base">{choice.emoji}</span> : null}
                    <span className="font-semibold text-foreground">{choice.label}</span>
                  </div>
                  {choice.description ? <p className="text-xs leading-5 text-muted-foreground">{choice.description}</p> : null}
                </div>
              ) : (
                <span className="inline-flex items-center gap-2">
                  {choice.emoji ? <span>{choice.emoji}</span> : null}
                  <span>{choice.label}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
  );
  const primary = choices.filter((choice) => ["continue", "resume_simulation"].includes(choice.value));
  const extra = choices.filter((choice) => !primary.includes(choice));
  return (
    <div className="mt-3 space-y-3">
      {progressive ? <>
        {renderChoices(primary)}
        {extra.length ? <details className="rounded-xl border border-border bg-muted/30 p-3">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">Ajudas e opções</summary>
          <div className="mt-3">{renderChoices(extra)}</div>
        </details> : null}
      </> : renderChoices(choices)}
      {helperText ? <p className="text-xs leading-5 text-muted-foreground">{helperText}</p> : null}
    </div>
  );
};

const GuidedSessionOverview = ({ state, mode }: { state: GuidedState; mode: PracticeMode }) => {
  return mode === "speaking" ? <SpeakingSessionOverview state={state} /> : null;
};

const MessageBubble = ({
  message,
  isInteractive,
  onChoiceSelect,
  choiceDisabled,
  onTextSelection,
  sessionId,
  onRecord,
  onRepeat,
  onContinue,
}: {
  message: AIMessage;
  isInteractive?: boolean;
  onChoiceSelect?: (choice: GuidedChoice) => void;
  choiceDisabled?: boolean;
  onTextSelection?: (container: HTMLDivElement) => void;
  sessionId: string;
  onRecord?: () => void;
  onRepeat?: (feedback: SpeakingFeedback, chunkIndex?: number) => void;
  onContinue?: () => void;
}) => {
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
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
      data-speaking-prompt={message.metadata?.speaking_prompt_id || message.id}
      data-writing-current={isInteractive && (message.metadata?.writing_activity || message.metadata?.writing_correction || message.metadata?.writing_report) ? "true" : undefined}
      data-speaking-current={isInteractive && (message.feedback_detail || message.metadata?.speaking_turn || message.metadata?.speaking_activity || message.metadata?.speaking_help || message.metadata?.speaking_simulation) ? "true" : undefined}>
      <div className={cn("w-full max-w-[min(100%,58rem)] space-y-2.5", isUser ? "items-end" : "items-start")}>
        <p
          className={cn(
            "px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground",
            isUser ? "text-right" : "text-left",
          )}
        >
          {speakerLabel}
        </p>
        {message.feedback_detail ? <PronunciationFeedback feedback={message.feedback_detail}
          disabled={choiceDisabled} onRepeat={isInteractive ? onRepeat : undefined} onContinue={isInteractive ? onContinue : undefined}
          onNextSituation={isInteractive && onChoiceSelect && message.metadata?.choices?.some((choice) => choice.value === "new_challenge")
            ? () => onChoiceSelect(message.metadata!.choices!.find((choice) => choice.value === "new_challenge")!) : undefined} /> : null}
        <div
          className={cn(
            "rounded-[28px] px-4 py-3.5 text-sm leading-6 shadow-sm",
            isUser
              ? "rounded-br-lg bg-slate-950 text-white"
              : "rounded-bl-lg border border-slate-200/80 bg-white/95 text-card-foreground",
          )}
        >
          {message.metadata?.review_audio_url && (
            <div className="mb-3 rounded-2xl bg-sky-50 p-3">
              <p className="mb-2 text-xs text-slate-600">Ouça o áudio gerado por IA e responda à pergunta abaixo.</p>
              <AudioPlayer src={absoluteMediaUrl(message.metadata.review_audio_url)} compact />
            </div>
          )}
          {message.audio_url ? (
            <div className="space-y-3">
              <div className={cn("rounded-2xl p-3", isUser ? "bg-white/10" : "bg-slate-50")}>
                <AudioPlayer src={absoluteMediaUrl(message.audio_url)} compact />
              </div>
              {message.text ? (
                <div
                  data-translatable-message={!isUser || undefined}
                  onMouseUp={!isUser && onTextSelection ? (event) => onTextSelection(event.currentTarget) : undefined}
                  onTouchEnd={!isUser && onTextSelection ? (event) => onTextSelection(event.currentTarget) : undefined}
                >
                  <p className={cn("text-[11px] font-semibold uppercase tracking-[0.18em]", isUser ? "text-white/70" : "text-muted-foreground")}>
                    Transcrição
                  </p>
                  <p className="mt-2 whitespace-pre-line">{message.text}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <div
              data-writing-focus={message.metadata?.writing_activity || message.metadata?.writing_correction || message.metadata?.writing_report ? true : undefined}
              className={message.metadata?.writing_activity || message.metadata?.writing_correction || message.metadata?.writing_report ? "outline-none" : undefined}
              data-translatable-message={!isUser || undefined}
              onMouseUp={!isUser && onTextSelection ? (event) => onTextSelection(event.currentTarget) : undefined}
              onTouchEnd={!isUser && onTextSelection ? (event) => onTextSelection(event.currentTarget) : undefined}
            >
              {message.metadata?.writing_report ? <WritingReportCard report={message.metadata.writing_report} />
                : message.metadata?.writing_activity || message.metadata?.writing_correction ? <div className="space-y-5">
                  {message.metadata.writing_correction ? <WritingCorrectionCard correction={message.metadata.writing_correction} /> : null}
                  {message.metadata.writing_help ? <WritingHelpCard help={message.metadata.writing_help} /> : null}
                  {message.metadata.writing_activity ? <WritingActivityCard activity={message.metadata.writing_activity} /> : <p className="whitespace-pre-line">{message.text}</p>}
                </div> : message.metadata?.speaking_report ? <div className="space-y-4">
                {!message.feedback_detail && message.metadata.speaking_turn?.feedback ? <p className="whitespace-pre-line text-sm">{message.metadata.speaking_turn.feedback}</p> : null}
                {message.feedback_detail ? <details><summary className="cursor-pointer text-sm text-muted-foreground">Ver resumo da situação</summary>
                  <div className="mt-3"><SpeakingReportCard report={message.metadata.speaking_report} /></div></details>
                  : <SpeakingReportCard report={message.metadata.speaking_report} />}
              </div> : message.metadata?.speaking_activity ? (
                <SpeakingVocabularyActivity activity={message.metadata.speaking_activity}
                  sessionId={sessionId} messageId={message.id} instruction={message.text}
                  interactive={isInteractive} disabled={choiceDisabled} onRecord={onRecord} />
              ) : message.metadata?.speaking_help ? <SpeakingHelpCard help={message.metadata.speaking_help} />
                : message.metadata?.speaking_turn ? <SpeakingTurnCard content={message.feedback_detail ? { ...message.metadata.speaking_turn, feedback: "" } : message.metadata.speaking_turn}
                  phase={message.metadata.pedagogical_phase} level={message.metadata.speaking_level}
                  sessionId={sessionId} messageId={message.id} assessmentSource={message.metadata.assessment_source} />
                : <p data-speaking-focus={message.metadata?.speaking_simulation ? true : undefined} className="whitespace-pre-line">{message.text}</p>}
            </div>
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

        {isInteractive && message.metadata?.speaking_simulation?.question ? (
          <SpeakingSimulationReplay key={message.id} sessionId={sessionId} messageId={message.id}
            question={message.metadata.speaking_simulation.question} />
        ) : null}
        {isInteractive && message.metadata?.guided && message.metadata?.choices?.length && onChoiceSelect ? (
          <GuidedChoices
            choices={message.metadata.choices}
            layout={message.metadata.choice_layout}
            helperText={message.metadata.helper_text}
            disabled={choiceDisabled}
            onSelect={onChoiceSelect}
            progressive={Boolean(message.metadata?.speaking_simulation)}
          />
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
  const [lessonSearch, setLessonSearch] = useState("");
  const [isChangingLesson, setIsChangingLesson] = useState(false);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [useText, setUseText] = useState(false);
  const [audioError, setAudioError] = useState("");
  const [retryPractice, setRetryPractice] = useState<{ feedbackId: string; chunkIndex?: number; target: string } | null>(null);
  const [feedbackLanguage, setFeedbackLanguage] = useState("pt-BR");
  const textInputRef = useRef<HTMLTextAreaElement | null>(null);
  const recorderContainerRef = useRef<HTMLDivElement | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const audioAttemptRef = useRef<{ blob: Blob; requestId: string } | null>(null);
  const focusedSpeakingPromptRef = useRef("");
  useEffect(() => { if (useText) textInputRef.current?.focus(); }, [useText]);
  const [showRecorder, setShowRecorder] = useState(false);
  const [creatingLessonId, setCreatingLessonId] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [translationPopover, setTranslationPopover] = useState<TranslationPopoverState | null>(null);
  const [isQuickCardDialogOpen, setIsQuickCardDialogOpen] = useState(false);
  const [quickCardDraft, setQuickCardDraft] = useState({ front: "", back: "" });
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const translationCacheRef = useRef(new Map<string, string>());
  const translationRequestIdRef = useRef(0);
  const deferredLessonSearch = useDeferredValue(lessonSearch);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const selectedSessionId = sessionId ?? null;
  const isNewConversationFlow = searchParams.get("mode") === "new";
  const selectedPracticeMode = (searchParams.get("practiceMode") as PracticeMode | null) ?? null;
  const pickerMode: PickerMode = isChangingLesson ? "change" : isNewConversationFlow ? "new" : null;

  const sessionsQuery = useQuery({
    queryKey: aiStudySessionsQueryKey(),
    queryFn: () => fetchAiStudySessions(),
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
  const guidedState = activeSession?.guided_state ?? undefined;
  const reviewCompleted = activeSession?.mode === "review" && activeSession.status === "completed";
  activeSessionIdRef.current = selectedSessionId;
  const latestInteractiveAssistantMessage = activeSession?.messages
    ? [...activeSession.messages].reverse().find((message) => message.role === "assistant" && (activeSession.mode === "review" || (message.metadata?.choices?.length ?? 0) > 0 || message.feedback_detail || message.metadata?.speaking_clarification))
    : null;

  useEffect(() => {
    if (sessionDetailQuery.data) {
      setSessionDraft(sessionDetailQuery.data);
      setRenameValue(sessionDetailQuery.data.title || "");
    }
  }, [sessionDetailQuery.data]);

  useEffect(() => {
    const el = messageListRef.current;
    if (!el) return;
    const report = el.querySelector('[aria-label="Relatório da revisão"]');
    if (report && reviewCompleted) {
      el.scrollTop += report.getBoundingClientRect().top - el.getBoundingClientRect().top - 16;
      return;
    }
    const focus = el.querySelector<HTMLElement>('[data-speaking-current="true"] [data-speaking-focus], [data-writing-current="true"] [data-writing-focus]');
    if (focus) {
      el.scrollTop += focus.getBoundingClientRect().top - el.getBoundingClientRect().top - 12;
      const key = `${activeSession?.id}:${focus.closest('[data-speaking-prompt]')?.getAttribute('data-speaking-prompt')}`;
      if (key !== focusedSpeakingPromptRef.current) {
        focusedSpeakingPromptRef.current = key;
        focus.setAttribute('tabindex', '-1');
        focus.scrollIntoView?.({ block: "nearest" });
        focus.focus({ preventScroll: true });
      }
    }
    else {
      const lastMessage = activeSession?.messages.slice(-1)[0];
      el.scrollTop = lastMessage?.metadata?.choice_layout === "grid" && activeSession?.messages.length === 1 ? 0 : el.scrollHeight;
    }
  }, [activeSession?.id, activeSession?.messages, reviewCompleted]);

  useEffect(() => {
    setShowRecorder(false);
    setRecordingState("idle");
    setUseText(false);
    setAudioError("");
    setRetryPractice(null);
    setFeedbackLanguage("pt-BR");
    setIsSending(false);
    audioAttemptRef.current = null;
    if (!selectedSessionId) {
      setSessionDraft(null);
      setRenameValue("");
      setIsRenaming(false);
      setShowRecorder(false);
      setRecordingState("idle");
      setTranslationPopover(null);
    }
  }, [selectedSessionId]);

  useEffect(() => {
    translationRequestIdRef.current += 1;
    setTranslationPopover(null);
  }, [selectedSessionId]);

  useEffect(() => {
    if (!selectedSessionId) {
      setIsChangingLesson(false);
    }
  }, [selectedSessionId]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-translation-popover='true']")) return;
      if (target?.closest("[data-translatable-message]")) return;
      setTranslationPopover(null);
    };
    const clearPopover = () => setTranslationPopover(null);
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", clearPopover);
    window.addEventListener("scroll", clearPopover, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", clearPopover);
      window.removeEventListener("scroll", clearPopover, true);
    };
  }, []);

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

  const hasSavedSessions = (sessionsQuery.data?.length ?? 0) > 0;
  const isPickerVisible = pickerMode !== null || !selectedSessionId;
  const isConversationPage = Boolean(selectedSessionId);
  const isBusy = isSending || isFinishing || sessionDetailQuery.isFetching;
  const activeMode: PracticeMode | undefined =
    activeSession?.mode && activeSession.mode !== "listening" ? activeSession.mode : undefined;
  const composerPlaceholder =
    latestInteractiveAssistantMessage?.metadata?.input_placeholder ||
    guidedState?.input_placeholder ||
    (activeMode ? composerPlaceholderByMode[activeMode] : composerPlaceholderByMode.review);
  const guidedExpectedInput = latestInteractiveAssistantMessage?.metadata?.expected_input || guidedState?.expected_input || "";
  const canRecordAudio = (activeMode === "speaking" && (!guidedState || guidedState.stage === "active")) ||
    (activeMode === "review" && !reviewCompleted && guidedState?.stage === "awaiting_answer" && guidedState.expected_input === "audio_or_text");
  const canUseAudioInput = canRecordAudio && (Boolean(retryPractice) || !guidedExpectedInput || guidedExpectedInput === "audio_or_text");
  const isCapturing = ["requesting", "recording", "paused"].includes(recordingState);
  const oralResponse = canUseAudioInput && activeMode === "speaking";
  const showTextInput = !((activeMode === "speaking" || activeMode === "writing") && activeSession?.status === "completed") && (!oralResponse || useText || Boolean(recordingSupportError()));
  const openTextResponse = () => {
    setRetryPractice(null);
    setUseText(true);
    setShowRecorder(false);
  };
  const openVoiceResponse = () => {
    setRetryPractice(null);
    setUseText(false);
    setShowRecorder(true);
    recorderContainerRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  };
  const repeatSpeaking = (feedback: SpeakingFeedback, chunkIndex?: number) => {
    const details = feedback.learning_feedback;
    const target = chunkIndex === undefined ? details?.full_sentence || details?.suggested_sentence : details?.chunks[chunkIndex];
    if (!target) return;
    audioAttemptRef.current = null;
    setAudioError("");
    setRecordingState("idle");
    setRetryPractice({ feedbackId: feedback.id, chunkIndex, target });
    setUseText(false);
    setShowRecorder(true);
    recorderContainerRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  };

  useEffect(() => {
    if (!canUseAudioInput) {
      setShowRecorder(false);
      if (recordingState !== "uploading") {
        setRecordingState("idle");
      }
    }
  }, [canUseAudioInput, recordingState]);

  useEffect(() => {
    if (!selectedSessionId || activeMode !== "review" || reviewCompleted || !guidedState?.review_activity) return;
    let lastActivity = Date.now();
    const markActive = () => { lastActivity = Date.now(); };
    const heartbeat = () => {
      const playingAudio = Array.from(document.querySelectorAll("audio")).some((audio) => !audio.paused);
      if (document.visibilityState !== "visible" || (Date.now() - lastActivity > 60000 && !playingAudio && recordingState !== "recording")) return;
      void api.post(`/ai-study/sessions/${selectedSessionId}/review/heartbeat/`).catch(() => undefined);
    };
    window.addEventListener("pointerdown", markActive);
    window.addEventListener("keydown", markActive);
    const timer = window.setInterval(heartbeat, 30000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", markActive);
      window.removeEventListener("keydown", markActive);
    };
  }, [selectedSessionId, activeMode, reviewCompleted, guidedState?.review_activity, recordingState]);

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
    navigate(APP_PATHS.aiPractice);
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
    if (activeSession.mode === "review" && (guidedState?.review_activity || reviewCompleted)) {
      if (!reviewCompleted) {
        const saved = await finishReview();
        if (!saved) return;
      }
      await handleCreateSession("review", lessonId);
      return;
    }
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

  const finishReview = async () => {
    if (!activeSession || isBusy) return false;
    setIsFinishing(true);
    try {
      const response = await api.post(`/ai-study/sessions/${activeSession.id}/review/finish/`);
      const data = response.data as MessageResponse;
      syncDraft({
        ...mergeSummaryIntoDetail(activeSession, data.session),
        messages: [...activeSession.messages.filter((message) => message.id !== data.assistant_message?.id),
          ...(data.assistant_message ? [data.assistant_message] : [])],
      });
      await Promise.all([
        invalidateSessionList(),
        queryClient.invalidateQueries({ queryKey: ["ai-study-progress-overview"] }),
      ]);
      return true;
    } catch (error) {
      toast({ title: "Não foi possível finalizar a revisão", description: getReviewError(error, "Tente novamente. Seu progresso continua salvo."), variant: "destructive" });
      return false;
    } finally {
      setIsFinishing(false);
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
      const remainingSessions = (queryClient.getQueryData(aiStudySessionsQueryKey()) as SessionSummary[] | undefined) || [];
      const nextSession = remainingSessions.find((session) => session.id !== deletedId);
      if (nextSession) {
        startTransition(() => navigate(buildSessionPath(nextSession.id)));
      } else {
        navigate(buildNewModePath());
      }
    } catch {
      toast({
        title: "Não foi possível excluir",
        description: "A conversa não foi removida.",
        variant: "destructive",
      });
    }
  };

  const sendMessage = async ({
    text,
    guidedAction,
    textType = "free",
  }: {
    text?: string;
    guidedAction?: GuidedActionPayload;
    textType?: string;
  }) => {
    if (!activeSession || isBusy || reviewCompleted) return;
    const requestSessionId = activeSession.id;
    const trimmedText = text?.trim() || "";
    const displayText = trimmedText || guidedAction?.label || "";
    if (!displayText) return;
    const optimisticId = `local-${Date.now()}`;
    const optimisticMessage: AIMessage = {
      id: optimisticId,
      role: "user",
      content_type: "text",
      text: displayText,
      pending: true,
      created_at: new Date().toISOString(),
    };

    if (trimmedText) {
      setInput("");
    }
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
      const response = await api.post(`/ai-study/sessions/${activeSession.id}/message/`, {
        text: trimmedText,
        text_type: textType,
        guided_action: guidedAction,
        ...(activeSession.mode === "review" ? { review_revision: guidedState?.review_revision ?? 0 } : {}),
      });
      const data = response.data as MessageResponse;
      setSessionDraft((current) => {
        if (!current || current.id !== requestSessionId) return current;
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
    } catch (error) {
      if (activeSessionIdRef.current === requestSessionId && trimmedText) {
        setInput((current) => current || trimmedText);
      }
      setSessionDraft((current) => {
        if (!current || current.id !== requestSessionId) return current;
        const next = {
          ...current,
          messages: current.messages.filter((message) => message.id !== optimisticId),
        };
        queryClient.setQueryData(["ai-study-session", next.id], next);
        return next;
      });
      toast({
        title: "Mensagem não enviada",
        description: getReviewError(error, "Não foi possível conectar com a IA. Seu progresso foi mantido."),
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const sendText = async () => {
    if (!input.trim()) return;
    await sendMessage({ text: input });
  };

  const handleGuidedChoice = async (choice: GuidedChoice) => {
    await sendMessage({
      guidedAction: {
        action_type: choice.action_type,
        value: choice.value,
        label: choice.label,
      },
    });
  };

  const uploadAudio = async (blob: Blob, durationSeconds: number) => {
    if (!activeSession || !canUseAudioInput || isSending || reviewCompleted) return;
    const requestSessionId = activeSession.id;
    if (audioAttemptRef.current?.blob !== blob) audioAttemptRef.current = { blob, requestId: audioRequestId() };
    const requestId = audioAttemptRef.current.requestId;
    const optimisticId = `audio-${requestId}`;
    setAudioError("");
    setRecordingState("uploading");
    setIsSending(true);
    setSessionDraft((current) => {
      if (!current || current.id !== requestSessionId) return current;
      const next = { ...current, messages: [...current.messages, {
        id: optimisticId, role: "user" as const, content_type: "audio" as const,
        text: "Enviando sua gravação...", pending: true, created_at: new Date().toISOString(),
      }] };
      queryClient.setQueryData(["ai-study-session", next.id], next);
      return next;
    });
    try {
      const recording = activeSession.mode === "review" ? await reviewAudioAsWav(blob) : blob;
      const formData = new FormData();
      formData.append("audio", recording, `speaking-${requestId}.${recordingExtension(recording.type)}`);
      formData.append("duration_seconds", String(durationSeconds));
      if (activeSession.mode === "review") formData.append("review_revision", String(guidedState?.review_revision ?? 0));
      formData.append("request_id", requestId);
      formData.append("feedback_language", feedbackLanguage);
      if (retryPractice) {
        formData.append("retry_feedback_id", retryPractice.feedbackId);
        if (retryPractice.chunkIndex !== undefined) formData.append("chunk_index", String(retryPractice.chunkIndex));
      }
      if (latestInteractiveAssistantMessage?.metadata?.speaking_prompt_id) {
        formData.append("prompt_id", latestInteractiveAssistantMessage.metadata.speaking_prompt_id);
      }
      const response = await api.post(`/ai-study/sessions/${requestSessionId}/audio/`, formData, {
        timeout: 120_000,
        onUploadProgress: (event) => {
          if (event.total && event.loaded >= event.total && activeSessionIdRef.current === requestSessionId) setRecordingState("processing");
        },
      });
      if (activeSessionIdRef.current !== requestSessionId) return;
      const data = response.data as AudioResponse;
      setSessionDraft((current) => {
        if (!current || current.id !== requestSessionId) return current;
        const persistedMessages = current.messages.filter((message) => message.id !== optimisticId);
        const existingIds = new Set(persistedMessages.map((message) => message.id));
        const returned = [data.user_message, data.assistant_message].filter((message): message is AIMessage => Boolean(message) && !existingIds.has(message.id));
        const next: SessionDetail = { ...mergeSummaryIntoDetail(current, data.session), messages: [...persistedMessages, ...returned] };
        queryClient.setQueryData(["ai-study-session", next.id], next);
        return next;
      });
      setRecordingState("idle");
      setRetryPractice(null);
      setShowRecorder(false);
      await invalidateSessionList();
    } catch (error) {
      if (activeSessionIdRef.current !== requestSessionId) return;
      setSessionDraft((current) => {
        if (!current || current.id !== requestSessionId) return current;
        const next = { ...current, messages: current.messages.filter((message) => message.id !== optimisticId) };
        queryClient.setQueryData(["ai-study-session", next.id], next);
        return next;
      });
      setAudioError(audioRequestError(error));
      setRecordingState("error");
      toast({
        title: "Áudio não processado",
        description: getReviewError(error, "Verifique o microfone e tente novamente."),
        variant: "destructive",
      });
    } finally {
      if (activeSessionIdRef.current === requestSessionId) setIsSending(false);
    }
  };

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isCapturing || isBusy) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendText();
    }
  };

  const translateSelectionFromContainer = async (container: HTMLDivElement) => {
    if (!activeSession) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      setTranslationPopover(null);
      return;
    }

    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    if ((anchorNode && !container.contains(anchorNode)) || (focusNode && !container.contains(focusNode))) {
      return;
    }

    const text = normalizeSelectedText(selection.toString());
    if (!isTranslatableSelection(text)) {
      setTranslationPopover(null);
      return;
    }

    const rect = selection.getRangeAt(0).getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    const position = getTranslationPopoverPosition(rect);
    const cachedTranslation = translationCacheRef.current.get(text);

    setTranslationPopover({
      text,
      translation: cachedTranslation || "",
      status: cachedTranslation ? "ready" : "loading",
      ...position,
    });

    if (cachedTranslation) return;

    const requestId = ++translationRequestIdRef.current;
    try {
      const response = await api.post(`/ai-study/sessions/${activeSession.id}/translate-selection/`, {
        text,
      });
      if (requestId !== translationRequestIdRef.current) return;
      const translation = normalizeSelectedText(String(response.data?.translation || ""));
      if (!translation) {
        throw new Error("Empty translation");
      }
      translationCacheRef.current.set(text, translation);
      setTranslationPopover((current) =>
        current && current.text === text
          ? {
              ...current,
              translation,
              status: "ready",
            }
          : current,
      );
    } catch {
      if (requestId !== translationRequestIdRef.current) return;
      setTranslationPopover((current) =>
        current && current.text === text
          ? {
              ...current,
              status: "error",
            }
          : current,
      );
    }
  };

  const handleTextSelection = (container: HTMLDivElement) => {
    window.setTimeout(() => {
      void translateSelectionFromContainer(container);
    }, 0);
  };

  const openQuickCardDialog = ({
    front = "",
    back = "",
  }: {
    front?: string;
    back?: string;
  } = {}) => {
    setQuickCardDraft({
      front: front.trim(),
      back: back.trim(),
    });
    setIsQuickCardDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div
        className={cn(
          "space-y-6",
          isConversationPage && "h-[calc(100dvh_-_12rem_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom))] overflow-hidden space-y-0 lg:h-[calc(100dvh_-_4.5rem)]",
          isConversationPage && activeMode === "speaking" && "min-h-[40rem]",
        )}
      >
        <section
          className={cn(
            "relative flex flex-col overflow-hidden rounded-[32px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.72),rgba(255,255,255,0.98)_16%,rgba(255,255,255,0.98))] shadow-sm",
            isConversationPage ? "h-full min-h-0" : "min-h-[calc(100vh_-_12rem)]",
          )}
        >
            {isPickerVisible ? (
              <div className="flex h-full flex-col">
                <div className="flex-1 overflow-y-auto p-4">
                  {!selectedPracticeMode && pickerMode !== "change" ? (
                    <div className="space-y-6">
                      <section className="relative overflow-hidden rounded-[24px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.16),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-4 shadow-[0_28px_70px_-48px_rgba(15,23,42,0.34)] md:rounded-[30px] md:p-7">
                        <div className="absolute right-[-2rem] top-[-2rem] h-36 w-36 rounded-full bg-sky-300/18 blur-3xl" />
                        <div className="absolute bottom-[-2rem] left-[-1rem] h-32 w-32 rounded-full bg-emerald-300/16 blur-3xl" />

                        <div className="relative">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-sky-200/80 bg-sky-100/75 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700">
                                Praticar com IA
                              </span>
                              {recommendation?.mode ? (
                                <span className="rounded-full border border-amber-200/80 bg-amber-100/80 px-3 py-1 text-[11px] font-semibold text-amber-800">
                                  Recomendação ativa de {recommendation.teacher_name || "seu professor"}
                                </span>
                              ) : null}
                            </div>

                            <h2 className="mt-3 max-w-3xl text-2xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                              Como quer praticar?
                            </h2>
                            <p className="mt-4 hidden max-w-2xl text-sm leading-7 text-slate-600 md:block sm:text-[15px]">
                              Você pode revisar uma aula, treinar pronúncia ou enviar um texto para correção. Cada modo foi desenhado para combinar com o fluxo visual do portal e te colocar em prática mais rápido.
                            </p>

                            <div className="mt-5 hidden flex-wrap gap-3 text-sm text-slate-600 md:flex">
                              <div className="rounded-full border border-white/80 bg-white/75 px-4 py-2 shadow-[0_14px_28px_-24px_rgba(15,23,42,0.25)]">
                                Troque de modo sempre que precisar
                              </div>
                              <div className="rounded-full border border-white/80 bg-white/75 px-4 py-2 shadow-[0_14px_28px_-24px_rgba(15,23,42,0.25)]">
                                Continue de onde parou nas conversas salvas
                              </div>
                            </div>
                          </div>
                        </div>
                      </section>

                      <div className="grid grid-cols-3 gap-2 md:hidden">
                        {(["review", "speaking", "writing"] as PracticeMode[]).map((mode) => (
                          <MobileModeButton
                            key={mode}
                            mode={mode}
                            recommended={recommendation?.mode === mode}
                            onClick={() => handleSelectMode(mode)}
                          />
                        ))}
                      </div>

                      <div className="hidden gap-4 md:grid xl:grid-cols-3">
                        {(["review", "speaking", "writing"] as PracticeMode[]).map((mode) => (
                          <ModeCard
                            key={mode}
                            mode={mode}
                            recommended={recommendation?.mode === mode}
                            onClick={() => handleSelectMode(mode)}
                          />
                        ))}
                      </div>
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
                    <div className="mx-auto flex h-full w-full max-w-5xl flex-col justify-start md:justify-center">
                      <div
                        className={cn(
                          "overflow-hidden rounded-[24px] border p-4 shadow-[0_28px_80px_-50px_rgba(15,23,42,0.4)] md:rounded-[32px] md:p-7",
                          modeCardMeta[selectedPracticeMode].surface,
                        )}
                      >
                        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
                          <div>
                            <div className="flex flex-wrap items-center gap-3">
                              <span
                                className={cn(
                                  "flex h-12 w-12 items-center justify-center rounded-[18px] ring-1 shadow-[0_18px_38px_-24px_rgba(15,23,42,0.35)]",
                                  modeCardMeta[selectedPracticeMode].iconWrap,
                                )}
                              >
                                {selectedPracticeMode === "speaking" ? <Mic className="h-5 w-5" /> : <Pencil className="h-5 w-5" />}
                              </span>
                              <span className="rounded-full border border-white/80 bg-white/78 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600">
                                {modeCardMeta[selectedPracticeMode].eyebrow}
                              </span>
                              {recommendation?.mode === selectedPracticeMode ? (
                                <span className="rounded-full border border-amber-200/80 bg-amber-100/80 px-3 py-1 text-[11px] font-semibold text-amber-800">
                                  Recomendado por {recommendation.teacher_name || "seu professor"}
                                </span>
                              ) : null}
                            </div>

                            <p className={cn("mt-4 text-xs font-semibold uppercase tracking-[0.24em] md:mt-5", modeCardMeta[selectedPracticeMode].accent)}>
                              {modeLabel[selectedPracticeMode]}
                            </p>
                            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-[2.15rem]">
                              {selectedPracticeMode === "speaking" ? "Iniciar speaking" : "Iniciar writing"}
                            </h2>
                            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-700">
                              {modeDescription[selectedPracticeMode]}
                            </p>
                          </div>

                          <div className="flex flex-col gap-4 rounded-[28px] border border-white/80 bg-white/74 p-5 shadow-[0_22px_52px_-40px_rgba(15,23,42,0.28)] backdrop-blur">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Pronto para começar</p>
                              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                                {selectedPracticeMode === "speaking" ? "Iniciar speaking" : "Iniciar writing"}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => void handleCreateSession(selectedPracticeMode, recommendation?.mode === selectedPracticeMode ? recommendation.lesson || undefined : undefined)}
                              disabled={creatingLessonId === selectedPracticeMode}
                              className="inline-flex items-center justify-center gap-2 rounded-[20px] bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-[0_18px_36px_-26px_rgba(15,23,42,0.35)] transition hover:-translate-y-0.5 disabled:opacity-50"
                            >
                              {creatingLessonId === selectedPracticeMode ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                              {selectedPracticeMode === "speaking" ? "Iniciar speaking" : "Iniciar writing"}
                            </button>
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
                      <div className="mb-1 flex flex-wrap items-center gap-2">
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
                          <h2 className="truncate text-xl font-semibold tracking-tight text-foreground md:text-[30px]">{activeSession.title}</h2>
                          <p className="mt-1 hidden text-sm text-muted-foreground md:block">
                            {activeSession.message_count} mensagens · última interação em {formatDateTime(activeSession.last_interaction_at)}
                          </p>
                        </>
                      )}

                      {guidedState?.enabled && activeMode && activeMode !== "review" ? (
                        <GuidedSessionOverview state={guidedState} mode={activeMode} />
                      ) : null}
                      {activeMode === "review" && guidedState?.review_activity && !reviewCompleted && (
                        <p className="mt-2 text-xs text-slate-600" aria-live="polite">
                          {guidedState.review_activity_label} · {guidedState.correct_count || 0} acertos · {guidedState.incorrect_count || 0} erros · Dificuldade {guidedState.difficulty || "1"}/5
                        </p>
                      )}
                    </div>

                    <details className="shrink-0" open={activeSession.mode === "review" ? true : undefined}>
                      <summary className={cn("cursor-pointer rounded-full border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground", activeSession.mode === "review" && "hidden")}>Opções da sessão</summary>
                      <div className={cn("flex flex-wrap gap-2", activeSession.mode !== "review" && "mt-2")}>
                      {activeMode === "review" && (reviewCompleted ? (
                        <button type="button" onClick={() => void handleCreateSession("review", activeSession.lesson || undefined)} disabled={isBusy || Boolean(creatingLessonId)}
                          className="rounded-full bg-sky-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Nova revisão</button>
                      ) : (
                        <>
                          {guidedState?.review_activity && <button type="button" disabled={isBusy} onClick={() => void handleGuidedChoice({ id: "menu", action_type: "review_control", value: "menu", label: "Escolher prática" })}
                            className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-800 disabled:opacity-50">Escolher prática</button>}
                          <button type="button" disabled={isBusy || recordingState === "recording" || recordingState === "paused"} onClick={() => void finishReview()}
                            className="rounded-full bg-sky-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{isFinishing ? "Salvando relatório..." : "Finalizar revisão"}</button>
                        </>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          openQuickCardDialog({
                            front: translationPopover?.text || "",
                            back: translationPopover?.status === "ready" ? translationPopover.translation : "",
                          })
                        }
                        className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-900 transition hover:bg-emerald-100"
                      >
                        <BookPlus className="h-4 w-4" />
                        <span className="md:hidden">Card</span>
                        <span className="hidden md:inline">Card: adicionar nova palavra</span>
                      </button>
                      {!isRenaming ? (
                        <button
                          type="button"
                          onClick={() => setIsRenaming(true)}
                          aria-label="Renomear"
                          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white p-2 sm:px-4 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" />
                          <span className="hidden sm:inline">Renomear</span>
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void handleDelete()}
                        aria-label="Excluir"
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white p-2 sm:px-4 text-sm font-medium text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="hidden sm:inline">Excluir</span>
                      </button>
                      </div>
                    </details>
                  </div>
                </header>

                <div ref={messageListRef} role="log" aria-label="Conversa com o professor" aria-live="polite" aria-relevant="additions text" className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
                  <div
                    className={cn(
                      "mx-auto flex min-h-full w-full max-w-6xl flex-col gap-5",
                      activeSession.messages.length ? "justify-end" : "",
                    )}
                  >
                    {activeSession.messages.length ? (
                      activeSession.messages.map((message) => (
                        <MessageBubble
                          key={message.id}
                          message={message}
                          sessionId={activeSession.id}
                          onRecord={openVoiceResponse}
                          onRepeat={repeatSpeaking}
                          onContinue={openVoiceResponse}
                          isInteractive={!reviewCompleted && message.id === latestInteractiveAssistantMessage?.id}
                          onChoiceSelect={(choice) => void handleGuidedChoice(choice)}
                          choiceDisabled={isBusy || isCapturing}
                          onTextSelection={handleTextSelection}
                        />
                      ))
                    ) : (
                      <div className="flex flex-1 items-center justify-center px-6 py-10">
                        <div className="max-w-2xl text-center">
                          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                            {activeSession.lesson_detail?.title || modeLabel[activeSession.mode]}
                          </p>
                          <p className="mt-4 text-xl font-semibold tracking-tight text-foreground md:text-3xl">
                            {activeSession.mode === "review"
                              ? "Vamos revisar sua aula? Escolha como você quer praticar hoje:"
                              : activeSession.mode === "speaking"
                                ? "Vamos praticar uma conversa em inglês"
                                : "Vamos construir sua escrita em inglês"}
                          </p>
                          <p className="mt-3 hidden text-sm leading-6 text-muted-foreground md:block">
                            {activeSession.mode === "review"
                              ? "Peça correções, exercícios, revisão de vocabulário ou explicações de gramática com base no conteúdo já estudado."
                              : activeSession.mode === "speaking"
                                ? "Aprenda frases, pratique e converse. Você pode responder por voz ou por texto."
                                : "Escolha um cenário, seu nível e como quer praticar. Aprenda uma estrutura, veja um exemplo e escreva uma resposta por vez."}
                          </p>
                        </div>
                      </div>
                    )}
                    {activeMode === "review" && !guidedState?.enabled && !reviewCompleted && (
                      <div className="rounded-3xl border border-sky-200 bg-white p-4 sm:p-6">
                        {activeSession.messages.length > 0 && <p className="font-semibold">Vamos revisar sua aula? Escolha como você quer praticar hoje:</p>}
                        <GuidedChoices choices={reviewActivityChoices} layout="grid" disabled={isBusy} onSelect={(choice) => void handleGuidedChoice(choice)}
                          helperText="As atividades usam o conteúdo registrado da aula selecionada. Você também pode escrever uma dúvida abaixo." />
                      </div>
                    )}
                    {activeSession.review_report && <LessonReviewReportCard report={activeSession.review_report} />}
                  </div>
                </div>

                {translationPopover ? (
                  <div
                    data-translation-popover="true"
                    data-testid="translation-popover"
                    className="pointer-events-none fixed z-50 w-[min(calc(100vw_-_1.5rem),22rem)]"
                    style={{
                      top: translationPopover.top,
                      left: translationPopover.left,
                    }}
                  >
                    <div className="pointer-events-auto overflow-hidden rounded-[24px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(241,245,249,0.96))] shadow-[0_28px_60px_-34px_rgba(15,23,42,0.48)] ring-1 ring-slate-900/5 backdrop-blur">
                      <div className="flex items-center justify-between gap-3 border-b border-slate-200/70 px-4 py-3">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-sky-700">Tradução</p>
                          <p className="mt-1 text-xs text-muted-foreground">Trecho selecionado</p>
                        </div>
                        {translationPopover.status === "loading" ? (
                          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                        ) : null}
                      </div>
                      <div className="space-y-3 px-4 py-4">
                        <p className="line-clamp-3 text-xs leading-5 text-slate-500">“{translationPopover.text}”</p>
                        <div className="rounded-[20px] bg-white/85 px-4 py-3 text-sm font-medium leading-6 text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
                          {translationPopover.status === "ready"
                            ? translationPopover.translation
                            : translationPopover.status === "error"
                              ? "Nao foi possivel traduzir esse trecho agora."
                              : "Traduzindo..."}
                        </div>
                      </div>
                      <div className="border-t border-slate-200/70 px-4 py-3">
                        <button
                          type="button"
                          onClick={() => {
                            openQuickCardDialog({
                              front: translationPopover.text,
                              back: translationPopover.status === "ready" ? translationPopover.translation : "",
                            });
                            setTranslationPopover(null);
                          }}
                          disabled={translationPopover.status === "loading"}
                          className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <BookPlus className="h-3.5 w-3.5" />
                          Salvar como card
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                <QuickAddVocabularyCardDialog
                  open={isQuickCardDialogOpen}
                  onOpenChange={setIsQuickCardDialogOpen}
                  initialFront={quickCardDraft.front}
                  initialBack={quickCardDraft.back}
                  lessonId={activeSession?.lesson_detail?.id}
                  sourceTag="Praticar com IA"
                  onCreated={() => {
                    setQuickCardDraft({ front: "", back: "" });
                    setTranslationPopover(null);
                  }}
                />

                <footer className="border-t border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.62),rgba(255,255,255,0.97))] px-4 py-3 backdrop-blur">
                  <div className="mx-auto w-full max-w-6xl space-y-3">
                    {activeMode === "speaking" && ["B2", "C1", "C2"].includes(guidedState?.level || "") ? <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      Idioma do feedback
                      <select aria-label="Idioma do feedback" value={feedbackLanguage} onChange={(event) => setFeedbackLanguage(event.target.value)} className="rounded-lg border border-border bg-background p-2">
                        <option value="pt-BR">Português</option><option value="en">English</option>
                      </select>
                    </label> : null}
                    {retryPractice ? <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                      <p className="text-xs font-semibold">{retryPractice.chunkIndex === undefined ? "Repita a frase" : `Repita o trecho ${retryPractice.chunkIndex + 1}`}</p>
                      <p lang="en" className="mt-1 break-words text-sm">{retryPractice.target}</p>
                      <Button type="button" size="sm" variant="ghost" disabled={isBusy || isCapturing} onClick={openVoiceResponse}>Voltar à conversa</Button>
                    </div> : null}
                    {canUseAudioInput && ((oralResponse && !useText) || showRecorder || recordingState !== "idle") ? (
                      <div ref={recorderContainerRef}><MicRecorder
                        key={`${activeSession.id}:${latestInteractiveAssistantMessage?.metadata?.speaking_prompt_id || guidedState?.current_task || "voice"}:${retryPractice?.feedbackId || "conversation"}:${retryPractice?.chunkIndex ?? "full"}`}
                        state={recordingState}
                        onStateChange={setRecordingState}
                        onRecordingComplete={uploadAudio}
                        maxDurationSeconds={activeMode === "review" ? 120 : undefined}
                        disabled={!activeSession || isBusy || reviewCompleted}
                        errorMessage={audioError}
                        onUseText={openTextResponse}
                        description={activeMode === "review" ? "Grave uma resposta de até dois minutos ou responda por texto." : undefined}
                      /></div>
                    ) : null}

                    {latestInteractiveAssistantMessage?.metadata?.helper_text &&
                    !(latestInteractiveAssistantMessage.metadata.choices?.length ?? 0) ? (
                      <div className="rounded-2xl border border-slate-200/80 bg-white/85 px-4 py-3 text-sm leading-6 text-muted-foreground">
                        {latestInteractiveAssistantMessage.metadata.helper_text}
                      </div>
                    ) : null}

                    {showTextInput ? <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
                      {oralResponse ? <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-muted-foreground">Resposta por texto</p>
                        {!recordingSupportError() ? <Button type="button" size="sm" variant="ghost" onClick={openVoiceResponse}>Usar microfone</Button> : null}
                      </div> : null}
                      <div className="flex items-end gap-3">
                        {canUseAudioInput && activeMode === "review" ? (
                          <button
                            type="button"
                            onClick={() => setShowRecorder((current) => !current)}
                            disabled={!activeSession || isBusy || reviewCompleted}
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
                            ref={textInputRef}
                            aria-label="Sua resposta por texto"
                            value={input}
                            onChange={(event) => setInput(event.target.value)}
                            onKeyDown={handleComposerKeyDown}
                            placeholder={reviewCompleted ? "Revisão finalizada. Inicie uma nova revisão para praticar mais." : composerPlaceholder}
                            disabled={!activeSession || isBusy || isCapturing || reviewCompleted}
                            rows={1}
                            className="max-h-32 min-h-[48px] flex-1 resize-none bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => void sendText()}
                          disabled={!activeSession || !input.trim() || isBusy || isCapturing || reviewCompleted}
                          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white transition hover:opacity-90 disabled:opacity-50"
                          aria-label="Enviar mensagem"
                        >
                          {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                        </button>
                      </div>
                    </div> : null}
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
                    onClick={() => navigate(APP_PATHS.aiPractice)}
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
                      ? "Abra uma conversa pelo histórico na sidebar ou inicie uma nova prática escolhendo o modo primeiro."
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
    </DashboardLayout>
  );
};

export default AssistenteIA;
