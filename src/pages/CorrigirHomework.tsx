import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import DashboardLayout from "@/components/DashboardLayout";
import { HomeworkPanel } from "@/components/HomeworkPanel";
import HomeworkQuestionMedia from "@/components/HomeworkQuestionMedia";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CalendarClock, CheckCircle2, Clock, Inbox, Plus, Search, Sparkles, UserRound } from "lucide-react";

type QuestionType = "open_text" | "multiple_choice";
type ApiHomeworkStatus = "draft" | "pending" | "in_progress" | "sent" | "corrected";
type UiHomeworkStatus = "draft" | "pending" | "in_progress" | "sent" | "late" | "corrected";
type HomeworkStatusFilter = "all" | UiHomeworkStatus;
type CorrectionTypeFilter = "all" | "auto" | "manual";

type HomeworkQuestion = {
  id: string;
  type: QuestionType;
  prompt: string;
  image_url?: string | null;
  audio_url?: string | null;
  audio_transcript?: string;
  options: string[];
  correct_option_index: number | null;
  reference_answer?: string;
  correction_instructions?: string;
  explanation?: string;
  second_chance_mode?: "none" | "reserve";
  reserve_question?: {
    type: QuestionType;
    prompt: string;
    options: string[];
    correct_option_index: number | null;
    reference_answer?: string;
    explanation?: string;
  } | null;
  order: number;
};

type HomeworkAnswer = {
  id: string;
  question: string;
  answer_text?: string;
  selected_option_index?: number | null;
  is_correct?: boolean | null;
  auto_feedback?: string;
  auto_explanation?: string;
  expected_answer?: string;
  second_chance_question?: {
    type: QuestionType;
    prompt: string;
    options: string[];
  } | null;
  second_chance_answer_text?: string;
  second_chance_selected_option_index?: number | null;
  second_chance_is_correct?: boolean | null;
  second_chance_feedback?: string;
  second_chance_explanation?: string;
  teacher_feedback?: string;
};

type HomeworkItem = {
  id: string;
  title: string;
  description?: string;
  classification?: string;
  status: ApiHomeworkStatus;
  due_date?: string | null;
  auto_correction_enabled?: boolean;
  teacher_feedback?: string;
  student_report?: {
    summary?: string;
    accuracy?: number;
    total_questions?: number;
    first_try_correct?: number;
    second_chance_correct?: number;
    incorrect_after_second_chance?: number;
    attention_points?: string[];
    teacher_focus_report?: TeacherFocusReport | null;
  } | null;
  student_name?: string;
  student?: string;
  teacher_name?: string;
  teacher?: string;
  group?: string;
  group_name?: string;
  lesson?: string;
  lesson_title?: string;
  template?: string;
  questions: HomeworkQuestion[];
  answers?: HomeworkAnswer[];
  updated_at?: string | null;
};

type TeacherFocusReport = {
  generated_at?: string;
  model?: string;
  summary: string;
  focus_points: string[];
  suggested_next_steps: string[];
};

type LessonOption = {
  id: string;
  title: string;
  date?: string | null;
  status?: string;
  student?: string | null;
  student_name?: string;
  group?: string | null;
  group_name?: string;
  teacher?: string | null;
};

type RecipientOption = {
  key: string;
  type: "student" | "group";
  id: string;
  name: string;
  lessonCount: number;
  latestDate?: string | null;
};

type CorrectionPayload = {
  generalFeedback: string;
  answersFeedback: Record<string, string>;
};

const statusStyles: Record<UiHomeworkStatus, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  in_progress: "bg-violet-50 text-violet-700 border-violet-200",
  sent: "bg-blue-50 text-blue-700 border-blue-200",
  late: "bg-red-50 text-red-700 border-red-200",
  corrected: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const getHomeworkStatus = (homework: HomeworkItem): UiHomeworkStatus => {
  if (homework.status === "draft") return "draft";
  if (homework.status === "corrected") return "corrected";
  if (homework.status === "sent") return "sent";
  if (homework.status === "in_progress") return "in_progress";
  if (homework.due_date && new Date(homework.due_date).getTime() < Date.now()) return "late";
  return "pending";
};

const statusLabel: Record<UiHomeworkStatus, string> = {
  draft: "Rascunho",
  pending: "Pendente",
  in_progress: "Em andamento",
  sent: "Aguardando Correção",
  late: "Atrasado",
  corrected: "Corrigido",
};

const statusFilterOptions: { value: HomeworkStatusFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "draft", label: "Rascunhos" },
  { value: "sent", label: "Aguardando correção" },
  { value: "pending", label: "Pendentes" },
  { value: "in_progress", label: "Em andamento" },
  { value: "late", label: "Atrasadas" },
  { value: "corrected", label: "Corrigidas" },
];

const formatDate = (value?: string | null) => {
  if (!value) return "Sem prazo";
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const formatLessonOptionDate = (value?: string | null) => {
  if (!value) return "Sem data";
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
};

const getLessonRecipientName = (lesson?: LessonOption | null) => {
  if (!lesson) return "";
  return lesson.group ? lesson.group_name || "Turma sem nome" : lesson.student_name || "Aluno não informado";
};

const getLessonRecipientKey = (lesson?: LessonOption | null) => {
  if (!lesson) return "";
  if (lesson.group) return `group:${lesson.group}`;
  if (lesson.student) return `student:${lesson.student}`;
  return "";
};

const getHomeworkRecipientName = (homework: HomeworkItem) => {
  if (homework.group) return homework.group_name || "Turma sem nome";
  return homework.student_name || "Aluno não informado";
};

const getHomeworkRecipientKey = (homework: HomeworkItem) => {
  if (homework.group) return `group:${homework.group}`;
  if (homework.student) return `student:${homework.student}`;
  return `unknown:${getHomeworkRecipientName(homework)}`;
};

const normalizeSearchText = (value: string) => (
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
);

const normalizeList = (data: unknown) => Array.isArray(data) ? data : ((data as { results?: unknown[] })?.results || []);

const splitNumberedPrompt = (prompt: string) => {
  const text = (prompt || "").replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const matches = Array.from(text.matchAll(/(?:^|\s)(\d{1,3})[.)]\s+/g));
  if (matches.length < 2) {
    return text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  }

  return matches.map((match, index) => {
    const start = (match.index || 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index || text.length : text.length;
    return text.slice(start, end).trim();
  }).filter(Boolean);
};

const FormattedQuestionPrompt = ({ prompt, questionNumber }: { prompt: string; questionNumber: number }) => {
  const parts = splitNumberedPrompt(prompt);
  const isNumberedList = parts.length > 1;

  return (
    <div className="mb-3 rounded-lg border border-border bg-muted/20 p-3 text-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Pergunta {questionNumber}
      </p>
      {isNumberedList ? (
        <ol className="list-decimal space-y-1.5 pl-5 leading-6 text-foreground">
          {parts.map((part, index) => (
            <li key={`${part}-${index}`} className="pl-1">
              <span className="whitespace-pre-wrap">{part}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="whitespace-pre-wrap font-semibold leading-6 text-foreground">
          {parts[0] || prompt}
        </p>
      )}
    </div>
  );
};

export default function CorrigirHomework() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [selectedHomework, setSelectedHomework] = useState<HomeworkItem | null>(null);
  const [generalFeedback, setGeneralFeedback] = useState("");
  const [answersFeedback, setAnswersFeedback] = useState<Record<string, string>>({});
  const [openingHomeworkId, setOpeningHomeworkId] = useState<string | null>(null);
  const [teacherFocusReport, setTeacherFocusReport] = useState<TeacherFocusReport | null>(null);
  const [newHomeworkPickerOpen, setNewHomeworkPickerOpen] = useState(false);
  const [selectedRecipientKey, setSelectedRecipientKey] = useState("");
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [recipientSearchTerm, setRecipientSearchTerm] = useState("");
  const [lessonSearchTerm, setLessonSearchTerm] = useState("");
  const [createHomeworkLesson, setCreateHomeworkLesson] = useState<LessonOption | null>(null);
  const [createHomeworkKey, setCreateHomeworkKey] = useState<string | null>(null);
  const [editingHomeworkDraft, setEditingHomeworkDraft] = useState<HomeworkItem | null>(null);
  const [homeworkSearchTerm, setHomeworkSearchTerm] = useState("");
  const [homeworkStatusFilter, setHomeworkStatusFilter] = useState<HomeworkStatusFilter>("all");
  const [homeworkRecipientFilter, setHomeworkRecipientFilter] = useState("all");
  const [homeworkClassificationFilter, setHomeworkClassificationFilter] = useState("all");
  const [correctionTypeFilter, setCorrectionTypeFilter] = useState<CorrectionTypeFilter>("all");

  const { data: homeworkItems = [], isLoading } = useQuery({
    queryKey: ["teacher-homework"],
    queryFn: async () => {
      const res = await api.get("/homework/?ordering=-updated_at");
      return normalizeList(res.data) as HomeworkItem[];
    },
  });

  const { data: lessonOptions = [], isLoading: isLoadingLessons } = useQuery({
    queryKey: ["teacher-lessons-for-homework"],
    queryFn: async () => {
      const res = await api.get("/lessons/", {
        params: {
          all: true,
          is_template: false,
          ordering: "-date",
        },
      });
      return (normalizeList(res.data) as LessonOption[])
        .filter((lesson) => Boolean(lesson.student || lesson.group))
        .sort((a, b) => {
          const aDate = a.date ? new Date(a.date).getTime() : 0;
          const bDate = b.date ? new Date(b.date).getTime() : 0;
          return bDate - aDate;
        });
    },
  });

  const selectedLesson = useMemo(
    () => lessonOptions.find((lesson) => lesson.id === selectedLessonId) || null,
    [lessonOptions, selectedLessonId],
  );

  const recipientOptions = useMemo(() => {
    const recipients = new Map<string, RecipientOption>();

    lessonOptions.forEach((lesson) => {
      const key = getLessonRecipientKey(lesson);
      if (!key) return;

      const existing = recipients.get(key);
      const lessonDate = lesson.date || null;
      if (existing) {
        existing.lessonCount += 1;
        if (lessonDate && (!existing.latestDate || new Date(lessonDate).getTime() > new Date(existing.latestDate).getTime())) {
          existing.latestDate = lessonDate;
        }
        return;
      }

      recipients.set(key, {
        key,
        type: lesson.group ? "group" : "student",
        id: lesson.group || lesson.student || key,
        name: getLessonRecipientName(lesson),
        lessonCount: 1,
        latestDate: lessonDate,
      });
    });

    return Array.from(recipients.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [lessonOptions]);

  const filteredRecipientOptions = useMemo(() => {
    const search = normalizeSearchText(recipientSearchTerm);
    if (!search) return recipientOptions;
    return recipientOptions.filter((recipient) => normalizeSearchText(recipient.name).includes(search));
  }, [recipientOptions, recipientSearchTerm]);

  const lessonsForSelectedRecipient = useMemo(() => {
    if (!selectedRecipientKey) return [];
    return lessonOptions.filter((lesson) => getLessonRecipientKey(lesson) === selectedRecipientKey);
  }, [lessonOptions, selectedRecipientKey]);

  const filteredLessonOptions = useMemo(() => {
    const search = normalizeSearchText(lessonSearchTerm);
    if (!search) return lessonsForSelectedRecipient;
    return lessonsForSelectedRecipient.filter((lesson) => {
      const searchable = [
        lesson.title,
        lesson.status,
        lesson.date ? formatLessonOptionDate(lesson.date) : "",
      ].filter(Boolean).join(" ");
      return normalizeSearchText(searchable).includes(search);
    });
  }, [lessonSearchTerm, lessonsForSelectedRecipient]);

  const selectedRecipient = useMemo(
    () => recipientOptions.find((recipient) => recipient.key === selectedRecipientKey) || null,
    [recipientOptions, selectedRecipientKey],
  );

  const homeworkRecipientOptions = useMemo(() => {
    const recipients = new Map<string, { key: string; name: string; count: number }>();
    homeworkItems.forEach((homework) => {
      const key = getHomeworkRecipientKey(homework);
      const name = getHomeworkRecipientName(homework);
      const existing = recipients.get(key);
      if (existing) {
        existing.count += 1;
        return;
      }
      recipients.set(key, { key, name, count: 1 });
    });
    return Array.from(recipients.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [homeworkItems]);

  const homeworkClassificationOptions = useMemo(() => {
    return Array.from(new Set(homeworkItems.map((item) => item.classification).filter(Boolean) as string[]))
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [homeworkItems]);

  const statusCounts = useMemo(() => {
    return homeworkItems.reduce(
      (counts, homework) => {
        const status = getHomeworkStatus(homework);
        counts.all += 1;
        counts[status] += 1;
        return counts;
      },
      {
        all: 0,
        draft: 0,
        pending: 0,
        in_progress: 0,
        sent: 0,
        late: 0,
        corrected: 0,
      } as Record<HomeworkStatusFilter, number>,
    );
  }, [homeworkItems]);

  const { draftCount, pendingReviewCount, filteredHomeworkItems } = useMemo(() => {
    let drafts = 0;
    let pendingReview = 0;
    const items = homeworkItems.filter(item => {
      if (item.status === "draft") {
        drafts++;
      }
      if (item.status === "sent" && !item.auto_correction_enabled) {
        pendingReview++;
      }
      const status = getHomeworkStatus(item);
      if (homeworkStatusFilter !== "all" && status !== homeworkStatusFilter) {
        return false;
      }
      if (homeworkRecipientFilter !== "all" && getHomeworkRecipientKey(item) !== homeworkRecipientFilter) {
        return false;
      }
      if (homeworkClassificationFilter !== "all" && item.classification !== homeworkClassificationFilter) {
        return false;
      }
      if (correctionTypeFilter === "auto" && !item.auto_correction_enabled) {
        return false;
      }
      if (correctionTypeFilter === "manual" && item.auto_correction_enabled) {
        return false;
      }

      const search = normalizeSearchText(homeworkSearchTerm);
      if (!search) {
        return true;
      }

      const searchable = [
        item.title,
        item.description,
        item.classification,
        item.student_name,
        item.group_name,
        item.lesson_title,
        item.due_date ? formatDate(item.due_date) : "",
        item.updated_at ? formatDate(item.updated_at) : "",
        statusLabel[status],
        item.auto_correction_enabled ? "correcao automatica auto ia" : "correcao manual professor",
      ].filter(Boolean).join(" ");

      return normalizeSearchText(searchable).includes(search);
    });
    return { draftCount: drafts, pendingReviewCount: pendingReview, filteredHomeworkItems: items };
  }, [
    correctionTypeFilter,
    homeworkClassificationFilter,
    homeworkItems,
    homeworkRecipientFilter,
    homeworkSearchTerm,
    homeworkStatusFilter,
  ]);

  const hasActiveHomeworkFilters = Boolean(
    homeworkSearchTerm.trim() ||
    homeworkStatusFilter !== "all" ||
    homeworkRecipientFilter !== "all" ||
    homeworkClassificationFilter !== "all" ||
    correctionTypeFilter !== "all"
  );

  const clearHomeworkFilters = () => {
    setHomeworkSearchTerm("");
    setHomeworkStatusFilter("all");
    setHomeworkRecipientFilter("all");
    setHomeworkClassificationFilter("all");
    setCorrectionTypeFilter("all");
  };

  const correctionMutation = useMutation({
    mutationFn: async ({ homeworkId, payload }: { homeworkId: string; payload: CorrectionPayload }) => {
      const patchData = {
        status: "corrected",
        teacher_feedback: payload.generalFeedback
      };
      await api.patch(`/homework/${homeworkId}/`, patchData);

      if (payload.answersFeedback) {
         for (const answerId of Object.keys(payload.answersFeedback)) {
             await api.patch(`/homework-answers/${answerId}/`, {
                 teacher_feedback: payload.answersFeedback[answerId]
             });
         }
      }
      return true;
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Homework corrigida com sucesso!",
      });
      queryClient.invalidateQueries({ queryKey: ["teacher-homework"] });
      setSelectedHomework(null);
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível enviar a correção.",
        variant: "destructive"
      });
    }
  });

  const teacherFocusMutation = useMutation({
    mutationFn: async (homeworkId: string) => {
      const { data } = await api.post(`/homework/${homeworkId}/teacher_focus_report/`);
      return data as { report: TeacherFocusReport; homework?: HomeworkItem };
    },
    onSuccess: (data) => {
      setTeacherFocusReport(data.report);
      if (data.homework) {
        setSelectedHomework(data.homework);
      } else {
        setSelectedHomework((current) => current ? {
          ...current,
          student_report: {
            ...(current.student_report || {}),
            teacher_focus_report: data.report,
          },
        } : current);
      }
      queryClient.invalidateQueries({ queryKey: ["teacher-homework"] });
      toast({
        title: "Relatório gerado",
        description: "A IA resumiu os pontos de foco para este aluno.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível gerar o relatório de foco agora.",
        variant: "destructive",
      });
    },
  });

  const handleCorrect = async (homework: HomeworkItem) => {
    setOpeningHomeworkId(homework.id);
    try {
      const { data } = await api.get(`/homework/${homework.id}/`);
      const latestHomework = data as HomeworkItem;

      setGeneralFeedback(latestHomework.teacher_feedback || "");
      setTeacherFocusReport(latestHomework.student_report?.teacher_focus_report || null);
      const initialFeedback: Record<string, string> = {};
      latestHomework.answers?.forEach(ans => {
        if (ans.id && ans.teacher_feedback) {
          initialFeedback[ans.id] = ans.teacher_feedback;
        }
      });
      setAnswersFeedback(initialFeedback);
      setSelectedHomework(latestHomework);
    } finally {
      setOpeningHomeworkId(null);
    }
  };

  const onSubmitCorrection = () => {
    if (!selectedHomework) return;
    correctionMutation.mutate({
      homeworkId: selectedHomework.id,
      payload: {
        generalFeedback,
        answersFeedback
      }
    });
  };

  const handleStartNewHomework = () => {
    if (!selectedLesson) return;
    setEditingHomeworkDraft(null);
    setCreateHomeworkLesson(selectedLesson);
    setCreateHomeworkKey(`${selectedLesson.id}-${Date.now()}`);
    handleNewHomeworkPickerOpenChange(false);
  };

  const handleContinueDraft = async (homework: HomeworkItem) => {
    setOpeningHomeworkId(homework.id);
    try {
      const { data } = await api.get(`/homework/${homework.id}/`);
      const latestHomework = data as HomeworkItem;
      const lessonId = latestHomework.lesson || homework.lesson;
      if (!lessonId) {
        toast({
          title: "Rascunho sem aula",
          description: "Não foi possível encontrar a aula vinculada a esta homework.",
          variant: "destructive",
        });
        return;
      }

      const lessonFromList = lessonOptions.find((lesson) => lesson.id === lessonId);
      const draftLesson: LessonOption = lessonFromList || {
        id: lessonId,
        title: latestHomework.lesson_title || homework.lesson_title || "Aula",
        student: latestHomework.student || homework.student || null,
        student_name: latestHomework.student_name || homework.student_name,
        group: latestHomework.group || homework.group || null,
        group_name: latestHomework.group_name || homework.group_name,
        teacher: latestHomework.teacher || homework.teacher || null,
      };

      setEditingHomeworkDraft(latestHomework);
      setCreateHomeworkLesson(draftLesson);
      setCreateHomeworkKey(`draft-${latestHomework.id}-${Date.now()}`);
    } finally {
      setOpeningHomeworkId(null);
    }
  };

  const handleNewHomeworkPickerOpenChange = (open: boolean) => {
    setNewHomeworkPickerOpen(open);
    if (!open) {
      setSelectedRecipientKey("");
      setSelectedLessonId("");
      setRecipientSearchTerm("");
      setLessonSearchTerm("");
    }
  };

  const handleSelectRecipient = (recipientKey: string) => {
    setSelectedRecipientKey(recipientKey);
    setSelectedLessonId("");
    setLessonSearchTerm("");
  };

  if (selectedHomework) {
    return (
      <DashboardLayout>
        <PageHeader 
          title="Corrigir Atividade" 
          description={`Aluno: ${selectedHomework.student_name || "Desconhecido"}`}
        />
        <div className="space-y-4 max-w-4xl">
          <button 
            onClick={() => setSelectedHomework(null)} 
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft size={16} /> Voltar
          </button>
          
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div>
              <h2 className="text-xl font-bold">{selectedHomework.title}</h2>
              <p className="text-sm text-muted-foreground">{selectedHomework.lesson_title ? `Aula: ${selectedHomework.lesson_title}` : ""}</p>
            </div>

            {selectedHomework.student_report ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                <p className="text-sm font-semibold text-emerald-900">Resumo automático</p>
                <p className="mt-1 text-sm text-emerald-950">{selectedHomework.student_report.summary}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-emerald-800">
                  <span className="rounded-md bg-white px-2 py-1">Acerto geral: {selectedHomework.student_report.accuracy ?? 0}%</span>
                  <span className="rounded-md bg-white px-2 py-1">1ª tentativa: {selectedHomework.student_report.first_try_correct ?? 0}</span>
                  <span className="rounded-md bg-white px-2 py-1">2ª chance: {selectedHomework.student_report.second_chance_correct ?? 0}</span>
                </div>
              </div>
            ) : null}

            <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-sky-950">Foco sugerido pela IA</p>
                  <p className="mt-1 text-sm text-sky-900">
                    Gere um resumo curto do que revisar com o aluno a partir dos erros da homework.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => teacherFocusMutation.mutate(selectedHomework.id)}
                  disabled={teacherFocusMutation.isPending}
                  className="border-sky-200 bg-white text-sky-800 hover:bg-sky-100"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {teacherFocusMutation.isPending ? "Gerando..." : teacherFocusReport ? "Gerar novamente" : "Gerar relatório"}
                </Button>
              </div>

              {teacherFocusReport ? (
                <div className="mt-4 space-y-3 text-sm text-sky-950">
                  <p className="leading-6">{teacherFocusReport.summary}</p>
                  {teacherFocusReport.focus_points?.length ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">Pontos de foco</p>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {teacherFocusReport.focus_points.map((point, index) => (
                          <li key={`${point}-${index}`}>{point}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {teacherFocusReport.suggested_next_steps?.length ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">Próximos passos</p>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {teacherFocusReport.suggested_next_steps.map((step, index) => (
                          <li key={`${step}-${index}`}>{step}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="space-y-6 mt-6">
              {selectedHomework.questions.map((q, idx) => {
                const answer = selectedHomework.answers?.find(a => a.question === q.id);
                
                return (
                  <div key={q.id} className="border border-border rounded-lg p-4 bg-background">
                    <FormattedQuestionPrompt prompt={q.prompt} questionNumber={idx + 1} />
                    <HomeworkQuestionMedia className="mb-3" imageUrl={q.image_url} audioUrl={q.audio_url} />
                    
                    {answer ? (
                      <div className="bg-muted/50 p-3 rounded-md mb-3 border border-border text-sm">
                        <span className="font-medium text-xs text-muted-foreground uppercase tracking-wide block mb-1">
                          Resposta do aluno:
                        </span>
                        {q.type === 'open_text' ? (
                          <span className="whitespace-pre-wrap">{answer.answer_text || "(em branco)"}</span>
                        ) : (
                          <span>{answer.selected_option_index != null && q.options[answer.selected_option_index] ? q.options[answer.selected_option_index] : "(não selecionada)"}</span>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground italic mb-4">
                        O aluno não respondeu a esta questão.
                      </div>
                    )}

                    {answer?.auto_feedback ? (
                      <div className={`rounded-lg border p-3 text-sm ${answer.is_correct ? "border-emerald-200 bg-emerald-50/70" : "border-amber-200 bg-amber-50/70"}`}>
                        <p className="font-medium">{answer.auto_feedback}</p>
                        {answer.auto_explanation ? <p className="mt-1 text-muted-foreground">{answer.auto_explanation}</p> : null}
                        {!answer.is_correct && answer.expected_answer ? <p className="mt-2"><span className="font-semibold">Resposta esperada:</span> {answer.expected_answer}</p> : null}
                      </div>
                    ) : null}

                    {answer?.second_chance_answer_text || answer?.second_chance_selected_option_index !== undefined ? (
                      <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm mt-3">
                        <span className="font-medium text-xs text-muted-foreground uppercase tracking-wide block mb-1">
                          Segunda chance:
                        </span>
                        {answer.second_chance_question?.prompt ? <p className="mb-2 font-medium">{answer.second_chance_question.prompt}</p> : null}
                        <p>
                          {(answer.second_chance_question?.type || q.type) === "open_text"
                            ? answer.second_chance_answer_text || "(em branco)"
                            : answer.second_chance_selected_option_index != null && answer.second_chance_question?.options?.[answer.second_chance_selected_option_index]
                              ? answer.second_chance_question.options[answer.second_chance_selected_option_index]
                              : "(não selecionada)"}
                        </p>
                        {answer.second_chance_feedback ? <p className="mt-2 font-medium">{answer.second_chance_feedback}</p> : null}
                        {answer.second_chance_explanation ? <p className="mt-1 text-muted-foreground">{answer.second_chance_explanation}</p> : null}
                      </div>
                    ) : null}

                    <div className="space-y-2 mt-4">
                      <label className="text-xs font-semibold text-foreground">Feedback para essa questão (Opcional):</label>
                      <Textarea 
                        placeholder="Deixe um comentário sobre a resposta..."
                        value={(answer?.id && answersFeedback[answer.id]) || ""}
                        onChange={(e) => {
                          if(answer?.id) {
                            setAnswersFeedback(prev => ({ ...prev, [answer.id]: e.target.value }));
                          }
                        }}
                        rows={2}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 pt-6 border-t border-border">
              <label className="block text-sm font-semibold mb-2">Feedback Geral e Nota</label>
              <Textarea 
                placeholder="Escreva um comentário geral sobre o desempenho do aluno nessa atividade..."
                value={generalFeedback}
                onChange={(e) => setGeneralFeedback(e.target.value)}
                rows={4}
              />
            </div>

            <div className="flex justify-end pt-4">
              <Button className="w-full sm:w-auto" onClick={onSubmitCorrection} disabled={correctionMutation.isPending}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> 
                {correctionMutation.isPending ? "Salvando..." : "Concluir Correção"}
              </Button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <PageHeader
          title="Homework"
          description="Avalie os exercícios enviados pelos alunos."
        />
        <Button className="w-full lg:w-auto" onClick={() => setNewHomeworkPickerOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nova homework
        </Button>
      </div>

      <Dialog open={newHomeworkPickerOpen} onOpenChange={handleNewHomeworkPickerOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Nova homework</DialogTitle>
            <DialogDescription>
              Primeiro escolha o aluno ou turma, depois selecione a aula que receberá a atividade.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <section className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-foreground">1. Aluno ou turma</p>
                <p className="mt-1 text-xs text-muted-foreground">Digite para encontrar rapidamente.</p>
              </div>
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={recipientSearchTerm}
                  onChange={(event) => setRecipientSearchTerm(event.target.value)}
                  placeholder="Buscar aluno ou turma"
                  className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                  disabled={isLoadingLessons}
                />
              </label>

              <div className="max-h-[320px] overflow-y-auto rounded-lg border border-border">
                {isLoadingLessons ? (
                  <p className="p-4 text-sm text-muted-foreground">Carregando alunos...</p>
                ) : filteredRecipientOptions.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">Nenhum aluno ou turma encontrado.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {filteredRecipientOptions.map((recipient) => {
                      const isSelected = recipient.key === selectedRecipientKey;
                      return (
                        <button
                          key={recipient.key}
                          type="button"
                          onClick={() => handleSelectRecipient(recipient.key)}
                          className={`flex w-full items-start gap-3 p-3 text-left transition ${
                            isSelected ? "bg-sky-50 text-sky-950" : "hover:bg-muted/60"
                          }`}
                        >
                          <span className={`mt-0.5 rounded-md p-2 ${isSelected ? "bg-white text-sky-700" : "bg-muted text-muted-foreground"}`}>
                            <UserRound className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{recipient.name}</span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {recipient.type === "group" ? "Turma" : "Aluno"} · {recipient.lessonCount} aula{recipient.lessonCount === 1 ? "" : "s"}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-foreground">2. Aula</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedRecipient ? `Aulas de ${selectedRecipient.name}` : "Selecione um aluno primeiro."}
                </p>
              </div>
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={lessonSearchTerm}
                  onChange={(event) => setLessonSearchTerm(event.target.value)}
                  placeholder="Buscar aula"
                  className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100 disabled:bg-muted/40"
                  disabled={!selectedRecipientKey}
                />
              </label>

              <div className="max-h-[320px] overflow-y-auto rounded-lg border border-border">
                {!selectedRecipientKey ? (
                  <p className="p-4 text-sm text-muted-foreground">Escolha um aluno ou turma para ver as aulas.</p>
                ) : filteredLessonOptions.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">Nenhuma aula encontrada para esse filtro.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {filteredLessonOptions.map((lesson) => {
                      const isSelected = lesson.id === selectedLessonId;
                      return (
                        <button
                          key={lesson.id}
                          type="button"
                          onClick={() => setSelectedLessonId(lesson.id)}
                          className={`flex w-full items-start gap-3 p-3 text-left transition ${
                            isSelected ? "bg-sky-50 text-sky-950" : "hover:bg-muted/60"
                          }`}
                        >
                          <span className={`mt-0.5 rounded-md p-2 ${isSelected ? "bg-white text-sky-700" : "bg-muted text-muted-foreground"}`}>
                            <CalendarClock className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block break-words text-sm font-semibold">{lesson.title}</span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {formatLessonOptionDate(lesson.date)}{lesson.status ? ` · ${lesson.status}` : ""}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            {selectedLesson ? (
              <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-3 text-sm lg:col-span-2">
                <p className="font-semibold text-sky-950">{getLessonRecipientName(selectedLesson)}</p>
                <p className="mt-1 text-sky-900">
                  {selectedLesson.title} · {formatLessonOptionDate(selectedLesson.date)}
                </p>
              </div>
            ) : null}

            {!isLoadingLessons && lessonOptions.length === 0 ? (
              <p className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground lg:col-span-2">
                Nenhuma aula com aluno ou turma foi encontrada para criar homework.
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleNewHomeworkPickerOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleStartNewHomework} disabled={!selectedLesson}>
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {createHomeworkLesson ? (
        <HomeworkPanel
          key={createHomeworkKey || createHomeworkLesson.id}
          lesson={createHomeworkLesson}
          mode="create-dialog"
          autoOpenCreateKey={createHomeworkKey}
          autoOpenHomework={editingHomeworkDraft}
          onCreateDialogClose={() => {
            setCreateHomeworkLesson(null);
            setEditingHomeworkDraft(null);
          }}
          onUpdated={() => {
            queryClient.invalidateQueries({ queryKey: ["teacher-homework"] });
            queryClient.invalidateQueries({ queryKey: ["teacher-lessons-for-homework"] });
          }}
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <div className="rounded-xl border border-border bg-card p-4 flex items-start gap-4">
          <div className="rounded-lg bg-blue-50 p-2 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
             <Inbox size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Novas Respostas</p>
            <h3 className="text-2xl font-bold">{pendingReviewCount}</h3>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 flex items-start gap-4">
          <div className="rounded-lg bg-slate-100 p-2 text-slate-700">
             <Clock size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Rascunhos</p>
            <h3 className="text-2xl font-bold">{draftCount}</h3>
          </div>
        </div>
      </div>

      <section className="mb-6 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <label className="text-sm font-semibold text-foreground">Buscar homework</label>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={homeworkSearchTerm}
                onChange={(event) => setHomeworkSearchTerm(event.target.value)}
                placeholder="Aluno, turma, título, aula, categoria..."
                className="h-11 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:w-[560px]">
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">Aluno ou turma</span>
              <select
                value={homeworkRecipientFilter}
                onChange={(event) => setHomeworkRecipientFilter(event.target.value)}
                className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
              >
                <option value="all">Todos</option>
                {homeworkRecipientOptions.map((recipient) => (
                  <option key={recipient.key} value={recipient.key}>
                    {recipient.name} ({recipient.count})
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">Categoria</span>
              <select
                value={homeworkClassificationFilter}
                onChange={(event) => setHomeworkClassificationFilter(event.target.value)}
                className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
              >
                <option value="all">Todas</option>
                {homeworkClassificationOptions.map((classification) => (
                  <option key={classification} value={classification}>
                    {classification}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">Correção</span>
              <select
                value={correctionTypeFilter}
                onChange={(event) => setCorrectionTypeFilter(event.target.value as CorrectionTypeFilter)}
                className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
              >
                <option value="all">Todas</option>
                <option value="auto">Automática</option>
                <option value="manual">Manual</option>
              </select>
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {statusFilterOptions.map((option) => {
              const active = homeworkStatusFilter === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setHomeworkStatusFilter(option.value)}
                  className={`shrink-0 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                    active
                      ? "border-sky-200 bg-sky-600 text-white shadow-sm"
                      : "border-border bg-background text-muted-foreground hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800"
                  }`}
                >
                  {option.label}
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] ${
                    active ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                  }`}>
                    {statusCounts[option.value]}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>
              {filteredHomeworkItems.length} de {homeworkItems.length} homework{homeworkItems.length === 1 ? "" : "s"}
            </span>
            {hasActiveHomeworkFilters ? (
              <Button type="button" variant="outline" size="sm" onClick={clearHomeworkFilters}>
                Limpar filtros
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Carregando atividades...</div>
        ) : filteredHomeworkItems.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            {hasActiveHomeworkFilters ? "Nenhuma homework encontrada com esses filtros." : "Nenhuma atividade encontrada."}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredHomeworkItems.map((item) => {
              const status = getHomeworkStatus(item);
              const isReady = item.status === "sent";

              return (
                <div key={item.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-muted/50 transition-colors">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusStyles[status]}`}>
                        {statusLabel[status]}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {item.status === "draft" ? "Para" : "Enviado por"} {item.student_name || item.group_name || "Desconhecido"}
                      </span>
                    </div>
                    <h4 className="font-semibold">{item.title}</h4>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Atualizado em {formatDate(item.updated_at || item.due_date)}
                    </p>
                  </div>
                  
                  <div>
                    {item.status === "draft" ? (
                      <Button onClick={() => void handleContinueDraft(item)} size="sm" disabled={openingHomeworkId === item.id}>
                        {openingHomeworkId === item.id ? "Carregando..." : "Continuar homework"}
                      </Button>
                    ) : isReady ? (
                      <Button onClick={() => void handleCorrect(item)} size="sm" disabled={openingHomeworkId === item.id}>
                        {openingHomeworkId === item.id ? "Carregando..." : "Avaliar"}
                      </Button>
                    ) : item.auto_correction_enabled && item.status === "corrected" ? (
                      <Button onClick={() => void handleCorrect(item)} size="sm" variant="outline" disabled={openingHomeworkId === item.id}>
                        {openingHomeworkId === item.id ? "Carregando..." : "Ver relatório"}
                      </Button>
                    ) : status === 'corrected' ? (
                      <Button onClick={() => void handleCorrect(item)} size="sm" variant="outline" disabled={openingHomeworkId === item.id}>
                        {openingHomeworkId === item.id ? "Carregando..." : "Ver Avaliação"}
                      </Button>
                    ) : (
                       <Button size="sm" variant="secondary" disabled>
                        Aguardando Aluno
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
