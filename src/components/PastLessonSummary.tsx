import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import HomeworkQuestionMedia from "@/components/HomeworkQuestionMedia";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Focus,
  History,
  Lightbulb,
  MessageSquarePlus,
  Plus,
  Save,
  Sparkles,
  Star,
  X,
} from "lucide-react";

type Lesson = {
  id: string;
  title: string;
  date?: string;
  status: string;
  notes?: string;
  level?: string;
  teacher?: string;
  teacher_name?: string;
  student?: string;
  student_name?: string;
  new_words?: VocabularyCard[];
};

type HomeworkStatus = "draft" | "pending" | "sent" | "corrected";

type HomeworkQuestion = {
  id: string;
  type: "open_text" | "multiple_choice";
  prompt: string;
  image_url?: string | null;
  audio_url?: string | null;
  audio_transcript?: string;
  options: string[];
};

type HomeworkAnswer = {
  id: string;
  question: string;
  answer_text?: string;
  selected_option_index?: number | null;
  teacher_feedback?: string;
};

type Homework = {
  id: string;
  title: string;
  description?: string;
  classification?: string;
  status: HomeworkStatus;
  due_date?: string | null;
  teacher_feedback?: string;
  teacher?: string;
  student?: string;
  lesson?: string;
  lesson_title?: string;
  questions: HomeworkQuestion[];
  answers?: HomeworkAnswer[];
};

type VocabularyCard = {
  id: string;
  word: string;
  meaning: string;
  status?: "hard" | "medium" | "easy" | null;
  level?: string;
};

type PastLessonSummaryProps = {
  currentLesson?: Lesson | null;
  student?: { id: string; name?: string; email?: string } | null;
  buttonClassName?: string;
  buttonVariant?: "default" | "outline" | "ghost";
  compact?: boolean;
};

const normalizeList = (data: any) => Array.isArray(data) ? data : (data?.results || []);

const stripHtml = (value?: string) => {
  if (!value) return "";
  const element = document.createElement("div");
  element.innerHTML = value;
  return element.textContent || element.innerText || "";
};

const formatDate = (value?: string | null) => {
  if (!value) return "Sem data";
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getHomeworkLabel = (homework: Homework) => {
  if (homework.status === "corrected") return "Corrigida";
  if (homework.status === "sent") return "Enviada";
  if (homework.due_date && new Date(homework.due_date).getTime() < Date.now()) return "Atrasada";
  return "Pendente";
};

const getHomeworkTone = (homework: Homework) => {
  if (homework.status === "corrected") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (homework.status === "sent") return "bg-blue-50 text-blue-700 border-blue-200";
  if (homework.due_date && new Date(homework.due_date).getTime() < Date.now()) return "bg-red-50 text-red-700 border-red-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
};

const answerText = (question: HomeworkQuestion, answer?: HomeworkAnswer) => {
  if (!answer) return "Sem resposta enviada.";
  if (question.type === "multiple_choice") {
    const selected = answer.selected_option_index;
    return selected === null || selected === undefined ? "Sem opção selecionada." : question.options[selected] || "Opção não encontrada.";
  }
  return answer.answer_text || "Sem resposta enviada.";
};

const PastLessonSummary = ({ currentLesson, student, buttonClassName, buttonVariant = "outline", compact }: PastLessonSummaryProps) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* <Button type="button" variant={buttonVariant} className={buttonClassName} onClick={() => setOpen(true)}>
        <History className="mr-2 h-4 w-4" /> {compact ? "Resumo" : "Resumo Aula Passada"}
      </Button> */}
      {open && (
        <PastLessonSummaryModal
          currentLesson={currentLesson}
          student={student}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
};

const PastLessonSummaryModal = ({ currentLesson, student, onClose }: {
  currentLesson?: Lesson | null;
  student?: { id: string; name?: string; email?: string } | null;
  onClose: () => void;
}) => {
  const queryClient = useQueryClient();
  const [focusMode, setFocusMode] = useState(false);
  const [checklist, setChecklist] = useState({
    homework: false,
    vocabulary: false,
    errors: false,
    conversation: false,
    pronunciation: false,
  });
  const [notesDraft, setNotesDraft] = useState("");
  const [quickTask, setQuickTask] = useState("");
  const [newCard, setNewCard] = useState({ word: "", meaning: "" });
  const [answerFeedback, setAnswerFeedback] = useState<Record<string, string>>({});
  const [homeworkFeedback, setHomeworkFeedback] = useState<Record<string, string>>({});
  const [importantWords, setImportantWords] = useState<string[]>(() => JSON.parse(localStorage.getItem("summary:important-words") || "[]"));

  const studentId = currentLesson?.student || student?.id || "";
  const studentName = currentLesson?.student_name || student?.name || student?.email || "Aluno";

  const { data: lessons = [], isLoading: lessonsLoading } = useQuery({
    queryKey: ["summary-lessons", studentId],
    queryFn: async () => {
      const res = await api.get(`/lessons/?all=true&is_template=false&student=${studentId}`);
      return normalizeList(res.data) as Lesson[];
    },
    enabled: Boolean(studentId),
  });

  const sortedLessons = useMemo(() => {
    return lessons
      .filter((lesson) => lesson.date)
      .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [lessons]);

  const previousLesson = useMemo(() => {
    if (!sortedLessons.length) return null;
    if (!currentLesson?.date) return sortedLessons.find((lesson) => lesson.status === "completed") || sortedLessons[0];
    const currentTime = new Date(currentLesson.date).getTime();
    return sortedLessons.find((lesson) => lesson.id !== currentLesson.id && new Date(lesson.date || 0).getTime() < currentTime) || null;
  }, [currentLesson, sortedLessons]);

  const recentLessons = sortedLessons.slice(0, 5);

  const { data: homeworkItems = [], isLoading: homeworkLoading } = useQuery({
    queryKey: ["summary-homework", studentId],
    queryFn: async () => {
      const res = await api.get(`/homework/?student=${studentId}&ordering=due_date`);
      return normalizeList(res.data) as Homework[];
    },
    enabled: Boolean(open && studentId),
  });

  const previousHomework = useMemo(() => {
    if (!previousLesson) return [];
    return homeworkItems.filter((homework) => homework.lesson === previousLesson.id);
  }, [homeworkItems, previousLesson]);

  const studentHomework = useMemo(() => {
    return homeworkItems.filter((homework) => homework.status !== "draft");
  }, [homeworkItems]);

  const words = useMemo(() => {
    return recentLessons.flatMap((lesson) => (lesson.new_words || []).map((word) => ({
      ...word,
      lessonTitle: lesson.title,
      lessonDate: lesson.date,
    })));
  }, [recentLessons]);

  const weakWords = words.filter((word) => word.status === "hard" || word.status === "medium");
  const unreviewedWords = words.filter((word) => !word.status);
  const pendingHomework = studentHomework.filter((homework) => homework.status === "pending");
  const lateHomework = studentHomework.filter((homework) => homework.status !== "corrected" && homework.due_date && new Date(homework.due_date).getTime() < Date.now());
  const uncorrectedHomework = studentHomework.filter((homework) => homework.status === "sent");

  const alerts = [
    lateHomework.length > 0 ? `${lateHomework.length} atividade(s) atrasada(s).` : "",
    uncorrectedHomework.length > 0 ? `${uncorrectedHomework.length} atividade(s) aguardando correção.` : "",
    unreviewedWords.length > 3 ? `${unreviewedWords.length} palavra(s) ainda sem revisão.` : "",
    weakWords.length > 0 ? `${weakWords.length} palavra(s) precisam de reforço.` : "",
    previousLesson && !stripHtml(previousLesson.notes).trim() ? "A aula anterior não tem anotações registradas." : "",
  ].filter(Boolean);

  const autoSummary = useMemo(() => {
    const lastNotes = stripHtml(previousLesson?.notes).trim();
    const topics = previousLesson?.title || "último conteúdo";
    const wordsText = words.slice(0, 4).map((word) => word.word).join(", ");
    const pendingText = pendingHomework.length ? `${pendingHomework.length} tarefa(s) pendente(s)` : "sem tarefas pendentes";
    const reinforceText = weakWords.length ? `reforçar ${weakWords.slice(0, 3).map((word) => word.word).join(", ")}` : "manter revisão leve de vocabulário";
    return [
      `Último assunto: ${topics}.`,
      wordsText ? `Vocabulário recente: ${wordsText}.` : "Sem novos cards registrados nas últimas aulas.",
      `Homework: ${pendingText}.`,
      `Objetivo sugerido: ${reinforceText}.`,
      lastNotes ? `Notas anteriores: ${lastNotes.slice(0, 220)}${lastNotes.length > 220 ? "..." : ""}` : "",
    ].filter(Boolean).join("\n");
  }, [pendingHomework.length, previousLesson, weakWords, words]);

  const saveNotesMutation = useMutation({
    mutationFn: async () => {
      if (!previousLesson) return null;
      const nextNotes = notesDraft || previousLesson.notes || "";
      return api.patch(`/lessons/${previousLesson.id}/`, { notes: nextNotes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["summary-lessons", studentId] });
      queryClient.invalidateQueries({ queryKey: ["lesson", previousLesson?.id] });
      queryClient.invalidateQueries({ queryKey: ["lessons"] });
    },
  });

  const correctionMutation = useMutation({
    mutationFn: async (homework: Homework) => {
      await Promise.all(
        Object.entries(answerFeedback)
          .filter(([answerId]) => homework.answers?.some((answer) => answer.id === answerId))
          .map(([answerId, teacher_feedback]) => api.patch(`/homework-answers/${answerId}/`, { teacher_feedback }))
      );
      return api.patch(`/homework/${homework.id}/`, {
        ...homework,
        teacher_feedback: homeworkFeedback[homework.id] ?? homework.teacher_feedback ?? "",
        status: "corrected",
        questions: homework.questions,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["summary-homework", studentId] });
      queryClient.invalidateQueries({ queryKey: ["homework"] });
    },
  });

  const quickTaskMutation = useMutation({
    mutationFn: async () => {
      const targetLesson = currentLesson || previousLesson;
      if (!targetLesson || !quickTask.trim()) return null;
      return api.post("/homework/", {
        title: "Tarefa futura",
        description: quickTask,
        classification: "observação",
        status: "draft",
        due_date: null,
        teacher: targetLesson.teacher,
        student: targetLesson.student || studentId,
        lesson: targetLesson.id,
        questions: [{ type: "open_text", prompt: quickTask, options: [], correct_option_index: null, order: 0 }],
      });
    },
    onSuccess: () => {
      setQuickTask("");
      queryClient.invalidateQueries({ queryKey: ["summary-homework", studentId] });
      queryClient.invalidateQueries({ queryKey: ["homework"] });
    },
  });

  const cardMutation = useMutation({
    mutationFn: async () => {
      const targetLesson = currentLesson || previousLesson;
      if (!targetLesson || !newCard.word.trim() || !newCard.meaning.trim()) return null;
      return api.post("/new-words/", {
        word: newCard.word,
        meaning: newCard.meaning,
        level: targetLesson.level || previousLesson?.level || "A1/A2",
        lesson_id: targetLesson.id,
      });
    },
    onSuccess: () => {
      setNewCard({ word: "", meaning: "" });
      queryClient.invalidateQueries({ queryKey: ["summary-lessons", studentId] });
      queryClient.invalidateQueries({ queryKey: ["lesson", currentLesson?.id] });
      queryClient.invalidateQueries({ queryKey: ["lessons"] });
    },
  });

  const updateWordMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => api.patch(`/new-words/${id}/`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["summary-lessons", studentId] });
      queryClient.invalidateQueries({ queryKey: ["lessons"] });
    },
  });

  const toggleImportant = (wordId: string) => {
    const next = importantWords.includes(wordId) ? importantWords.filter((id) => id !== wordId) : [...importantWords, wordId];
    setImportantWords(next);
    localStorage.setItem("summary:important-words", JSON.stringify(next));
  };

  const dashboardCards = [
    { label: "Tarefas pendentes", value: pendingHomework.length },
    { label: "Sem correção", value: uncorrectedHomework.length },
    { label: "Palavras para revisar", value: weakWords.length + unreviewedWords.length },
    { label: "Aulas no histórico", value: recentLessons.length },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-foreground/20" onClick={onClose}>
      <div className="h-full w-full max-w-5xl overflow-y-auto bg-background shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-5 py-4 backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pré-aula</p>
              <h2 className="text-xl font-semibold">Resumo Aula Passada</h2>
              <p className="mt-1 text-sm text-muted-foreground">{studentName} · {previousLesson ? `última aula em ${formatDate(previousLesson.date)}` : "sem aula anterior encontrada"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant={focusMode ? "default" : "outline"} onClick={() => setFocusMode((value) => !value)}>
                <Focus className="mr-2 h-4 w-4" /> Modo foco
              </Button>
              <button onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X size={18} />
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6 p-5">
          {(lessonsLoading || homeworkLoading) && <p className="text-sm text-muted-foreground">Carregando resumo...</p>}

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {dashboardCards.map((card) => (
              <div key={card.label} className="rounded-xl border border-border bg-card p-4">
                <p className="text-2xl font-bold">{card.value}</p>
                <p className="text-sm text-muted-foreground">{card.label}</p>
              </div>
            ))}
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Continuar de onde parou</h3>
            </div>
            <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-muted p-4 text-sm font-sans leading-6 text-card-foreground">{autoSummary}</pre>
          </section>

          {alerts.length > 0 && (
            <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
              <div className="mb-3 flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4" /> Alertas inteligentes
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {alerts.map((alert) => <p key={alert} className="rounded-lg bg-white/70 p-3 text-sm">{alert}</p>)}
              </div>
            </section>
          )}

          <section className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" />
              <h3 className="font-semibold">Checklist pré-aula</h3>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {[
                ["homework", "revisar homework"],
                ["vocabulary", "revisar vocabulário"],
                ["errors", "corrigir erros anteriores"],
                ["conversation", "praticar conversação"],
                ["pronunciation", "revisar pronúncia"],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={checklist[key as keyof typeof checklist]}
                    onChange={(event) => setChecklist((current) => ({ ...current, [key]: event.target.checked }))}
                  />
                  {label}
                </label>
              ))}
            </div>
          </section>

          {!focusMode && (
            <section className="rounded-xl border border-border bg-card p-5">
              <div className="mb-4 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <h3 className="font-semibold">Anotações da aula anterior</h3>
              </div>
              {previousLesson ? (
                <div className="space-y-3">
                  <Textarea
                    value={notesDraft || previousLesson.notes || ""}
                    onChange={(event) => setNotesDraft(event.target.value)}
                    className="min-h-[160px]"
                    placeholder="Resumo do que foi ensinado, dificuldades, pontos importantes e próximos tópicos..."
                  />
                  <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
                    <input
                      value={quickTask}
                      onChange={(event) => setQuickTask(event.target.value)}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      placeholder="Transformar observação em tarefa futura..."
                    />
                    <Button variant="outline" onClick={() => quickTaskMutation.mutate()} disabled={!quickTask.trim() || quickTaskMutation.isPending}>
                      <MessageSquarePlus className="mr-2 h-4 w-4" /> Criar tarefa
                    </Button>
                    <Button onClick={() => saveNotesMutation.mutate()} disabled={saveNotesMutation.isPending}>
                      <Save className="mr-2 h-4 w-4" /> Salvar notas
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma aula anterior concluída foi encontrada para este aluno.</p>
              )}
            </section>
          )}

          <section className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              <h3 className="font-semibold">Lição de casa</h3>
            </div>
            <div className="space-y-4">
              {(previousHomework.length ? previousHomework : studentHomework.slice(0, 4)).map((homework) => (
                <HomeworkCorrectionCard
                  key={homework.id}
                  homework={homework}
                  answerFeedback={answerFeedback}
                  homeworkFeedback={homeworkFeedback}
                  setAnswerFeedback={setAnswerFeedback}
                  setHomeworkFeedback={setHomeworkFeedback}
                  onCorrect={() => correctionMutation.mutate(homework)}
                  isSaving={correctionMutation.isPending}
                />
              ))}
              {studentHomework.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma atividade encontrada para o aluno.</p>}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4" />
                <h3 className="font-semibold">Palavras e expressões aprendidas</h3>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <input value={newCard.word} onChange={(event) => setNewCard((current) => ({ ...current, word: event.target.value }))} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="Novo card" />
                <input value={newCard.meaning} onChange={(event) => setNewCard((current) => ({ ...current, meaning: event.target.value }))} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="Tradução/explicação" />
                <Button onClick={() => cardMutation.mutate()} disabled={!newCard.word.trim() || !newCard.meaning.trim() || cardMutation.isPending}>
                  <Plus className="mr-2 h-4 w-4" /> Criar
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {words.slice(0, 9).map((word) => {
                const needsReinforcement = word.status === "hard";
                const lowReview = !word.status || word.status === "medium";
                return (
                  <div key={word.id} className="rounded-lg border border-border p-4">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{word.word}</p>
                        <p className="text-sm text-muted-foreground">{word.meaning}</p>
                      </div>
                      <button onClick={() => toggleImportant(word.id)} className={`rounded-md p-1.5 ${importantWords.includes(word.id) ? "bg-amber-100 text-amber-700" : "text-muted-foreground hover:bg-muted"}`}>
                        <Star size={15} fill={importantWords.includes(word.id) ? "currentColor" : "none"} />
                      </button>
                    </div>
                    <div className="mb-3 flex flex-wrap gap-2">
                      {lowReview && <span className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">Pouco revisado</span>}
                      {needsReinforcement && <span className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">Precisa reforço</span>}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <button onClick={() => updateWordMutation.mutate({ id: word.id, status: "hard" })} className="rounded-md bg-red-50 px-2 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100">Difícil</button>
                      <button onClick={() => updateWordMutation.mutate({ id: word.id, status: "medium" })} className="rounded-md bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100">Médio</button>
                      <button onClick={() => updateWordMutation.mutate({ id: word.id, status: "easy" })} className="rounded-md bg-emerald-50 px-2 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100">Fácil</button>
                    </div>
                  </div>
                );
              })}
              {words.length === 0 && <p className="text-sm text-muted-foreground">Nenhum card encontrado nas últimas aulas.</p>}
            </div>
          </section>

          {!focusMode && (
            <section className="rounded-xl border border-border bg-card p-5">
              <div className="mb-4 flex items-center gap-2">
                <History className="h-4 w-4" />
                <h3 className="font-semibold">Histórico e continuidade</h3>
              </div>
              <div className="space-y-3">
                {recentLessons.map((lesson) => (
                  <div key={lesson.id} className="rounded-lg border border-border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{lesson.title}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(lesson.date)}</p>
                      </div>
                      <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{lesson.status}</span>
                    </div>
                    {lesson.notes && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{stripHtml(lesson.notes)}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

const HomeworkCorrectionCard = ({ homework, answerFeedback, homeworkFeedback, setAnswerFeedback, setHomeworkFeedback, onCorrect, isSaving }: {
  homework: Homework;
  answerFeedback: Record<string, string>;
  homeworkFeedback: Record<string, string>;
  setAnswerFeedback: Dispatch<SetStateAction<Record<string, string>>>;
  setHomeworkFeedback: Dispatch<SetStateAction<Record<string, string>>>;
  onCorrect: () => void;
  isSaving: boolean;
}) => {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            <span className={`rounded-md border px-2 py-1 text-xs font-medium ${getHomeworkTone(homework)}`}>{getHomeworkLabel(homework)}</span>
            {homework.classification && <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{homework.classification}</span>}
            {homework.status === "sent" && <span className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">Resposta sem correção</span>}
          </div>
          <p className="font-semibold">{homework.title}</p>
          <p className="text-xs text-muted-foreground">Entrega: {formatDate(homework.due_date)} · {homework.lesson_title || "Aula"}</p>
        </div>
        <Button onClick={onCorrect} disabled={isSaving || homework.status === "pending"} size="sm">
          <CheckCircle2 className="mr-2 h-4 w-4" /> Salvar correção
        </Button>
      </div>

      <div className="space-y-3">
        {homework.questions.map((question, index) => {
          const answer = homework.answers?.find((item) => item.question === question.id);
          return (
            <div key={question.id} className="rounded-lg border border-border p-3">
              <p className="whitespace-pre-wrap text-sm font-medium leading-6">{index + 1}. {question.prompt}</p>
              <HomeworkQuestionMedia className="mt-2" imageUrl={question.image_url} audioUrl={question.audio_url} />
              <p className="mt-2 whitespace-pre-wrap rounded-md bg-muted p-3 text-sm leading-6">{answerText(question, answer)}</p>
              {answer?.id && (
                <Textarea
                  className="mt-2"
                  placeholder="Feedback da resposta..."
                  value={answerFeedback[answer.id] ?? answer.teacher_feedback ?? ""}
                  onChange={(event) => setAnswerFeedback((current) => ({ ...current, [answer.id]: event.target.value }))}
                />
              )}
            </div>
          );
        })}
      </div>

      <Textarea
        className="mt-3"
        placeholder="Feedback geral, observações e nota opcional..."
        value={homeworkFeedback[homework.id] ?? homework.teacher_feedback ?? ""}
        onChange={(event) => setHomeworkFeedback((current) => ({ ...current, [homework.id]: event.target.value }))}
      />
    </div>
  );
};

export default PastLessonSummary;
