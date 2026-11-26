import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import HomeworkQuestionMedia from "@/components/HomeworkQuestionMedia";
import { api } from "@/lib/api";
import { APP_PATHS } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { iconStroke } from "@/design-system/tokens";
import {
  Alert,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ProgressBar,
  ScreenTitle,
  SkeletonCard,
  StudyBlock,
  buttonVariants,
  cardVariants,
  inputClasses,
  type BadgeTone,
} from "@/components/student/ui";
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  Clock,
  Loader2,
  PencilLine,
  Send,
  Sparkles,
  Tag,
  type LucideIcon,
} from "lucide-react";

type QuestionType = "open_text" | "multiple_choice";
type ApiHomeworkStatus = "draft" | "pending" | "in_progress" | "sent" | "corrected";
type UiHomeworkStatus = "pending" | "in_progress" | "sent" | "late" | "corrected";

type HomeworkQuestion = {
  id: string;
  type: QuestionType;
  prompt: string;
  image_url?: string | null;
  audio_url?: string | null;
  audio_transcript?: string;
  options: string[];
  order: number;
  second_chance_mode?: "none" | "reserve";
  has_reserve_question?: boolean;
};

type SecondChanceQuestion = {
  type: QuestionType;
  prompt: string;
  options: string[];
  correct_option_index?: number | null;
  reference_answer?: string;
  explanation?: string;
};

type HomeworkAnswer = {
  id?: string;
  question: string;
  answer_text?: string;
  selected_option_index?: number | null;
  is_correct?: boolean | null;
  auto_feedback?: string;
  auto_explanation?: string;
  expected_answer?: string;
  second_chance_question?: SecondChanceQuestion | null;
  second_chance_answer_text?: string;
  second_chance_selected_option_index?: number | null;
  second_chance_is_correct?: boolean | null;
  second_chance_feedback?: string;
  second_chance_explanation?: string;
  second_chance_expected_answer?: string;
  teacher_feedback?: string;
  answered_at?: string | null;
  second_chance_answered_at?: string | null;
  is_complete?: boolean;
};

type HomeworkReport = {
  summary: string;
  accuracy: number;
  total_questions: number;
  first_try_correct: number;
  second_chance_correct: number;
  incorrect_after_second_chance: number;
  attention_points: string[];
};

type HomeworkItem = {
  id: string;
  title: string;
  description?: string;
  classification?: string;
  status: ApiHomeworkStatus;
  due_date?: string | null;
  auto_correction_enabled: boolean;
  teacher_feedback?: string;
  teacher_name?: string;
  lesson_title?: string;
  student_report?: HomeworkReport | null;
  questions: HomeworkQuestion[];
  answers?: HomeworkAnswer[];
};

type DraftAnswer = {
  answer_text?: string;
  selected_option_index?: number | null;
};

type DraftSaveState = "idle" | "saving" | "saved" | "error";

const statusCopy: Record<UiHomeworkStatus, string> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  sent: "Enviada",
  late: "Atrasada",
  corrected: "Corrigida",
};

// Status is always shown with text and icon, never color alone.
const statusStyles: Record<UiHomeworkStatus, { tone: BadgeTone; icon: LucideIcon }> = {
  pending: { tone: "warning", icon: Clock },
  in_progress: { tone: "primary", icon: PencilLine },
  sent: { tone: "neutral", icon: Send },
  late: { tone: "danger", icon: AlertCircle },
  corrected: { tone: "success", icon: CheckCircle2 },
};

const actionCopy: Record<UiHomeworkStatus, string> = {
  pending: "Começar atividade",
  late: "Começar atividade",
  in_progress: "Continuar atividade",
  sent: "Ver atividade",
  corrected: "Ver correção",
};

const StatusBadge = ({ status }: { status: UiHomeworkStatus }) => {
  const { tone, icon: Icon } = statusStyles[status];
  return <Badge tone={tone} icon={<Icon strokeWidth={iconStroke} aria-hidden="true" />}>{statusCopy[status]}</Badge>;
};

const AutoCorrectionBadge = () => (
  <Badge tone="ai" icon={<Sparkles strokeWidth={iconStroke} aria-hidden="true" />}>Correção automática</Badge>
);

const normalizeList = (data: unknown) => Array.isArray(data) ? data : ((data as { results?: unknown[] })?.results || []);

const hasOwnDraft = (answers: Record<string, DraftAnswer>, questionId: string) =>
  Object.prototype.hasOwnProperty.call(answers, questionId);

const getPrimaryDraftAnswers = (homework: HomeworkItem): Record<string, DraftAnswer> => {
  const drafts: Record<string, DraftAnswer> = {};
  homework.questions.forEach((question) => {
    const answer = homework.answers?.find((item) => item.question === question.id);
    if (!answer) return;
    if (!homework.auto_correction_enabled || !answer.answered_at) {
      drafts[question.id] = {
        answer_text: answer.answer_text || "",
        selected_option_index: answer.selected_option_index ?? null,
      };
    }
  });
  return drafts;
};

const getSecondChanceDraftAnswers = (homework: HomeworkItem): Record<string, DraftAnswer> => {
  const drafts: Record<string, DraftAnswer> = {};
  homework.questions.forEach((question) => {
    const answer = homework.answers?.find((item) => item.question === question.id);
    if (!answer?.second_chance_question || answer.second_chance_answered_at) return;
    drafts[question.id] = {
      answer_text: answer.second_chance_answer_text || "",
      selected_option_index: answer.second_chance_selected_option_index ?? null,
    };
  });
  return drafts;
};

const getHomeworkStatus = (homework: HomeworkItem): UiHomeworkStatus => {
  if (homework.status === "corrected") return "corrected";
  if (homework.status === "sent") return "sent";
  if (homework.status === "in_progress") return "in_progress";
  if (homework.due_date && new Date(homework.due_date).getTime() < Date.now()) return "late";
  return "pending";
};

const formatDate = (value?: string | null) => {
  if (!value) return "Sem prazo";
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
};

const isDueSoon = (value?: string | null) => {
  if (!value) return false;
  const diff = new Date(value).getTime() - Date.now();
  return diff > 0 && diff <= 1000 * 60 * 60 * 48;
};

/** Due date line. Warning tone only while the activity still needs an answer. */
const DueDate = ({ homework, status }: { homework: HomeworkItem; status: UiHomeworkStatus }) => {
  const actionable = status === "pending" || status === "in_progress";
  const dueSoon = actionable && isDueSoon(homework.due_date);
  const overdue = status === "late";
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 text-caption",
      overdue ? "font-medium text-danger" : dueSoon ? "font-medium text-warning" : "text-ink-secondary",
    )}>
      <CalendarClock size={16} strokeWidth={iconStroke} className="shrink-0" aria-hidden="true" />
      <span>
        {homework.due_date ? `Entrega: ${formatDate(homework.due_date)}` : formatDate(homework.due_date)}
        {dueSoon ? " · vence em breve" : overdue ? " · prazo encerrado" : ""}
      </span>
    </span>
  );
};

const Homework = () => {
  return (
    <DashboardLayout>
      <HomeworkLessons />
    </DashboardLayout>
  );
};

const HomeworkLessons = () => {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"all" | UiHomeworkStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedHomework, setSelectedHomework] = useState<HomeworkItem | null>(null);
  const [openingHomeworkId, setOpeningHomeworkId] = useState<string | null>(null);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, DraftAnswer>>({});
  const [secondChanceDrafts, setSecondChanceDrafts] = useState<Record<string, DraftAnswer>>({});
  const [expandedSecondChance, setExpandedSecondChance] = useState<Record<string, boolean>>({});
  const [draftSaveState, setDraftSaveState] = useState<DraftSaveState>("idle");
  const [openFailedHomework, setOpenFailedHomework] = useState<HomeworkItem | null>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const selectedHomeworkId = selectedHomework?.id;
  const previousHomeworkIdRef = useRef(selectedHomeworkId);

  // Opening or leaving an activity swaps the whole screen: start at the top and move focus to the title.
  useEffect(() => {
    if (previousHomeworkIdRef.current === selectedHomeworkId) return;
    previousHomeworkIdRef.current = selectedHomeworkId;
    window.scrollTo({ top: 0 });
    if (selectedHomeworkId) detailHeadingRef.current?.focus({ preventScroll: true });
  }, [selectedHomeworkId]);

  const { data: homeworkItems = [], isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["student-homework"],
    queryFn: async () => {
      const res = await api.get("/homework/?ordering=due_date");
      return normalizeList(res.data) as HomeworkItem[];
    },
  });

  const categories = useMemo(() => {
    const values = homeworkItems.map((item) => item.classification).filter(Boolean) as string[];
    return Array.from(new Set(values));
  }, [homeworkItems]);

  const pendingCount = homeworkItems.filter((item) => {
    const status = getHomeworkStatus(item);
    return status === "pending" || status === "in_progress";
  }).length;

  const filteredHomework = useMemo(() => {
    return homeworkItems
      .filter((item) => statusFilter === "all" || getHomeworkStatus(item) === statusFilter)
      .filter((item) => categoryFilter === "all" || item.classification === categoryFilter)
      .sort((a, b) => {
        const aDate = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER;
        const bDate = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER;
        return aDate - bDate;
      });
  }, [categoryFilter, homeworkItems, statusFilter]);

  const refreshHomeworkLists = async () => {
    await queryClient.invalidateQueries({ queryKey: ["student-homework"] });
  };

  const openHomework = async (homework: HomeworkItem) => {
    setOpeningHomeworkId(homework.id);
    setOpenFailedHomework(null);
    try {
      const { data } = await api.get(`/homework/${homework.id}/`);
      const detailedHomework = data as HomeworkItem;
      setSelectedHomework(detailedHomework);
      setDraftAnswers(getPrimaryDraftAnswers(detailedHomework));
      setSecondChanceDrafts(getSecondChanceDraftAnswers(detailedHomework));
      setExpandedSecondChance({});
      setDraftSaveState("idle");
    } catch {
      setOpenFailedHomework(homework);
    } finally {
      setOpeningHomeworkId(null);
    }
  };

  useEffect(() => {
    if (!selectedHomework || !["pending", "in_progress"].includes(selectedHomework.status)) {
      return;
    }

    const answersPayload = selectedHomework.questions
      .map((question) => {
        const answer = selectedHomework.answers?.find((item) => item.question === question.id);
        const primaryDraft = draftAnswers[question.id] || {};
        const secondChanceDraft = secondChanceDrafts[question.id] || {};
        const hasPrimaryDraft = !answer?.answered_at && hasOwnDraft(draftAnswers, question.id);
        const hasSecondChanceDraft = Boolean(
          answer?.second_chance_question &&
          !answer.second_chance_answered_at &&
          hasOwnDraft(secondChanceDrafts, question.id)
        );

        if (!hasPrimaryDraft && !hasSecondChanceDraft) {
          return null;
        }

        return {
          question: question.id,
          ...(hasPrimaryDraft ? {
            answer_text: primaryDraft.answer_text || "",
            selected_option_index: primaryDraft.selected_option_index ?? null,
          } : {}),
          ...(hasSecondChanceDraft ? {
            second_chance_answer_text: secondChanceDraft.answer_text || "",
            second_chance_selected_option_index: secondChanceDraft.selected_option_index ?? null,
          } : {}),
        };
      })
      .filter(Boolean);

    if (!answersPayload.length) {
      setDraftSaveState("idle");
      return;
    }

    const timeout = window.setTimeout(async () => {
      setDraftSaveState("saving");
      try {
        await api.post(`/homework/${selectedHomework.id}/save_draft_answers/`, { answers: answersPayload });
        setDraftSaveState("saved");
        await queryClient.invalidateQueries({ queryKey: ["student-homework"] });
      } catch {
        setDraftSaveState("error");
      }
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [draftAnswers, queryClient, secondChanceDrafts, selectedHomework]);

  const manualSubmitMutation = useMutation({
    mutationFn: async (homework: HomeworkItem) => {
      const payload = homework.questions.map((question) => ({
        question: question.id,
        answer_text: draftAnswers[question.id]?.answer_text || "",
        selected_option_index: draftAnswers[question.id]?.selected_option_index ?? null,
      }));
      const response = await api.post(`/homework/${homework.id}/submit_answers/`, { answers: payload });
      return (response.data.homework || response.data) as HomeworkItem;
    },
    onSuccess: async (homework) => {
      setSelectedHomework(homework);
      await refreshHomeworkLists();
    },
  });

  const answerQuestionMutation = useMutation({
    mutationFn: async ({ homeworkId, question }: { homeworkId: string; question: HomeworkQuestion }) => {
      const draft = draftAnswers[question.id] || {};
      const response = await api.post(`/homework/${homeworkId}/answer_question/`, {
        question: question.id,
        answer_text: draft.answer_text || "",
        selected_option_index: draft.selected_option_index ?? null,
      });
      return response.data.homework as HomeworkItem;
    },
    onSuccess: async (homework) => {
      setSelectedHomework(homework);
      await refreshHomeworkLists();
    },
  });

  const secondChanceMutation = useMutation({
    mutationFn: async ({ homeworkId, questionId }: { homeworkId: string; questionId: string }) => {
      const draft = secondChanceDrafts[questionId] || {};
      const response = await api.post(`/homework/${homeworkId}/answer_second_chance/`, {
        question: questionId,
        answer_text: draft.answer_text || "",
        selected_option_index: draft.selected_option_index ?? null,
      });
      return response.data.homework as HomeworkItem;
    },
    onSuccess: async (homework) => {
      setSelectedHomework(homework);
      await refreshHomeworkLists();
    },
  });

  const requestSecondChanceMutation = useMutation({
    mutationFn: async ({ homeworkId, questionId }: { homeworkId: string; questionId: string }) => {
      const response = await api.post(`/homework/${homeworkId}/request_second_chance/`, {
        question: questionId,
      });
      return response.data.homework as HomeworkItem;
    },
    onSuccess: async (homework, variables) => {
      setSelectedHomework(homework);
      setExpandedSecondChance((current) => ({ ...current, [variables.questionId]: true }));
      await refreshHomeworkLists();
    },
  });

  if (selectedHomework) {
    const uiStatus = getHomeworkStatus(selectedHomework);
    const canAutosave = selectedHomework.status === "pending" || selectedHomework.status === "in_progress";
    const draftSaveCopy: Record<DraftSaveState, string> = {
      idle: "As respostas são salvas automaticamente enquanto você escreve.",
      saving: "Salvando progresso...",
      saved: "Progresso salvo automaticamente.",
      error: "Não foi possível salvar agora. Suas alterações continuam na tela.",
    };
    const DraftSaveIcon = { idle: CircleDashed, saving: Loader2, saved: CheckCircle2, error: AlertCircle }[draftSaveState];
    const hasPendingSecondChance = selectedHomework.questions.some((question) => {
      const answer = selectedHomework.answers?.find((item) => item.question === question.id);
      return Boolean(
        answer?.is_correct === false &&
        question.second_chance_mode &&
        question.second_chance_mode !== "none" &&
        !answer.second_chance_answered_at
      );
    });
    const completedCount = selectedHomework.questions.filter((question) => {
      const answer = selectedHomework.answers?.find((item) => item.question === question.id);
      return Boolean(answer?.is_complete);
    }).length;
    const totalQuestions = selectedHomework.questions.length;
    // Manual activities have no "complete" flag: count questions that already have an answer on screen.
    const answeredCount = selectedHomework.questions.filter((question) => {
      const value = draftAnswers[question.id] || selectedHomework.answers?.find((item) => item.question === question.id);
      return Boolean(value?.answer_text?.trim()) || (value?.selected_option_index !== null && value?.selected_option_index !== undefined);
    }).length;
    const isAuto = selectedHomework.auto_correction_enabled;
    const showProgress = isAuto || totalQuestions > 1;
    const progressValue = isAuto ? completedCount : answeredCount;

    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" className="-ml-3" onClick={() => setSelectedHomework(null)}>
          <ArrowLeft aria-hidden="true" /> Voltar para atividades
        </Button>

        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={uiStatus} />
            {selectedHomework.classification ? (
              <Badge tone="neutral" icon={<Tag strokeWidth={iconStroke} aria-hidden="true" />}>{selectedHomework.classification}</Badge>
            ) : null}
            {isAuto ? <AutoCorrectionBadge /> : null}
          </div>
          <h1 ref={detailHeadingRef} tabIndex={-1} className="text-h2 text-ink focus:outline-none">{selectedHomework.title}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-caption text-ink-secondary">{selectedHomework.teacher_name || "Professor"}</span>
            <DueDate homework={selectedHomework} status={uiStatus} />
          </div>
          {selectedHomework.description ? (
            <p className="whitespace-pre-wrap text-body-lg leading-7 text-ink">{selectedHomework.description}</p>
          ) : null}
        </header>

        {showProgress || canAutosave ? (
          <div className="space-y-3">
            {showProgress ? (
              <div className="space-y-2">
                <p className="text-body text-ink-secondary">
                  {isAuto
                    ? `${completedCount} de ${totalQuestions} questões concluídas`
                    : `${answeredCount} de ${totalQuestions} questões respondidas`}
                </p>
                <ProgressBar value={progressValue} max={totalQuestions} label="Progresso da atividade" />
              </div>
            ) : null}
            {canAutosave ? (
              <p role="status" className={cn("flex items-start gap-2 text-caption", draftSaveState === "error" ? "font-medium text-ink" : "text-ink-secondary")}>
                <DraftSaveIcon
                  size={16}
                  strokeWidth={iconStroke}
                  aria-hidden="true"
                  className={cn(
                    "mt-px shrink-0",
                    draftSaveState === "saving" && "motion-safe:animate-spin",
                    draftSaveState === "saved" && "text-success",
                    draftSaveState === "error" && "text-danger",
                  )}
                />
                <span>{draftSaveCopy[draftSaveState]}</span>
              </p>
            ) : null}
          </div>
        ) : null}

        {uiStatus === "corrected" && selectedHomework.teacher_feedback ? (
          <StudyBlock kind="example" title="Feedback geral do professor">
            <p className="whitespace-pre-wrap leading-7">{selectedHomework.teacher_feedback}</p>
          </StudyBlock>
        ) : null}

        {selectedHomework.student_report && !hasPendingSecondChance ? <ReportCard report={selectedHomework.student_report} /> : null}

        <ol className="space-y-4" aria-label="Questões">
          {selectedHomework.questions.map((question, index) => {
            const answer = selectedHomework.answers?.find((item) => item.question === question.id);
            const secondChanceQuestion = answer?.second_chance_question;
            const canTrySecondChance = Boolean(
              answer?.is_correct === false &&
              question.second_chance_mode &&
              question.second_chance_mode !== "none" &&
              !answer.second_chance_answered_at
            );
            const isSecondChanceOpen = Boolean(expandedSecondChance[question.id]);
            const isSubmittingPrimary = answerQuestionMutation.isPending && answerQuestionMutation.variables?.question.id === question.id;
            const isSubmittingSecondChance = secondChanceMutation.isPending && secondChanceMutation.variables?.questionId === question.id;
            const isLoadingSecondChance = requestSecondChanceMutation.isPending && requestSecondChanceMutation.variables?.questionId === question.id;
            const primaryFailed = answerQuestionMutation.isError && answerQuestionMutation.variables?.question.id === question.id;
            const secondChanceFailed = (secondChanceMutation.isError && secondChanceMutation.variables?.questionId === question.id)
              || (requestSecondChanceMutation.isError && requestSecondChanceMutation.variables?.questionId === question.id);
            const promptId = `homework-question-${question.id}`;

            return (
              <li key={question.id}>
                <Card as="article" padding="md" aria-labelledby={promptId} className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-label text-ink-secondary">Questão {index + 1} de {totalQuestions}</p>
                    {isAuto && answer?.is_complete ? (
                      <Badge tone="success" icon={<CheckCircle2 strokeWidth={iconStroke} aria-hidden="true" />}>Concluída</Badge>
                    ) : null}
                  </div>
                  <p id={promptId} className="whitespace-pre-wrap text-body-lg font-medium text-ink">{question.prompt}</p>
                  <HomeworkQuestionMedia
                    imageUrl={question.image_url}
                    audioUrl={question.audio_url}
                  />

                  {isAuto ? (
                    !answer?.answered_at ? (
                      <div className="space-y-4">
                        <QuestionAnswerFields
                          name={`answer-${question.id}`}
                          label="Sua resposta"
                          question={question}
                          draft={draftAnswers[question.id]}
                          onChange={(patch) => setDraftAnswers((current) => ({ ...current, [question.id]: { ...current[question.id], ...patch } }))}
                        />
                        {primaryFailed ? (
                          <Alert tone="danger" role="alert" title="Não conseguimos corrigir sua resposta.">
                            Sua resposta continua na tela. Tente de novo.
                          </Alert>
                        ) : null}
                        <Button
                          className="w-full sm:w-auto"
                          onClick={() => answerQuestionMutation.mutate({ homeworkId: selectedHomework.id, question })}
                          loading={isSubmittingPrimary}
                          loadingLabel="Corrigindo..."
                        >
                          Verificar resposta
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <AnswerBlock
                          title="Sua resposta"
                          question={question}
                          answerText={answer.answer_text}
                          selectedOptionIndex={answer.selected_option_index}
                        />
                        <FeedbackCard
                          isCorrect={answer.is_correct}
                          feedback={answer.auto_feedback}
                          explanation={answer.auto_explanation}
                          expectedAnswer={answer.expected_answer}
                        />

                        {canTrySecondChance && !(secondChanceQuestion && isSecondChanceOpen) ? (
                          <Button
                            variant="outline"
                            className="w-full sm:w-auto"
                            onClick={() => {
                              if (secondChanceQuestion) {
                                setExpandedSecondChance((current) => ({ ...current, [question.id]: true }));
                                return;
                              }
                              requestSecondChanceMutation.mutate({ homeworkId: selectedHomework.id, questionId: question.id });
                            }}
                            loading={isLoadingSecondChance}
                            loadingLabel="Preparando..."
                          >
                            Tentar de novo
                          </Button>
                        ) : null}

                        {secondChanceQuestion && isSecondChanceOpen && !answer.second_chance_answered_at ? (
                          <section aria-labelledby={`${promptId}-second`} className="space-y-3 border-t border-line pt-4">
                            <div>
                              <h3 id={`${promptId}-second`} className="text-body font-semibold text-ink">Segunda oportunidade</h3>
                              <p className="text-body text-ink-secondary">Tente aplicar a correção em uma nova questão parecida.</p>
                            </div>
                            <p className="whitespace-pre-wrap text-body-lg font-medium text-ink">{secondChanceQuestion.prompt}</p>
                            <QuestionAnswerFields
                              name={`second-chance-${question.id}`}
                              label="Sua resposta na segunda chance"
                              question={secondChanceQuestion}
                              draft={secondChanceDrafts[question.id]}
                              onChange={(patch) => setSecondChanceDrafts((current) => ({ ...current, [question.id]: { ...current[question.id], ...patch } }))}
                            />
                            <Button
                              className="w-full sm:w-auto"
                              onClick={() => secondChanceMutation.mutate({ homeworkId: selectedHomework.id, questionId: question.id })}
                              loading={isSubmittingSecondChance}
                              loadingLabel="Conferindo..."
                            >
                              Enviar segunda chance
                            </Button>
                          </section>
                        ) : null}

                        {secondChanceFailed ? (
                          <Alert tone="danger" role="alert" title="Não conseguimos abrir a segunda chance.">
                            Tente de novo em instantes.
                          </Alert>
                        ) : null}

                        {answer.second_chance_answered_at ? (
                          <div className="space-y-3 border-t border-line pt-4">
                            <AnswerBlock
                              title="Sua resposta na segunda chance"
                              question={secondChanceQuestion || question}
                              answerText={answer.second_chance_answer_text}
                              selectedOptionIndex={answer.second_chance_selected_option_index}
                            />
                            <FeedbackCard
                              isCorrect={answer.second_chance_is_correct}
                              feedback={answer.second_chance_feedback}
                              explanation={answer.second_chance_explanation}
                              expectedAnswer={answer.second_chance_expected_answer}
                            />
                          </div>
                        ) : null}
                      </div>
                    )
                  ) : (
                    <div className="space-y-4">
                      <QuestionAnswerFields
                        name={`answer-${question.id}`}
                        label="Sua resposta"
                        question={question}
                        draft={draftAnswers[question.id] || answer}
                        onChange={(patch) => setDraftAnswers((current) => ({ ...current, [question.id]: { ...current[question.id], ...patch } }))}
                      />
                      {answer?.teacher_feedback ? (
                        <StudyBlock kind="example" title="Feedback do professor">
                          <p className="whitespace-pre-wrap">{answer.teacher_feedback}</p>
                        </StudyBlock>
                      ) : null}
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ol>

        {!isAuto ? (
          <div className="space-y-3">
            {manualSubmitMutation.isError ? (
              <Alert tone="danger" role="alert" title="Não enviamos sua atividade.">
                Suas respostas continuam na tela. Tente enviar de novo.
              </Alert>
            ) : null}
            <Button
              size="lg"
              fullWidth
              onClick={() => manualSubmitMutation.mutate(selectedHomework)}
              loading={manualSubmitMutation.isPending}
              loadingLabel="Enviando..."
            >
              <Send aria-hidden="true" /> Enviar atividade
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  const lateCount = homeworkItems.filter((item) => getHomeworkStatus(item) === "late").length;
  const correctedCount = homeworkItems.filter((item) => getHomeworkStatus(item) === "corrected").length;
  const clearFilters = () => {
    setStatusFilter("all");
    setCategoryFilter("all");
  };

  return (
    <div className="space-y-6">
      <ScreenTitle
        title="Pratique o que viu em aula"
        description="Responda, envie e acompanhe a correção do professor."
      />

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((item) => <SkeletonCard key={item} label="Carregando atividades" lines={3} />)}
        </div>
      ) : isError && homeworkItems.length === 0 ? (
        <Alert
          tone="danger"
          role="alert"
          title="Não carregamos suas atividades."
          action={(
            <Button variant="outline" size="sm" onClick={() => void refetch()} loading={isRefetching} loadingLabel="Tentando...">
              Tentar novamente
            </Button>
          )}
        >
          Verifique sua conexão e tente novamente.
        </Alert>
      ) : homeworkItems.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="Nenhuma atividade por enquanto"
            description="Quando seu professor passar uma atividade, ela aparece aqui."
            action={<Button asChild variant="secondary"><Link to={APP_PATHS.lessons}>Ver minhas aulas</Link></Button>}
          />
        </Card>
      ) : (
        <>
          <Card as="section" padding="none" aria-label="Resumo das atividades">
            <dl className="grid grid-cols-3 divide-x divide-line">
              {([
                ["Pendentes", pendingCount],
                ["Atrasadas", lateCount],
                ["Corrigidas", correctedCount],
              ] as const).map(([label, value]) => (
                <div key={label} className="flex min-w-0 flex-col-reverse items-center px-2 py-4 text-center">
                  <dt className="text-caption text-ink-secondary">{label}</dt>
                  <dd className="text-h3 text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <section aria-label="Filtros" className="space-y-3">
            <div role="group" aria-label="Filtrar por situação" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
              {(["all", "pending", "in_progress", "late", "corrected"] as const).map((status) => (
                <Chip key={status} selected={statusFilter === status} onClick={() => setStatusFilter(status)}>
                  {status === "all" ? "Todas" : statusCopy[status]}
                </Chip>
              ))}
            </div>
            {categories.length ? (
              <div>
                <label htmlFor="homework-category-filter" className="mb-1.5 block text-body font-medium text-ink">Categoria</label>
                <select
                  id="homework-category-filter"
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  className={inputClasses}
                >
                  <option value="all">Todas as categorias</option>
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </div>
            ) : null}
          </section>

          {filteredHomework.length === 0 ? (
            <Card>
              <EmptyState
                compact
                icon={ClipboardList}
                title="Nenhuma atividade com esses filtros"
                description="Escolha outra situação ou categoria."
                action={<Button variant="secondary" size="sm" onClick={clearFilters}>Limpar filtros</Button>}
              />
            </Card>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2" aria-label="Atividades">
              {filteredHomework.map((homework) => {
                const uiStatus = getHomeworkStatus(homework);
                const isOpening = openingHomeworkId === homework.id;
                const isActionable = uiStatus === "pending" || uiStatus === "in_progress" || uiStatus === "late";
                return (
                  <li key={homework.id} className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => void openHomework(homework)}
                      disabled={isOpening}
                      aria-busy={isOpening || undefined}
                      className={cn(cardVariants({ interactive: true, padding: "md" }), "flex w-full flex-1 flex-col text-left")}
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={uiStatus} />
                        {homework.auto_correction_enabled ? <AutoCorrectionBadge /> : null}
                      </span>
                      <span className="mt-3 block text-h4 text-ink">{homework.title}</span>
                      {homework.description ? (
                        <span className="mt-1 line-clamp-2 text-body text-ink-secondary">{homework.description}</span>
                      ) : null}
                      <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-muted">
                        <span>{homework.teacher_name || "Professor"}</span>
                        {homework.classification ? (
                          <span className="inline-flex items-center gap-1">
                            <Tag size={14} strokeWidth={iconStroke} aria-hidden="true" /> {homework.classification}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block">
                        <DueDate homework={homework} status={uiStatus} />
                      </span>
                      <span className="mt-auto block pt-4">
                        <span className={cn(buttonVariants({ variant: isActionable ? "primary" : "secondary", size: "sm" }), "w-full sm:w-auto")}>
                          {isOpening ? (
                            <><Loader2 className="motion-safe:animate-spin" aria-hidden="true" /> Carregando atividade...</>
                          ) : actionCopy[uiStatus]}
                        </span>
                      </span>
                    </button>
                    {openFailedHomework?.id === homework.id ? (
                      <Alert
                        tone="danger"
                        role="alert"
                        title="Não abrimos esta atividade."
                        action={(
                          <Button variant="outline" size="sm" onClick={() => void openHomework(homework)}>
                            Tentar novamente
                          </Button>
                        )}
                      >
                        Verifique sua conexão e tente novamente.
                      </Alert>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
};

const ReportCard = ({ report }: { report: HomeworkReport }) => (
  <Card as="section" padding="md" aria-labelledby="homework-report-title" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="homework-report-title" className="text-h4 text-ink">Mini relatório</h2>
      <Badge tone="success">Acerto geral: {report.accuracy}%</Badge>
    </div>
    <p className="text-body-lg text-ink">{report.summary}</p>
    <dl className="divide-y divide-line border-y border-line">
      <MetricRow label="Acertos na 1ª tentativa" value={`${report.first_try_correct}/${report.total_questions}`} />
      <MetricRow label="Recuperadas na 2ª chance" value={String(report.second_chance_correct)} />
      <MetricRow label="Ainda precisam de revisão" value={String(report.incorrect_after_second_chance)} />
    </dl>
    {report.attention_points?.length ? (
      <StudyBlock kind="correction" title="Pontos de atenção">
        <ul className="list-disc space-y-1 pl-5">
          {report.attention_points.map((point, index) => <li key={`${point}-${index}`}>{point}</li>)}
        </ul>
      </StudyBlock>
    ) : null}
  </Card>
);

const MetricRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between gap-3 py-3">
    <dt className="text-body text-ink-secondary">{label}</dt>
    <dd className="text-body font-semibold text-ink">{value}</dd>
  </div>
);

const QuestionAnswerFields = ({
  question,
  draft,
  onChange,
  name,
  label,
}: {
  question: { type: QuestionType; options: string[] };
  draft?: DraftAnswer | HomeworkAnswer | null;
  onChange: (patch: DraftAnswer) => void;
  name: string;
  label: string;
}) => {
  if (question.type === "multiple_choice") {
    return (
      <fieldset className="min-w-0 space-y-2">
        <legend className="sr-only">{label}</legend>
        {question.options.map((option, optionIndex) => {
          const checked = draft?.selected_option_index === optionIndex;
          return (
            <label
              key={`${option}-${optionIndex}`}
              className={cn(
                "flex min-h-12 cursor-pointer items-start gap-3 rounded-md border px-4 py-3 text-body-lg text-ink transition-colors duration-150 ease-standard",
                checked ? "border-primary bg-primary-subtle" : "border-line bg-surface hover:bg-surface-muted",
              )}
            >
              <input
                type="radio"
                name={name}
                checked={checked}
                onChange={() => onChange({ selected_option_index: optionIndex })}
                className="mt-0.5 size-5 shrink-0 accent-primary"
              />
              <span className="min-w-0 whitespace-pre-wrap">{option}</span>
            </label>
          );
        })}
      </fieldset>
    );
  }

  return (
    <textarea
      aria-label={label}
      rows={4}
      value={draft?.answer_text || ""}
      onChange={(event) => onChange({ answer_text: event.target.value })}
      placeholder="Digite sua resposta..."
      className={cn(inputClasses, "min-h-32 resize-y py-3 leading-7")}
    />
  );
};

const AnswerBlock = ({
  title,
  question,
  answerText,
  selectedOptionIndex,
}: {
  title: string;
  question: { type: QuestionType; options: string[] };
  answerText?: string | null;
  selectedOptionIndex?: number | null;
}) => (
  <div className="rounded-lg bg-surface-muted px-4 py-3">
    <p className="text-label text-ink">{title}</p>
    <p className="mt-1 whitespace-pre-wrap text-body-lg text-ink">
      {question.type === "multiple_choice"
        ? selectedOptionIndex === null || selectedOptionIndex === undefined
          ? "Sem opção selecionada."
          : question.options[selectedOptionIndex] || "Opção não encontrada."
        : answerText || "Sem resposta enviada."}
    </p>
  </div>
);

const FeedbackCard = ({
  isCorrect,
  feedback,
  explanation,
  expectedAnswer,
}: {
  isCorrect?: boolean | null;
  feedback?: string;
  explanation?: string;
  expectedAnswer?: string;
}) => {
  const isPositive = isCorrect === true;
  const showExpected = !isPositive && Boolean(expectedAnswer);

  return (
    <div className="space-y-3">
      <Alert tone={isPositive ? "success" : "warning"} title={isPositive ? "Acertou" : "Precisa ajustar"}>
        {feedback || showExpected ? (
          <div className="space-y-2">
            {feedback ? <p className="whitespace-pre-wrap text-body-lg">{feedback}</p> : null}
            {showExpected ? (
              <p className="whitespace-pre-wrap text-body-lg">
                <span className="font-semibold">Resposta esperada:</span> {expectedAnswer}
              </p>
            ) : null}
          </div>
        ) : null}
      </Alert>
      {explanation ? (
        <StudyBlock kind="tip" title="Explicação">
          <p className="whitespace-pre-wrap">{explanation}</p>
        </StudyBlock>
      ) : null}
    </div>
  );
};

export default Homework;
