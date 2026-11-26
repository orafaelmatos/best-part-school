import AIContentReportButton from "@/components/AIContentReportButton";
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
import {
  Alert,
  Badge,
  Button,
  Card,
  ChatBubble,
  EmptyState,
  IconButton,
  IconTile,
  ScreenTitle,
  SkeletonCard,
  StudyBlock,
  TypingIndicator,
  cardVariants,
  inputClasses,
} from "@/components/student/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { audioRequestError, audioRequestId, recordingExtension, recordingSupportError } from "@/lib/speakingAudio";
import LessonReviewReportCard from "@/components/LessonReviewReportCard";
import { reviewActivityChoices, reviewActivityIcons } from "@/lib/lessonReview";
import { reviewAudioAsWav } from "@/lib/reviewAudio";
import MicRecorder, { RecordingState } from "@/components/MicRecorder";
import PronunciationFeedback, { SpeakingFeedback } from "@/components/PronunciationFeedback";
import QuickAddVocabularyCardDialog from "@/components/QuickAddVocabularyCardDialog";
import WritingFeedbackCard, { type WritingFeedback } from "@/components/WritingFeedbackCard";
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
  ArrowLeft,
  BookOpen,
  BookPlus,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  Info,
  Languages,
  Loader2,
  MessageSquare,
  Mic,
  Pencil,
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

const composerPlaceholderByMode: Record<PracticeMode, string> = {
  review: "Peça revisão de vocabulário, gramática ou exercícios desta aula.",
  speaking: "Responda em inglês ou envie um áudio para o próximo desafio guiado.",
  writing: "Escreva sua resposta em inglês para o próximo desafio guiado.",
};

const PRACTICE_MODES: PracticeMode[] = ["review", "speaking", "writing"];

// What the student does in each mode. Shown on the mode cards and on the start screen.
const modeCardMeta: Record<PracticeMode, { icon: LucideIcon; eyebrow: string; description: string; intro: string; startLabel: string }> = {
  review: {
    icon: BookOpen,
    eyebrow: "Com uma aula sua",
    description: "Escolha uma aula e faça atividades de gramática, vocabulário, listening e speaking sobre ela.",
    intro: "Peça correções, exercícios, revisão de vocabulário ou explicações de gramática com base no conteúdo já estudado.",
    startLabel: "Escolher aula",
  },
  speaking: {
    icon: Mic,
    eyebrow: "Conversa guiada",
    description: "Converse em inglês por voz ou por texto e receba correções de cada resposta.",
    intro: "Aprenda frases, pratique e converse. Você pode responder por voz ou por texto.",
    startLabel: "Iniciar speaking",
  },
  writing: {
    icon: Pencil,
    eyebrow: "Escrita passo a passo",
    description: "Aprenda uma estrutura, veja um exemplo e escreva frases com correções explicadas.",
    intro: "Escolha um cenário, seu nível e como quer praticar. Aprenda uma estrutura, veja um exemplo e escreva uma resposta por vez.",
    startLabel: "Iniciar writing",
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

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          cardVariants({ variant: recommended ? "highlight" : "default", padding: "md", interactive: true }),
          "flex w-full items-start gap-3 text-left",
        )}
      >
        <IconTile icon={meta.icon} tone="ai" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-h4 text-ink">{modeLabel[mode]}</span>
            {recommended ? <Badge tone="primary">Recomendado</Badge> : null}
          </span>
          <span className={cn("mt-0.5 block text-caption", recommended ? "text-ink" : "text-ink-secondary")}>{meta.eyebrow}</span>
          <span className={cn("mt-2 block text-body", recommended ? "text-ink" : "text-ink-secondary")}>{meta.description}</span>
        </span>
        <ChevronRight size={20} className="mt-2.5 shrink-0 text-ink-muted" aria-hidden="true" />
      </button>
    </li>
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
}) => {
  const words = lesson.learned_words_count ?? lesson.vocabulary_count ?? 0;
  const details = [
    `${words} ${words === 1 ? "palavra" : "palavras"}`,
    `${lesson.flashcard_count ?? 0} flashcards`,
    lesson.last_studied_at ? `Último estudo: ${formatShortDate(lesson.last_studied_at)}` : "Ainda não praticada com IA",
  ];
  const hasBadges = recommended || lesson.is_recent || lesson.is_recommended_review || lesson.has_pending_activities;
  // Highlight cards use a soft background: small text stays ink there for AA contrast.
  const secondaryText = recommended ? "text-ink" : "text-ink-secondary";

  return (
    <li className={cn(cardVariants({ variant: recommended ? "highlight" : "default", padding: "md" }), "flex flex-col gap-3")}>
      <div className="flex items-start gap-3">
        <IconTile icon={BookOpen} />
        <div className="min-w-0 flex-1">
          <p className={cn("text-caption", secondaryText)}>
            {formatLongDate(lesson.date)}{lesson.level ? ` · ${lesson.level}` : ""}
          </p>
          <h3 className="text-body font-semibold text-ink">{lesson.title}</h3>
          <p className={cn("text-caption", secondaryText)}>{lesson.teacher_name || "Professor não informado"}</p>
        </div>
      </div>

      {hasBadges ? (
        <div className="flex flex-wrap gap-1.5">
          {recommended ? <Badge tone="primary">Professor recomendou esta aula</Badge> : null}
          {lesson.is_recent ? <Badge tone="success">Mais recente</Badge> : null}
          {lesson.is_recommended_review ? <Badge tone="warning">Revisão recomendada</Badge> : null}
          {lesson.has_pending_activities ? <Badge tone="danger">Atividades pendentes</Badge> : null}
        </div>
      ) : null}

      {lesson.summary_short ? <p className={cn("line-clamp-3 text-body", secondaryText)}>{lesson.summary_short}</p> : null}

      <div className="flex flex-col gap-3 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className={cn("min-w-0 text-caption", secondaryText)}>{details.join(" · ")}</p>
        <Button type="button" size="sm" variant={recommended ? "primary" : "secondary"} loading={loading} onClick={onAction} className="w-full shrink-0 sm:w-auto">
          {actionLabel}
        </Button>
      </div>
    </li>
  );
};

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

  // Choice emoji from the API are not shown: the student app uses icons only.
  const renderChoices = (items: GuidedChoice[]) => isGrid ? (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map((choice) => {
        const Icon = choice.action_type === "review_activity" ? reviewActivityIcons[choice.value as keyof typeof reviewActivityIcons] : undefined;
        return (
          <button
            key={choice.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(choice)}
            className={cn(cardVariants({ padding: "none", interactive: true }), "flex min-h-16 w-full items-start gap-3 p-3 text-left disabled:pointer-events-none disabled:opacity-50")}
          >
            {Icon ? <IconTile icon={Icon} tone="ai" size="sm" /> : null}
            <span className="min-w-0 flex-1">
              <span className="block text-body font-medium text-ink">{choice.label}</span>
              {choice.description ? <span className="mt-0.5 block text-caption text-ink-secondary">{choice.description}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  ) : (
    <div className="flex flex-wrap gap-2">
      {items.map((choice) => (
        <Button
          key={choice.id}
          type="button"
          size="sm"
          variant={choice.variant === "primary" ? "primary" : choice.variant === "outline" ? "outline" : "secondary"}
          disabled={disabled}
          onClick={() => onSelect(choice)}
          className="h-auto whitespace-normal py-2 text-left"
        >
          {choice.label}
        </Button>
      ))}
    </div>
  );
  const primary = choices.filter((choice) => ["continue", "resume_simulation"].includes(choice.value));
  const extra = choices.filter((choice) => !primary.includes(choice));
  return (
    <div className="w-full space-y-3">
      {progressive ? <>
        {renderChoices(primary)}
        {extra.length ? <details className="group rounded-lg border border-line bg-surface">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-4 text-body font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
            Ajudas e opções
            <ChevronDown size={16} className="shrink-0 text-ink-muted transition-transform duration-150 ease-standard group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="px-4 pb-4 pt-1">{renderChoices(extra)}</div>
        </details> : null}
      </> : renderChoices(choices)}
      {helperText ? <p className="text-caption text-ink-secondary">{helperText}</p> : null}
    </div>
  );
};

const GuidedSessionOverview = ({ state, mode }: { state: GuidedState; mode: PracticeMode }) => {
  return mode === "speaking" ? <SpeakingSessionOverview state={state} /> : null;
};

/** Small AI mark used above structured tutor content (activities, corrections, reports). */
const TutorLabel = ({ children = "Tutor de IA" }: { children?: React.ReactNode }) => (
  <p className="mb-2 flex items-center gap-1.5 text-label text-ai">
    <Sparkles size={14} aria-hidden="true" />
    {children}
  </p>
);

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
  const metadata = message.metadata;
  const speakerLabel =
    message.content_type === "audio"
      ? "Sua gravação"
      : isUser
        ? "Você"
        : message.content_type === "feedback"
          ? "Análise da IA"
          : "Tutor de IA";
  const isWriting = Boolean(metadata?.writing_activity || metadata?.writing_correction || metadata?.writing_report);
  const isStructured = !isUser && !message.audio_url && Boolean(
    isWriting || metadata?.speaking_report || metadata?.speaking_activity || metadata?.speaking_help || metadata?.speaking_turn,
  );
  const translatableProps = !isUser && onTextSelection ? {
    onMouseUp: (event: React.MouseEvent<HTMLDivElement>) => onTextSelection(event.currentTarget),
    onTouchEnd: (event: React.TouchEvent<HTMLDivElement>) => onTextSelection(event.currentTarget),
  } : {};

  const textContent = (
    <div
      data-writing-focus={isWriting ? true : undefined}
      className={isWriting ? "outline-none" : undefined}
      data-translatable-message={!isUser || undefined}
      {...translatableProps}
    >
      {metadata?.writing_report ? <WritingReportCard report={metadata.writing_report} />
        : metadata?.writing_activity || metadata?.writing_correction ? <div className="space-y-5">
          {metadata.writing_correction ? <WritingCorrectionCard correction={metadata.writing_correction} /> : null}
          {metadata.writing_help ? <WritingHelpCard help={metadata.writing_help} /> : null}
          {metadata.writing_activity ? <WritingActivityCard activity={metadata.writing_activity} /> : <p className="whitespace-pre-line text-body-lg text-ink">{message.text}</p>}
        </div> : metadata?.speaking_report ? <div className="space-y-4">
          {!message.feedback_detail && metadata.speaking_turn?.feedback ? <p className="whitespace-pre-line text-body-lg text-ink">{metadata.speaking_turn.feedback}</p> : null}
          {message.feedback_detail ? <details className="group rounded-lg border border-line bg-surface">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-4 text-body font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
              Ver resumo da situação
              <ChevronDown size={16} className="shrink-0 text-ink-muted transition-transform duration-150 ease-standard group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="px-4 pb-4 pt-1"><SpeakingReportCard report={metadata.speaking_report} /></div>
          </details>
            : <SpeakingReportCard report={metadata.speaking_report} />}
        </div> : metadata?.speaking_activity ? (
          <SpeakingVocabularyActivity activity={metadata.speaking_activity}
            sessionId={sessionId} messageId={message.id} instruction={message.text}
            interactive={isInteractive} disabled={choiceDisabled} onRecord={onRecord} />
        ) : metadata?.speaking_help ? <SpeakingHelpCard help={metadata.speaking_help} />
          : metadata?.speaking_turn ? <SpeakingTurnCard content={message.feedback_detail ? { ...metadata.speaking_turn, feedback: "" } : metadata.speaking_turn}
            phase={metadata.pedagogical_phase} level={metadata.speaking_level}
            sessionId={sessionId} messageId={message.id} assessmentSource={metadata.assessment_source} />
            : <p data-speaking-focus={metadata?.speaking_simulation ? true : undefined} className="whitespace-pre-line">{message.text}</p>}
    </div>
  );

  const audioContent = message.audio_url ? (
    <div className="space-y-3">
      <AudioPlayer src={absoluteMediaUrl(message.audio_url)} compact />
      {message.text ? (
        <div data-translatable-message={!isUser || undefined} {...translatableProps}>
          <p className={cn("text-label", isUser ? "text-primary-foreground" : "text-ink-secondary")}>Transcrição</p>
          <p className="mt-1 whitespace-pre-line">{message.text}</p>
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-1.5", isUser ? "items-end" : "items-start")}
      data-speaking-prompt={metadata?.speaking_prompt_id || message.id}
      data-writing-current={isInteractive && isWriting ? "true" : undefined}
      data-speaking-current={isInteractive && (message.feedback_detail || metadata?.speaking_turn || metadata?.speaking_activity || metadata?.speaking_help || metadata?.speaking_simulation) ? "true" : undefined}>
      {message.feedback_detail ? <div className="w-full min-w-0"><PronunciationFeedback feedback={message.feedback_detail}
        disabled={choiceDisabled} onRepeat={isInteractive ? onRepeat : undefined} onContinue={isInteractive ? onContinue : undefined}
        onNextSituation={isInteractive && onChoiceSelect && metadata?.choices?.some((choice) => choice.value === "new_challenge")
          ? () => onChoiceSelect(metadata!.choices!.find((choice) => choice.value === "new_challenge")!) : undefined} /></div> : null}

      {isStructured ? (
        <div className="w-full min-w-0">
          <TutorLabel />
          {textContent}
        </div>
      ) : (
        <ChatBubble from={isUser ? "student" : "ai"} label={speakerLabel} className={cn(message.pending && "opacity-80")}>
          {metadata?.review_audio_url ? (
            <div className="mb-3 space-y-2">
              <p className="text-body text-ink-secondary">Ouça o áudio gerado por IA e responda à pergunta abaixo.</p>
              <AudioPlayer src={absoluteMediaUrl(metadata.review_audio_url)} compact />
            </div>
          ) : null}
          {audioContent ?? textContent}
        </ChatBubble>
      )}

      <div className={cn("flex flex-wrap items-center gap-x-2 text-caption text-ink-secondary", isUser ? "justify-end pr-1" : "pl-9")}>
        <span>{message.pending ? "Enviando…" : formatTime(message.created_at)}</span>
        {audioMeta?.duration_seconds ? <span>· {formatDuration(audioMeta.duration_seconds)}</span> : null}
        {message.audio_url && audioMeta?.created_at ? <span>· Áudio enviado em {formatDateTime(audioMeta.created_at)}</span> : null}
        {!isUser && !message.pending ? <AIContentReportButton messageId={message.id} /> : null}
      </div>

      {isInteractive && metadata?.speaking_simulation?.question ? (
        <div className="w-full min-w-0">
          <SpeakingSimulationReplay key={message.id} sessionId={sessionId} messageId={message.id}
            question={metadata.speaking_simulation.question} />
        </div>
      ) : null}
      {message.writing_feedback_detail ? <div className="w-full min-w-0"><WritingFeedbackCard feedback={message.writing_feedback_detail} /></div> : null}
      {isInteractive && metadata?.guided && metadata?.choices?.length && onChoiceSelect ? (
        <GuidedChoices
          choices={metadata.choices}
          layout={metadata.choice_layout}
          helperText={metadata.helper_text}
          disabled={choiceDisabled}
          onSelect={onChoiceSelect}
          progressive={Boolean(metadata?.speaking_simulation)}
        />
      ) : null}
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
    startTransition(() => { void navigate(buildSessionPath(sessionId)); });
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
      startTransition(() => { void navigate(buildSessionPath(createdSession.id)); });
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
        startTransition(() => { void navigate(buildSessionPath(nextSession.id)); });
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

  const isRecommendedMode = (mode: PracticeMode) => recommendation?.mode === mode;
  const recommendingTeacher = recommendation?.teacher_name || "seu professor";

  const renderModePicker = () => (
    <div className="space-y-6">
      <ScreenTitle title="Como quer praticar?" description="Escolha um modo e pratique inglês com o tutor de IA." />
      {recommendation?.mode ? (
        <Alert tone="info" title={`Recomendação de ${recommendingTeacher}: ${modeLabel[recommendation.mode]}`}>
          {recommendation.note || undefined}
        </Alert>
      ) : null}
      <ul className="grid gap-3" aria-label="Modos de prática">
        {PRACTICE_MODES.map((mode) => (
          <ModeCard key={mode} mode={mode} recommended={isRecommendedMode(mode)} onClick={() => handleSelectMode(mode)} />
        ))}
      </ul>
    </div>
  );

  const renderLessonPicker = () => (
    <div className="space-y-6">
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-3 mb-2"
          onClick={pickerMode === "change" ? closeLessonPicker : openNewConversationPicker}
        >
          <ArrowLeft aria-hidden="true" />
          {pickerMode === "change" ? "Voltar à conversa" : "Outros modos"}
        </Button>
        <ScreenTitle
          title={pickerMode === "change" ? "Trocar a aula" : "Qual aula você quer revisar?"}
          description="O tutor usa o conteúdo registrado da aula nas atividades."
        />
      </div>
      {lessonsQuery.isLoading ? (
        <div className="grid gap-3">
          <SkeletonCard label="Carregando aulas" lines={3} />
          <SkeletonCard label="Carregando aulas" lines={3} />
        </div>
      ) : lessonsQuery.isError ? (
        <Alert
          tone="danger"
          role="alert"
          title="Não carregamos suas aulas."
          action={<Button type="button" size="sm" variant="outline" onClick={() => void lessonsQuery.refetch()}>Tentar novamente</Button>}
        >
          Confira sua conexão e tente novamente.
        </Alert>
      ) : filteredLessons.length === 0 ? (
        <Card padding="none">
          <EmptyState
            compact
            icon={BookOpen}
            title="Nenhuma aula para revisar ainda"
            description="Quando sua aula for registrada, ela aparece aqui. Enquanto isso, pratique speaking ou writing."
            action={pickerMode === "change" ? undefined : <Button type="button" variant="secondary" onClick={openNewConversationPicker}>Ver outros modos</Button>}
          />
        </Card>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2" aria-label="Aulas disponíveis">
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
        </ul>
      )}
    </div>
  );

  const renderModeStart = (mode: PracticeMode) => {
    const meta = modeCardMeta[mode];
    return (
      <div className="space-y-4">
        <Button type="button" variant="ghost" size="sm" className="-ml-3" onClick={openNewConversationPicker}>
          <ArrowLeft aria-hidden="true" />
          Outros modos
        </Button>
        <Card className="space-y-5">
          <div className="flex items-start gap-4">
            <IconTile icon={meta.icon} tone="ai" size="lg" />
            <div className="min-w-0">
              <p className="text-caption text-ink-secondary">{meta.eyebrow}</p>
              <h1 className="text-h2 text-ink">{modeLabel[mode]}</h1>
              {isRecommendedMode(mode) ? <Badge tone="primary" className="mt-2">Recomendado por {recommendingTeacher}</Badge> : null}
            </div>
          </div>
          <p className="text-body-lg text-ink-secondary">{meta.intro}</p>
          <Button
            type="button"
            size="lg"
            fullWidth
            loading={creatingLessonId === mode}
            onClick={() => void handleCreateSession(mode, isRecommendedMode(mode) ? recommendation?.lesson || undefined : undefined)}
          >
            {meta.startLabel}
          </Button>
        </Card>
      </div>
    );
  };

  const renderPicker = () =>
    !selectedPracticeMode && pickerMode !== "change" ? renderModePicker()
      : pickerMode === "change" || selectedPracticeMode === "review" ? renderLessonPicker()
        : selectedPracticeMode ? renderModeStart(selectedPracticeMode)
          : null;

  const renderConversation = (session: SessionDetail) => (
    <>
      <header className="shrink-0 space-y-3 border-b border-line pb-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <Badge tone="ai" icon={<Sparkles aria-hidden="true" />}>{modeLabel[session.mode]}</Badge>
              {session.lesson_detail ? (
                <Badge className="min-w-0 max-w-full"><span className="min-w-0 truncate">Aula atual: {session.lesson_detail.title}</span></Badge>
              ) : null}
            </div>

            {isRenaming ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  aria-label="Nome da conversa"
                  autoFocus
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleRename();
                    }
                  }}
                  className={cn(inputClasses, "min-w-0 flex-1 basis-56")}
                />
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={() => void handleRename()}>Salvar</Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setIsRenaming(false);
                      setRenameValue(session.title || "");
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <h1 className="mt-1.5 truncate text-h4 text-ink">{session.title}</h1>
                <p className="hidden text-caption text-ink-secondary md:block">
                  {session.message_count} mensagens · última interação em {formatDateTime(session.last_interaction_at)}
                </p>
              </>
            )}

            {activeMode === "review" && guidedState?.review_activity && !reviewCompleted && (
              <p className="mt-1 text-caption text-ink-secondary" aria-live="polite">
                {guidedState.review_activity_label} · {guidedState.correct_count || 0} acertos · {guidedState.incorrect_count || 0} erros · Dificuldade {guidedState.difficulty || "1"}/5
              </p>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton variant="ghost" aria-label="Opções da conversa" icon={<Ellipsis aria-hidden="true" />} className="-mr-2 size-11 shrink-0 text-ink-secondary" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-64 rounded-lg border-line bg-surface p-1 text-ink shadow-overlay"
              onCloseAutoFocus={(event) => event.preventDefault()}
            >
              {session.mode === "review" ? (
                <DropdownMenuItem className="min-h-11 gap-2 rounded-md text-body" onSelect={() => setIsChangingLesson(true)}>
                  <BookOpen size={16} aria-hidden="true" />
                  Trocar aula
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                className="min-h-11 gap-2 rounded-md text-body"
                onSelect={() =>
                  openQuickCardDialog({
                    front: translationPopover?.text || "",
                    back: translationPopover?.status === "ready" ? translationPopover.translation : "",
                  })
                }
              >
                <BookPlus size={16} aria-hidden="true" />
                Card: adicionar nova palavra
              </DropdownMenuItem>
              {!isRenaming ? (
                <DropdownMenuItem className="min-h-11 gap-2 rounded-md text-body" onSelect={() => setIsRenaming(true)}>
                  <Pencil size={16} aria-hidden="true" />
                  Renomear
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator className="bg-line" />
              <DropdownMenuItem className="min-h-11 gap-2 rounded-md text-body text-danger focus:text-danger" onSelect={() => void handleDelete()}>
                <Trash2 size={16} aria-hidden="true" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {guidedState?.enabled && activeMode && activeMode !== "review" ? (
          <GuidedSessionOverview state={guidedState} mode={activeMode} />
        ) : null}

        {activeMode === "review" ? (
          <div className="flex flex-wrap gap-2">
            {reviewCompleted ? (
              <Button type="button" size="sm" onClick={() => void handleCreateSession("review", session.lesson || undefined)} disabled={isBusy || Boolean(creatingLessonId)}>
                Nova revisão
              </Button>
            ) : (
              <>
                {guidedState?.review_activity ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isBusy}
                    onClick={() => void handleGuidedChoice({ id: "menu", action_type: "review_control", value: "menu", label: "Escolher prática" })}
                  >
                    Escolher prática
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={isBusy || recordingState === "recording" || recordingState === "paused"}
                  onClick={() => void finishReview()}
                >
                  {isFinishing ? "Salvando relatório…" : "Finalizar revisão"}
                </Button>
              </>
            )}
          </div>
        ) : null}
      </header>

      <div ref={messageListRef} role="log" aria-label="Conversa com o tutor de IA" aria-live="polite" aria-relevant="additions text" className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 py-4">
        <div className={cn("flex min-h-full w-full flex-col gap-5", session.messages.length ? "justify-end" : "")}>
          {session.messages.length ? (
            session.messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                sessionId={session.id}
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
            <div className="flex flex-1 flex-col items-center justify-center px-2 py-8 text-center">
              <IconTile icon={Sparkles} tone="ai" size="lg" />
              <p className="mt-4 text-caption text-ink-secondary">{session.lesson_detail?.title || modeLabel[session.mode]}</p>
              <p className="mt-1 max-w-md text-h3 text-ink">
                {session.mode === "review"
                  ? "Vamos revisar sua aula? Escolha como você quer praticar hoje:"
                  : session.mode === "speaking"
                    ? "Vamos praticar uma conversa em inglês"
                    : "Vamos construir sua escrita em inglês"}
              </p>
              <p className="mt-2 max-w-md text-body text-ink-secondary">
                {session.mode === "review" || session.mode === "speaking" || session.mode === "writing"
                  ? modeCardMeta[session.mode].intro
                  : null}
              </p>
            </div>
          )}
          {activeMode === "review" && !guidedState?.enabled && !reviewCompleted && (
            <div className="w-full space-y-3">
              {session.messages.length > 0 && <p className="text-body-lg font-medium text-ink">Vamos revisar sua aula? Escolha como você quer praticar hoje:</p>}
              <GuidedChoices choices={reviewActivityChoices} layout="grid" disabled={isBusy} onSelect={(choice) => void handleGuidedChoice(choice)}
                helperText="As atividades usam o conteúdo registrado da aula selecionada. Você também pode escrever uma dúvida abaixo." />
            </div>
          )}
          {isSending && recordingState === "idle" ? <div className="pl-9"><TypingIndicator /></div> : null}
          {session.review_report && <LessonReviewReportCard report={session.review_report} />}
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
          <div className="pointer-events-auto space-y-3 rounded-xl border border-line bg-surface p-4 text-ink shadow-overlay">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 text-label text-ai">
                <Languages size={14} aria-hidden="true" />
                Tradução do trecho
              </p>
              {translationPopover.status === "loading" ? <Loader2 size={16} className="animate-spin text-ink-muted" aria-hidden="true" /> : null}
            </div>
            <p lang="en" className="line-clamp-3 text-body text-ink-secondary">“{translationPopover.text}”</p>
            <p className="text-body-lg font-medium text-ink" aria-live="polite">
              {translationPopover.status === "ready"
                ? translationPopover.translation
                : translationPopover.status === "error"
                  ? "Não foi possível traduzir esse trecho agora."
                  : "Traduzindo…"}
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                openQuickCardDialog({
                  front: translationPopover.text,
                  back: translationPopover.status === "ready" ? translationPopover.translation : "",
                });
                setTranslationPopover(null);
              }}
              disabled={translationPopover.status === "loading"}
            >
              <BookPlus aria-hidden="true" />
              Salvar como card
            </Button>
          </div>
        </div>
      ) : null}

      <QuickAddVocabularyCardDialog
        open={isQuickCardDialogOpen}
        onOpenChange={setIsQuickCardDialogOpen}
        initialFront={quickCardDraft.front}
        initialBack={quickCardDraft.back}
        lessonId={session.lesson_detail?.id}
        sourceTag="Praticar com IA"
        onCreated={() => {
          setQuickCardDraft({ front: "", back: "" });
          setTranslationPopover(null);
        }}
      />

      <footer className="shrink-0 space-y-3 border-t border-line pt-3">
        {activeMode === "speaking" && ["B2", "C1", "C2"].includes(guidedState?.level || "") ? <label className="flex flex-wrap items-center gap-2 text-body text-ink-secondary">
          Idioma do feedback
          <select aria-label="Idioma do feedback" value={feedbackLanguage} onChange={(event) => setFeedbackLanguage(event.target.value)} className={cn(inputClasses, "min-h-11 w-auto")}>
            <option value="pt-BR">Português</option><option value="en">English</option>
          </select>
        </label> : null}
        {retryPractice ? (
          <StudyBlock kind="example" title={retryPractice.chunkIndex === undefined ? "Repita a frase" : `Repita o trecho ${retryPractice.chunkIndex + 1}`}>
            <p lang="en" className="break-words">{retryPractice.target}</p>
            <Button type="button" size="sm" variant="ghost" className="-ml-4 mt-1" disabled={isBusy || isCapturing} onClick={openVoiceResponse}>Voltar à conversa</Button>
          </StudyBlock>
        ) : null}
        {canUseAudioInput && ((oralResponse && !useText) || showRecorder || recordingState !== "idle") ? (
          <div ref={recorderContainerRef}><MicRecorder
            key={`${session.id}:${latestInteractiveAssistantMessage?.metadata?.speaking_prompt_id || guidedState?.current_task || "voice"}:${retryPractice?.feedbackId || "conversation"}:${retryPractice?.chunkIndex ?? "full"}`}
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
          <p className="flex gap-2 text-body text-ink-secondary">
            <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            {latestInteractiveAssistantMessage.metadata.helper_text}
          </p>
        ) : null}

        {showTextInput ? <div className="space-y-2">
          {oralResponse ? <div className="flex items-center justify-between gap-2">
            <p className="text-label text-ink-secondary">Resposta por texto</p>
            {!recordingSupportError() ? <Button type="button" size="sm" variant="ghost" className="-mr-3" onClick={openVoiceResponse}><Mic aria-hidden="true" />Usar microfone</Button> : null}
          </div> : null}
          <div className="flex min-w-0 items-end gap-2">
            {canUseAudioInput && activeMode === "review" ? (
              <IconButton
                variant={showRecorder || recordingState !== "idle" ? "secondary" : "outline"}
                aria-label="Abrir microfone"
                aria-pressed={showRecorder || recordingState !== "idle"}
                icon={<Mic aria-hidden="true" />}
                onClick={() => setShowRecorder((current) => !current)}
                disabled={!activeSession || isBusy || reviewCompleted}
              />
            ) : null}

            <div className="student-composer-field flex min-w-0 flex-1 items-center rounded-md border border-line bg-surface">
              <textarea
                ref={textInputRef}
                aria-label="Sua resposta por texto"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder={reviewCompleted ? "Revisão finalizada. Inicie uma nova revisão para praticar mais." : composerPlaceholder}
                disabled={!activeSession || isBusy || isCapturing || reviewCompleted}
                rows={1}
                className="max-h-32 min-h-12 w-full min-w-0 flex-1 resize-none rounded-md bg-transparent px-4 py-3 text-body-lg text-ink outline-none placeholder:text-ink-muted disabled:text-ink-muted"
              />
            </div>

            <IconButton
              variant="primary"
              aria-label="Enviar mensagem"
              icon={isSending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
              onClick={() => void sendText()}
              disabled={!activeSession || !input.trim() || isBusy || isCapturing || reviewCompleted}
            />
          </div>
        </div> : null}
      </footer>
    </>
  );

  const content = isPickerVisible ? (
    isConversationPage ? <div className="min-h-0 flex-1 overflow-y-auto">{renderPicker()}</div> : renderPicker()
  ) : activeSession ? (
    renderConversation(activeSession)
  ) : selectedSessionId && sessionDetailQuery.isLoading ? (
    <div className="space-y-3 py-4">
      <SkeletonCard label="Carregando conversa" lines={2} />
      <SkeletonCard label="Carregando conversa" lines={3} className="ml-auto w-4/5" />
    </div>
  ) : selectedSessionId && sessionDetailQuery.isError ? (
    <div className="flex flex-1 items-center justify-center">
      <EmptyState
        icon={MessageSquare}
        title="Conversa não encontrada"
        description="Essa conversa não está mais disponível. Escolha outra no histórico ou comece uma nova."
        action={<Button type="button" onClick={() => navigate(APP_PATHS.aiPractice)}>Voltar para o assistente</Button>}
      />
    </div>
  ) : (
    <div className="flex flex-1 items-center justify-center">
      <EmptyState
        icon={Sparkles}
        title={hasSavedSessions ? "Escolha uma conversa ou crie uma nova" : "Escolha um modo para começar"}
        description={hasSavedSessions
          ? "Abra uma conversa pelo histórico ou escolha um modo para começar uma nova prática."
          : "Comece por revisão de aula, speaking ou writing. O fluxo muda conforme o tipo de prática que você quer fazer."}
        action={
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button type="button" onClick={openNewConversationPicker}>
              <BookOpen aria-hidden="true" />
              Escolher modo
            </Button>
            {sessionsQuery.data?.[0] ? (
              <Button type="button" variant="outline" onClick={() => handleSelectSession(sessionsQuery.data[0].id)}>
                Abrir conversa mais recente
              </Button>
            ) : null}
          </div>
        }
      />
    </div>
  );

  return (
    <DashboardLayout>
      {isConversationPage ? (
        // .student-workspace (student.css) sizes the chat between the shell header and the bottom navigation.
        <div className="student-workspace flex min-h-0 flex-col">{content}</div>
      ) : content}
    </DashboardLayout>
  );
};

export default AssistenteIA;
