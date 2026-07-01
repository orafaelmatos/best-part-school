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
type ApiHomeworkStatus = "draft" | "pending" | "sent" | "corrected";
type UiHomeworkStatus = "pending" | "sent" | "late" | "corrected";

type HomeworkQuestion = {
  id: string;
  type: QuestionType;
  prompt: string;
  image_url?: string | null;
  audio_url?: string | null;
  audio_transcript?: string;
  options: string[];
  order: number;
};

type HomeworkAnswer = {
  id?: string;
  question: string;
  answer_text?: string;
  selected_option_index?: number | null;
  teacher_feedback?: string;
};

type HomeworkItem = {
  id: string;
  title: string;
  description?: string;
  classification?: string;
  status: ApiHomeworkStatus;
  due_date?: string | null;
  teacher_feedback?: string;
  teacher_name?: string;
  lesson_title?: string;
  questions: HomeworkQuestion[];
  answers?: HomeworkAnswer[];
};

const statusCopy: Record<UiHomeworkStatus, string> = {
  pending: "Pendente",
  sent: "Enviada",
  late: "Atrasada",
  corrected: "Corrigida",
};

const statusStyles: Record<UiHomeworkStatus, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  sent: "bg-blue-50 text-blue-700 border-blue-200",
  late: "bg-red-50 text-red-700 border-red-200",
  corrected: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const normalizeList = (data: any) => Array.isArray(data) ? data : (data?.results || []);

const getHomeworkStatus = (homework: HomeworkItem): UiHomeworkStatus => {
  if (homework.status === "corrected") return "corrected";
  if (homework.status === "sent") return "sent";
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
  const [answers, setAnswers] = useState<Record<string, HomeworkAnswer>>({});

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

  const pendingCount = homeworkItems.filter((item) => getHomeworkStatus(item) === "pending").length;

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

  const submitMutation = useMutation({
    mutationFn: async (homework: HomeworkItem) => {
      const payload = homework.questions.map((question) => ({
        question: question.id,
        answer_text: answers[question.id]?.answer_text || "",
        selected_option_index: answers[question.id]?.selected_option_index ?? null,
      }));
      return api.post(`/homework/${homework.id}/submit_answers/`, { answers: payload });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-homework"] });
      setSelectedHomework(null);
      setAnswers({});
    },
  });

  const openHomework = (homework: HomeworkItem) => {
    const currentAnswers: Record<string, HomeworkAnswer> = {};
    homework.answers?.forEach((answer) => {
      currentAnswers[answer.question] = answer;
    });
    setAnswers(currentAnswers);
    setSelectedHomework(homework);
  };

  if (selectedHomework) {
    const uiStatus = getHomeworkStatus(selectedHomework);
    const canAnswer = uiStatus === "pending" || uiStatus === "late" || uiStatus === "sent";

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
              </div>
              <h2 className="text-xl font-semibold">{selectedHomework.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedHomework.teacher_name || "Professor"} · entrega {formatDate(selectedHomework.due_date)}
              </p>
              {selectedHomework.description && <p className="mt-4 text-sm leading-6 whitespace-pre-wrap">{selectedHomework.description}</p>}
            </div>
          </div>

          <div className="space-y-4">
            {selectedHomework.questions.map((question, index) => (
              <div key={question.id} className="rounded-lg border border-border bg-background p-4">
                <p className="mb-3 whitespace-pre-wrap text-sm font-semibold leading-6">{index + 1}. {question.prompt}</p>
                <HomeworkQuestionMedia
                  className="mb-3"
                  imageUrl={question.image_url}
                  audioUrl={question.audio_url}
                />
                {canAnswer ? (
                  question.type === "open_text" ? (
                    <Textarea
                      value={answers[question.id]?.answer_text || ""}
                      onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: { ...current[question.id], question: question.id, answer_text: event.target.value } }))}
                      placeholder="Digite sua resposta..."
                    />
                  ) : (
                    <div className="space-y-2">
                      {question.options.map((option, optionIndex) => (
                        <label key={optionIndex} className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/50">
                          <input
                            type="radio"
                            name={`answer-${question.id}`}
                            checked={answers[question.id]?.selected_option_index === optionIndex}
                            onChange={() => setAnswers((current) => ({ ...current, [question.id]: { ...current[question.id], question: question.id, selected_option_index: optionIndex } }))}
                          />
                          <span className="whitespace-pre-wrap leading-6">{option}</span>
                        </label>
                      ))}
                    </div>
                  )
                ) : (
                  <AnswerPreview question={question} answer={answers[question.id]} />
                )}
                {uiStatus === "corrected" && answers[question.id]?.teacher_feedback && (
                  <p className="mt-3 rounded-lg bg-muted p-3 text-sm text-muted-foreground">Feedback: {answers[question.id].teacher_feedback}</p>
                )}
              </div>
            ))}
          </div>

          {uiStatus === "sent" && (
            <p className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              Você pode editar e reenviar este homework. O professor verá sempre a versão mais atual.
            </p>
          )}

          {uiStatus === "corrected" && selectedHomework.teacher_feedback && (
            <div className="rounded-lg border border-border bg-muted/50 p-4">
              <p className="text-sm font-semibold">Feedback geral do professor</p>
              <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{selectedHomework.teacher_feedback}</p>
            </div>
          )}

          {canAnswer && (
            <Button onClick={() => submitMutation.mutate(selectedHomework)} disabled={submitMutation.isPending}>
              <Send className="mr-2 h-4 w-4" /> {submitMutation.isPending ? "Enviando..." : uiStatus === "sent" ? "Atualizar atividade" : "Enviar atividade"}
            </Button>
          )}
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
          {(["all", "pending", "late", "corrected"] as const).map((status) => (
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
              <button key={homework.id} onClick={() => openHomework(homework)} className="text-left rounded-xl border border-border bg-card p-5 shadow-sm sidebar-transition hover:shadow-md">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="mb-2 flex flex-wrap gap-2">
                      <span className={`rounded-md border px-2 py-1 text-xs font-medium ${statusStyles[uiStatus]}`}>{statusCopy[uiStatus]}</span>
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

const AnswerPreview = ({ question, answer }: { question: HomeworkQuestion; answer?: HomeworkAnswer }) => {
  if (!answer) return <p className="text-sm text-muted-foreground">Sem resposta enviada.</p>;
  if (question.type === "multiple_choice") {
    const selected = answer.selected_option_index;
    return <p className="whitespace-pre-wrap text-sm leading-6">{selected === null || selected === undefined ? "Sem opção selecionada." : question.options[selected] || "Opção não encontrada."}</p>;
  }
  return <p className="whitespace-pre-wrap text-sm leading-6">{answer.answer_text || "Sem resposta enviada."}</p>;
};

export default Homework;
