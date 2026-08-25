import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import HomeworkQuestionMedia from "@/components/HomeworkQuestionMedia";
import PageHeader from "@/components/PageHeader";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Clock,
  Send,
  Tag,
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

const statusCopy: Record<UiHomeworkStatus, string> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  sent: "Enviada",
  late: "Atrasada",
  corrected: "Corrigida",
};

const statusStyles: Record<UiHomeworkStatus, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  in_progress: "bg-violet-50 text-violet-700 border-violet-200",
  sent: "bg-blue-50 text-blue-700 border-blue-200",
  late: "bg-red-50 text-red-700 border-red-200",
  corrected: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const normalizeList = (data: unknown) => Array.isArray(data) ? data : ((data as { results?: unknown[] })?.results || []);

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

const Homework = () => {
  return (
    <DashboardLayout>
      <PageHeader title="Homework" description="Lições de casa e acompanhamento de estudos." />
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

  const { data: homeworkItems = [], isLoading } = useQuery({
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
    try {
      const { data } = await api.get(`/homework/${homework.id}/`);
      const detailedHomework = data as HomeworkItem;
      setSelectedHomework(detailedHomework);
      setDraftAnswers({});
      setSecondChanceDrafts({});
      setExpandedSecondChance({});
    } finally {
      setOpeningHomeworkId(null);
    }
  };

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

    return (
      <div className="space-y-5">
        <button onClick={() => setSelectedHomework(null)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={16} /> Voltar para lições
        </button>

        <section className="border border-border rounded-xl bg-card p-5 space-y-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className={`rounded-md border px-2 py-1 text-xs font-medium ${statusStyles[uiStatus]}`}>{statusCopy[uiStatus]}</span>
                {selectedHomework.classification && <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{selectedHomework.classification}</span>}
                {selectedHomework.auto_correction_enabled && (
                  <span className="rounded-md bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700">Correção automática</span>
                )}
              </div>
              <h2 className="text-xl font-semibold">{selectedHomework.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedHomework.teacher_name || "Professor"} · entrega {formatDate(selectedHomework.due_date)}
              </p>
              {selectedHomework.description && <p className="mt-4 text-sm leading-6 whitespace-pre-wrap">{selectedHomework.description}</p>}
            </div>

            {selectedHomework.auto_correction_enabled ? (
              <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
                <p className="font-semibold">Progresso</p>
                <p className="mt-1 text-muted-foreground">{completedCount}/{selectedHomework.questions.length} questões concluídas</p>
              </div>
            ) : null}
          </div>

          {selectedHomework.student_report && !hasPendingSecondChance ? <ReportCard report={selectedHomework.student_report} /> : null}

          <div className="space-y-4">
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

              return (
                <div key={question.id} className="rounded-lg border border-border bg-background p-4">
                  <p className="mb-3 whitespace-pre-wrap text-sm font-semibold leading-6">{index + 1}. {question.prompt}</p>
                  <HomeworkQuestionMedia
                    className="mb-3"
                    imageUrl={question.image_url}
                    audioUrl={question.audio_url}
                  />

                  {selectedHomework.auto_correction_enabled ? (
                    <div className="space-y-4">
                      {!answer?.answered_at ? (
                        <>
                          <QuestionAnswerFields
                            question={question}
                            draft={draftAnswers[question.id]}
                            onChange={(patch) => setDraftAnswers((current) => ({ ...current, [question.id]: { ...current[question.id], ...patch } }))}
                          />
                          <Button
                            onClick={() => answerQuestionMutation.mutate({ homeworkId: selectedHomework.id, question })}
                            disabled={isSubmittingPrimary}
                          >
                            {isSubmittingPrimary ? "Corrigindo..." : "Verificar resposta"}
                          </Button>
                        </>
                      ) : (
                        <>
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

                          {canTrySecondChance ? (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="outline"
                                onClick={() => {
                                  if (secondChanceQuestion) {
                                    setExpandedSecondChance((current) => ({ ...current, [question.id]: true }));
                                    return;
                                  }
                                  requestSecondChanceMutation.mutate({ homeworkId: selectedHomework.id, questionId: question.id });
                                }}
                                disabled={isLoadingSecondChance}
                              >
                                {isLoadingSecondChance ? "Preparando..." : "Tentar de novo"}
                              </Button>
                            </div>
                          ) : null}

                          {secondChanceQuestion && isSecondChanceOpen && !answer.second_chance_answered_at ? (
                            <div className="rounded-xl border border-dashed border-border p-4 space-y-3">
                              <div>
                                <p className="text-sm font-semibold">Segunda oportunidade</p>
                                <p className="text-sm text-muted-foreground">Tente aplicar a correção em uma nova questão parecida.</p>
                              </div>
                              <p className="whitespace-pre-wrap text-sm font-medium leading-6">{secondChanceQuestion.prompt}</p>
                              <QuestionAnswerFields
                                question={secondChanceQuestion}
                                draft={secondChanceDrafts[question.id]}
                                onChange={(patch) => setSecondChanceDrafts((current) => ({ ...current, [question.id]: { ...current[question.id], ...patch } }))}
                              />
                              <Button
                                variant="outline"
                                onClick={() => secondChanceMutation.mutate({ homeworkId: selectedHomework.id, questionId: question.id })}
                                disabled={isSubmittingSecondChance}
                              >
                                {isSubmittingSecondChance ? "Conferindo..." : "Enviar segunda chance"}
                              </Button>
                            </div>
                          ) : null}

                          {answer.second_chance_answered_at ? (
                            <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
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
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <QuestionAnswerFields
                        question={question}
                        draft={draftAnswers[question.id] || answer}
                        onChange={(patch) => setDraftAnswers((current) => ({ ...current, [question.id]: { ...current[question.id], ...patch } }))}
                      />
                      {answer?.teacher_feedback ? (
                        <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Feedback: {answer.teacher_feedback}</p>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!selectedHomework.auto_correction_enabled ? (
            <Button onClick={() => manualSubmitMutation.mutate(selectedHomework)} disabled={manualSubmitMutation.isPending}>
              <Send className="mr-2 h-4 w-4" /> {manualSubmitMutation.isPending ? "Enviando..." : "Enviar atividade"}
            </Button>
          ) : null}

          {uiStatus === "corrected" && selectedHomework.teacher_feedback ? (
            <div className="rounded-lg border border-border bg-muted/50 p-4">
              <p className="text-sm font-semibold">Feedback geral do professor</p>
              <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{selectedHomework.teacher_feedback}</p>
            </div>
          ) : null}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile label="Pendentes" value={pendingCount} icon={Clock} />
        <SummaryTile label="Atrasadas" value={homeworkItems.filter((item) => getHomeworkStatus(item) === "late").length} icon={CalendarClock} />
        <SummaryTile label="Corrigidas" value={homeworkItems.filter((item) => getHomeworkStatus(item) === "corrected").length} icon={CheckCircle2} />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {(["all", "pending", "in_progress", "late", "corrected"] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`rounded-lg px-3 py-2 text-sm font-medium sidebar-transition ${statusFilter === status ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
            >
              {status === "all" ? "Todas" : statusCopy[status]}
            </button>
          ))}
        </div>
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
          <option value="all">Todas as categorias</option>
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando lições...</p>
      ) : filteredHomework.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Nenhuma lição encontrada com esses filtros.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredHomework.map((homework) => {
            const uiStatus = getHomeworkStatus(homework);
            return (
              <button key={homework.id} onClick={() => void openHomework(homework)} className="text-left rounded-xl border border-border bg-card p-5 shadow-sm sidebar-transition hover:shadow-md" disabled={openingHomeworkId === homework.id}>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="mb-2 flex flex-wrap gap-2">
                      <span className={`rounded-md border px-2 py-1 text-xs font-medium ${statusStyles[uiStatus]}`}>{statusCopy[uiStatus]}</span>
                      {homework.auto_correction_enabled ? <span className="rounded-md bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700">Auto</span> : null}
                      {isDueSoon(homework.due_date) && <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">Vence em breve</span>}
                    </div>
                    <h3 className="font-semibold">{homework.title}</h3>
                  </div>
                  <BookOpen className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">{homework.description || "Sem descrição."}</p>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                  <span>{homework.teacher_name || "Professor"}</span>
                  <span>{formatDate(homework.due_date)}</span>
                  {homework.classification && <span className="inline-flex items-center gap-1"><Tag size={13} /> {homework.classification}</span>}
                </div>
                {openingHomeworkId === homework.id ? <p className="mt-3 text-xs text-muted-foreground">Carregando atividade...</p> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const SummaryTile = ({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Clock }) => (
  <div className="rounded-xl border border-border bg-card p-4">
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">{label}</p>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </div>
    <p className="mt-2 text-2xl font-bold">{value}</p>
  </div>
);

const ReportCard = ({ report }: { report: HomeworkReport }) => (
  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-3">
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-sm font-semibold text-emerald-900">Mini relatório</p>
      <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-emerald-700">Acerto geral: {report.accuracy}%</span>
    </div>
    <p className="text-sm text-emerald-950">{report.summary}</p>
    <div className="grid gap-3 sm:grid-cols-3">
      <MetricCard label="Acertos na 1ª tentativa" value={`${report.first_try_correct}/${report.total_questions}`} />
      <MetricCard label="Recuperadas na 2ª chance" value={String(report.second_chance_correct)} />
      <MetricCard label="Ainda precisam revisão" value={String(report.incorrect_after_second_chance)} />
    </div>
    {report.attention_points?.length ? (
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Pontos de atenção</p>
        <ul className="mt-2 space-y-1 text-sm text-emerald-950">
          {report.attention_points.map((point, index) => <li key={`${point}-${index}`}>• {point}</li>)}
        </ul>
      </div>
    ) : null}
  </div>
);

const MetricCard = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-emerald-200 bg-white p-3">
    <p className="text-xs text-emerald-700">{label}</p>
    <p className="mt-1 text-lg font-semibold text-emerald-950">{value}</p>
  </div>
);

const QuestionAnswerFields = ({
  question,
  draft,
  onChange,
}: {
  question: { type: QuestionType; options: string[] };
  draft?: DraftAnswer | HomeworkAnswer | null;
  onChange: (patch: DraftAnswer) => void;
}) => {
  if (question.type === "multiple_choice") {
    return (
      <div className="space-y-2">
        {question.options.map((option, optionIndex) => (
          <label key={`${option}-${optionIndex}`} className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/50">
            <input
              type="radio"
              checked={draft?.selected_option_index === optionIndex}
              onChange={() => onChange({ selected_option_index: optionIndex })}
            />
            <span className="whitespace-pre-wrap leading-6">{option}</span>
          </label>
        ))}
      </div>
    );
  }

  return (
    <Textarea
      value={draft?.answer_text || ""}
      onChange={(event) => onChange({ answer_text: event.target.value })}
      placeholder="Digite sua resposta..."
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
  <div className="rounded-lg border border-border bg-muted/30 p-3">
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
    <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
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

  return (
    <div className={`rounded-xl border p-4 ${isPositive ? "border-emerald-200 bg-emerald-50/80" : "border-amber-200 bg-amber-50/80"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-md px-2 py-1 text-xs font-semibold ${isPositive ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
          {isPositive ? "Acertou" : "Precisa ajustar"}
        </span>
      </div>
      {feedback ? <p className="mt-2 text-sm font-medium">{feedback}</p> : null}
      {explanation ? <p className="mt-2 text-sm text-muted-foreground">{explanation}</p> : null}
      {!isPositive && expectedAnswer ? (
        <p className="mt-2 text-sm">
          <span className="font-semibold">Resposta esperada:</span> {expectedAnswer}
        </p>
      ) : null}
    </div>
  );
};

export default Homework;
