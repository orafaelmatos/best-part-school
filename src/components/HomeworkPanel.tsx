import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import HomeworkQuestionMedia from "@/components/HomeworkQuestionMedia";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { BookOpen, Copy, GripVertical, Headphones, Image as ImageIcon, Plus, Save, Send, Trash2, X } from "lucide-react";

type QuestionType = "open_text" | "multiple_choice";
type HomeworkStatus = "draft" | "pending" | "in_progress" | "sent" | "corrected";

type ReserveQuestion = {
  type: QuestionType;
  prompt: string;
  options: string[];
  correct_option_index: number | null;
  reference_answer?: string;
  explanation?: string;
};

type HomeworkQuestion = {
  id?: string;
  type: QuestionType;
  prompt: string;
  image?: File | string | null;
  image_url?: string | null;
  image_path?: string;
  image_file?: File | null;
  remove_image?: boolean;
  audio?: File | string | null;
  audio_url?: string | null;
  audio_path?: string;
  audio_file?: File | null;
  audio_transcript?: string;
  remove_audio?: boolean;
  options: string[];
  correct_option_index: number | null;
  reference_answer?: string;
  correction_instructions?: string;
  explanation?: string;
  second_chance_mode?: "none" | "reserve";
  reserve_question?: ReserveQuestion | null;
  has_reserve_question?: boolean;
  order: number;
};

type Homework = {
  id: string;
  title: string;
  description?: string;
  classification?: string;
  status: HomeworkStatus;
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
  } | null;
  teacher?: string;
  student?: string;
  lesson?: string;
  questions: HomeworkQuestion[];
  answers?: HomeworkAnswer[];
};

type HomeworkAnswer = {
  id: string;
  question: string;
  answer_text?: string;
  selected_option_index?: number | null;
  teacher_feedback?: string;
};

type HomeworkTemplate = {
  id: string;
  title: string;
  description?: string;
  classification?: string;
  questions: HomeworkQuestion[];
};

const emptyQuestion = (order: number): HomeworkQuestion => ({
  type: "open_text",
  prompt: "",
  image: null,
  image_url: "",
  image_path: "",
  image_file: null,
  remove_image: false,
  audio: null,
  audio_url: "",
  audio_path: "",
  audio_file: null,
  audio_transcript: "",
  remove_audio: false,
  options: ["", ""],
  correct_option_index: null,
  reference_answer: "",
  correction_instructions: "",
  explanation: "",
  second_chance_mode: "reserve",
  reserve_question: null,
  has_reserve_question: false,
  order,
});

const emptyForm = (lesson: any): Partial<Homework> & { questions: HomeworkQuestion[] } => ({
  title: "",
  description: "",
  classification: "",
  status: "draft",
  auto_correction_enabled: true,
  due_date: "",
  teacher: lesson.teacher,
  student: lesson.student,
  lesson: lesson.id,
  questions: [emptyQuestion(0)],
});

const statusLabel: Record<HomeworkStatus, string> = {
  draft: "Rascunho",
  pending: "Pendente",
  in_progress: "Em andamento",
  sent: "Enviada",
  corrected: "Corrigida",
};

const normalizeDateInput = (value?: string | null) => {
  if (!value) return "";
  return value.slice(0, 16);
};

const buildPayload = (form: Partial<Homework> & { questions: HomeworkQuestion[] }, status: HomeworkStatus) => {
  const payload = new FormData();
  payload.append("title", form.title || "Lição de Casa sem título");
  payload.append("description", form.description || "");
  payload.append("classification", form.classification || "");
  payload.append("status", status);
  payload.append("auto_correction_enabled", String(form.auto_correction_enabled ?? true));
  payload.append("due_date", form.due_date ? new Date(form.due_date).toISOString() : "");
  if (form.teacher) payload.append("teacher", form.teacher);
  if (form.student) payload.append("student", form.student);
  if (form.lesson) payload.append("lesson", form.lesson);

  const questions = form.questions.map((question, index) => {
    if (question.image_file) {
      payload.append(`question_image_${index}`, question.image_file);
    }
    if (question.audio_file) {
      payload.append(`question_audio_${index}`, question.audio_file);
    }
    return {
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      image_path: question.remove_image ? "" : (question.image_path || ""),
      image_url: question.remove_image ? "" : (question.image_url || ""),
      remove_image: Boolean(question.remove_image),
      audio_path: question.remove_audio ? "" : (question.audio_path || ""),
      audio_url: question.remove_audio ? "" : (question.audio_url || ""),
      audio_transcript: question.audio_transcript || "",
      remove_audio: Boolean(question.remove_audio),
      options: question.type === "multiple_choice" ? question.options.filter(Boolean) : [],
      correct_option_index: question.type === "multiple_choice" ? question.correct_option_index : null,
      reference_answer: question.reference_answer || "",
      correction_instructions: question.correction_instructions || "",
      explanation: question.explanation || "",
      second_chance_mode: question.second_chance_mode === "none" ? "none" : "reserve",
      reserve_question: question.reserve_question ? {
        type: question.reserve_question.type,
        prompt: question.reserve_question.prompt,
        options: question.reserve_question.type === "multiple_choice" ? question.reserve_question.options.filter(Boolean) : [],
        correct_option_index: question.reserve_question.type === "multiple_choice" ? question.reserve_question.correct_option_index : null,
        reference_answer: question.reserve_question.reference_answer || "",
        explanation: question.reserve_question.explanation || "",
      } : null,
      order: index,
    };
  });

  payload.append("questions_payload", JSON.stringify(questions));
  return payload;
};

export const HomeworkPanel = ({ lesson, onUpdated }: { lesson: any; onUpdated?: () => void }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isTeacher = user?.role === "teacher" || user?.role === "admin";
  const isStudent = user?.role === "student";
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Homework | null>(null);
  const [form, setForm] = useState(emptyForm(lesson));

  const { data: homeworkItems = [] } = useQuery({
    queryKey: ["homework", lesson.id],
    queryFn: async () => {
      const res = await api.get(`/homework/?lesson=${lesson.id}`);
      return Array.isArray(res.data) ? res.data : (res.data.results || []);
    },
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["homework-templates"],
    queryFn: async () => {
      const res = await api.get("/homework-templates/");
      return Array.isArray(res.data) ? res.data : (res.data.results || []);
    },
    enabled: isTeacher,
  });

  useEffect(() => {
    setForm(emptyForm(lesson));
  }, [lesson.id]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["homework", lesson.id] });
    queryClient.invalidateQueries({ queryKey: ["homework-templates"] });
    onUpdated?.();
  };

  const saveMutation = useMutation({
    mutationFn: async (status: HomeworkStatus) => {
      const payload = buildPayload(form, status);
      if (editing) {
        const res = await api.put(`/homework/${editing.id}/`, payload);
        return res.data;
      }
      const res = await api.post("/homework/", payload);
      return res.data;
    },
    onSuccess: () => {
      refresh();
      setOpen(false);
      setEditing(null);
      setForm(emptyForm(lesson));
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (homeworkId: string) => api.post(`/homework/${homeworkId}/duplicate/`),
    onSuccess: refresh,
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async (homeworkId: string) => api.post(`/homework/${homeworkId}/save_template/`),
    onSuccess: refresh,
  });

  const openEditor = (homework?: Homework) => {
    if (homework) {
      setEditing(homework);
      setForm({
        ...homework,
        due_date: normalizeDateInput(homework.due_date),
        questions: homework.questions.length
          ? homework.questions.map((question, index) => ({
              ...emptyQuestion(index),
              ...question,
              options: question.type === "multiple_choice" && question.options.length ? question.options : ["", ""],
              reserve_question: question.reserve_question ? {
                type: question.reserve_question.type || "open_text",
                prompt: question.reserve_question.prompt || "",
                options: question.reserve_question.type === "multiple_choice" && question.reserve_question.options?.length ? question.reserve_question.options : ["", ""],
                correct_option_index: question.reserve_question.correct_option_index ?? null,
                reference_answer: question.reserve_question.reference_answer || "",
                explanation: question.reserve_question.explanation || "",
              } : null,
              order: question.order ?? index,
              image_file: null,
              audio_file: null,
              remove_image: false,
              remove_audio: false,
            }))
          : [emptyQuestion(0)],
      });
    } else {
      setEditing(null);
      setForm(emptyForm(lesson));
    }
    setOpen(true);
  };

  const updateQuestion = (index: number, patch: Partial<HomeworkQuestion>) => {
    setForm((current) => ({
      ...current,
      questions: current.questions.map((question, questionIndex) => questionIndex === index ? { ...question, ...patch } : question),
    }));
  };

  const moveQuestion = (from: number, to: number) => {
    if (to < 0 || to >= form.questions.length) return;
    const next = [...form.questions];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setForm((current) => ({ ...current, questions: next.map((question, index) => ({ ...question, order: index })) }));
  };

  const applyTemplate = (templateId: string) => {
    const template = templates.find((item: HomeworkTemplate) => item.id === templateId);
    if (!template) return;
    setForm((current) => ({
      ...current,
      title: template.title,
      description: template.description || "",
      classification: template.classification || "",
      questions: template.questions.length
        ? template.questions.map((question, index) => ({
            ...emptyQuestion(index),
            ...question,
            options: question.type === "multiple_choice" && question.options.length ? question.options : ["", ""],
            reserve_question: question.reserve_question ? {
              type: question.reserve_question.type || "open_text",
              prompt: question.reserve_question.prompt || "",
              options: question.reserve_question.type === "multiple_choice" && question.reserve_question.options?.length ? question.reserve_question.options : ["", ""],
              correct_option_index: question.reserve_question.correct_option_index ?? null,
              reference_answer: question.reserve_question.reference_answer || "",
              explanation: question.reserve_question.explanation || "",
            } : null,
            order: index,
            image_file: null,
            audio_file: null,
            remove_image: false,
            remove_audio: false,
          }))
        : [emptyQuestion(0)],
    }));
  };

  return (
    <div className="bg-card p-6 border border-border rounded-xl shadow-sm space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <BookOpen size={16} /> Lição de Casa
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Atividades vinculadas a esta aula.</p>
        </div>
        {isTeacher && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => openEditor()}>
                <Plus className="mr-2 h-4 w-4" /> Criar Lição de Casa
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar Lição de Casa" : "Criar Lição de Casa"}</DialogTitle>
              </DialogHeader>
              <HomeworkEditor
                form={form}
                templates={templates}
                onApplyTemplate={applyTemplate}
                onChange={setForm}
                onQuestionChange={updateQuestion}
                onMoveQuestion={moveQuestion}
              />
              <div className="flex flex-wrap justify-end gap-2 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => saveMutation.mutate("draft")} disabled={saveMutation.isPending}>
                  <Save className="mr-2 h-4 w-4" /> Salvar rascunho
                </Button>
                <Button onClick={() => saveMutation.mutate("pending")} disabled={saveMutation.isPending}>
                  <Send className="mr-2 h-4 w-4" /> Disponibilizar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {homeworkItems.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma Lição de Casa criada para esta aula.</p>
      ) : (
        <div className="space-y-3">
          {homeworkItems.map((homework: Homework) => (
            <HomeworkCard
              key={homework.id}
              homework={homework}
              isTeacher={isTeacher}
              isStudent={isStudent}
              onEdit={() => openEditor(homework)}
              onDuplicate={() => duplicateMutation.mutate(homework.id)}
              onSaveTemplate={() => saveTemplateMutation.mutate(homework.id)}
              onRefresh={refresh}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const HomeworkEditor = ({ form, templates, onApplyTemplate, onChange, onQuestionChange, onMoveQuestion }: {
  form: Partial<Homework> & { questions: HomeworkQuestion[] };
  templates: HomeworkTemplate[];
  onApplyTemplate: (templateId: string) => void;
  onChange: (form: Partial<Homework> & { questions: HomeworkQuestion[] }) => void;
  onQuestionChange: (index: number, patch: Partial<HomeworkQuestion>) => void;
  onMoveQuestion: (from: number, to: number) => void;
}) => {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      {templates.length > 0 && (
        <div>
          <label className="block text-sm font-medium mb-1">Reutilizar lição antiga</label>
          <select className="w-full p-2 border border-border rounded-lg bg-background text-sm" defaultValue="" onChange={(event) => onApplyTemplate(event.target.value)}>
            <option value="" disabled>Selecione uma Lição de Casa salva</option>
            {templates.map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Título</label>
          <input className="w-full p-2 border border-border rounded-lg bg-background text-sm" value={form.title || ""} onChange={(event) => onChange({ ...form, title: event.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Classificação</label>
          <input className="w-full p-2 border border-border rounded-lg bg-background text-sm" placeholder="Gramática, leitura, escrita..." value={form.classification || ""} onChange={(event) => onChange({ ...form, classification: event.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Prazo</label>
          <input type="datetime-local" className="w-full p-2 border border-border rounded-lg bg-background text-sm" value={form.due_date || ""} onChange={(event) => onChange({ ...form, due_date: event.target.value })} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Descrição / instruções</label>
        <Textarea value={form.description || ""} onChange={(event) => onChange({ ...form, description: event.target.value })} />
      </div>

      <label className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
        <input
          type="checkbox"
          checked={Boolean(form.auto_correction_enabled)}
          onChange={(event) => onChange({ ...form, auto_correction_enabled: event.target.checked })}
          className="h-4 w-4"
        />
        <p className="text-sm font-medium">Correção automática por questão</p>
      </label>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Perguntas</h3>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...form, questions: [...form.questions, emptyQuestion(form.questions.length)] })}>
            <Plus className="mr-2 h-4 w-4" /> Adicionar pergunta
          </Button>
        </div>

        {form.questions.map((question, index) => (
          <div
            key={question.id || index}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (dragIndex !== null) onMoveQuestion(dragIndex, index);
              setDragIndex(null);
            }}
            className="space-y-4 rounded-xl border border-border bg-card p-4"
          >
            <div className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" />
              <select className="rounded-full border border-border bg-background px-4 py-2 text-sm" value={question.type} onChange={(event) => onQuestionChange(index, { type: event.target.value as QuestionType })}>
                <option value="open_text">Pergunta aberta</option>
                <option value="multiple_choice">Múltipla escolha</option>
              </select>
              <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => onChange({ ...form, questions: form.questions.filter((_, questionIndex) => questionIndex !== index) })}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <Textarea placeholder={`Pergunta ${index + 1}`} value={question.prompt} onChange={(event) => onQuestionChange(index, { prompt: event.target.value })} />
            <QuestionAttachmentsEditor
              question={question}
              onChange={(patch) => onQuestionChange(index, patch)}
            />
            {question.type === "multiple_choice" && (
              <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Alternativas</p>
                {question.options.map((option, optionIndex) => (
                  <div key={optionIndex} className="flex items-center gap-2">
                    <input type="radio" name={`correct-${index}`} checked={question.correct_option_index === optionIndex} onChange={() => onQuestionChange(index, { correct_option_index: optionIndex })} />
                    <input className="flex-1 p-2 border border-border rounded-lg bg-background text-sm" placeholder={`Opção ${optionIndex + 1}`} value={option} onChange={(event) => {
                      const nextOptions = [...question.options];
                      nextOptions[optionIndex] = event.target.value;
                      onQuestionChange(index, { options: nextOptions });
                    }} />
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => onQuestionChange(index, { options: [...question.options, ""] })}>Adicionar opção</Button>
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Gabarito
                </label>
                <Textarea
                  value={question.reference_answer || ""}
                  onChange={(event) => onQuestionChange(index, { reference_answer: event.target.value })}
                  placeholder="Resposta esperada"
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Feedback curto
                </label>
                <Textarea
                  value={question.explanation || ""}
                  onChange={(event) => onQuestionChange(index, { explanation: event.target.value })}
                  placeholder="Mensagem mostrada quando o aluno errar"
                  rows={2}
                />
              </div>
            </div>

            {form.auto_correction_enabled ? (
              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Segunda chance
                  </label>
                  <select
                    className="mt-2 w-full rounded-lg border border-border bg-background p-2 text-sm"
                    value={question.second_chance_mode === "none" ? "none" : "reserve"}
                    onChange={(event) => onQuestionChange(index, {
                      second_chance_mode: event.target.value as HomeworkQuestion["second_chance_mode"],
                      reserve_question: event.target.value === "reserve"
                        ? question.reserve_question || { type: "open_text", prompt: "", options: ["", ""], correct_option_index: null, reference_answer: "", explanation: "" }
                        : question.reserve_question,
                    })}
                  >
                    <option value="reserve">Usar questão reserva</option>
                    <option value="none">Sem segunda chance</option>
                  </select>
                </div>

                {question.second_chance_mode === "reserve" ? (
                  <ReserveQuestionEditor
                    namePrefix={`reserve-${index}`}
                    reserveQuestion={question.reserve_question}
                    onChange={(reserveQuestion) => onQuestionChange(index, { reserve_question: reserveQuestion })}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
};

const HomeworkCard = ({ homework, isTeacher, isStudent, onEdit, onDuplicate, onSaveTemplate, onRefresh }: {
  homework: Homework;
  isTeacher: boolean;
  isStudent: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onSaveTemplate: () => void;
  onRefresh: () => void;
}) => {
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, HomeworkAnswer>>({});
  const [feedback, setFeedback] = useState(homework.teacher_feedback || "");
  const [answerFeedback, setAnswerFeedback] = useState<Record<string, string>>({});

  useEffect(() => {
    const nextAnswers: Record<string, HomeworkAnswer> = {};
    const nextFeedback: Record<string, string> = {};
    homework.answers?.forEach((answer) => {
      nextAnswers[answer.question] = answer;
      nextFeedback[answer.id] = answer.teacher_feedback || "";
    });
    setAnswers(nextAnswers);
    setAnswerFeedback(nextFeedback);
    setFeedback(homework.teacher_feedback || "");
  }, [homework]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const payload = homework.questions.map((question) => ({
        question: question.id,
        answer_text: answers[question.id || ""]?.answer_text || "",
        selected_option_index: answers[question.id || ""]?.selected_option_index ?? null,
      }));
      return api.post(`/homework/${homework.id}/submit_answers/`, { answers: payload });
    },
    onSuccess: onRefresh,
  });

  const correctMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(Object.entries(answerFeedback).map(([answerId, teacherFeedback]) => api.patch(`/homework-answers/${answerId}/`, { teacher_feedback: teacherFeedback })));
      return api.patch(`/homework/${homework.id}/`, { ...homework, teacher_feedback: feedback, status: "corrected", questions: homework.questions });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["homework"] });
      onRefresh();
    },
  });

  const dueDate = homework.due_date ? new Date(homework.due_date).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Sem prazo";

  return (
    <div className="border border-border rounded-lg p-4 bg-background space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{homework.title}</h3>
            <span className="px-2 py-1 rounded-md bg-secondary text-secondary-foreground text-xs">{statusLabel[homework.status]}</span>
            {homework.classification && <span className="px-2 py-1 rounded-md bg-muted text-muted-foreground text-xs">{homework.classification}</span>}
          </div>
          <p className="text-sm text-muted-foreground mt-1">Prazo: {dueDate}</p>
          {homework.description && <p className="text-sm mt-2 whitespace-pre-wrap">{homework.description}</p>}
        </div>
        {isTeacher && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onEdit}>Editar</Button>
            <Button variant="outline" size="sm" onClick={onDuplicate}><Copy className="mr-2 h-4 w-4" />Duplicar</Button>
            <Button variant="outline" size="sm" onClick={onSaveTemplate}>Salvar modelo</Button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {homework.questions.map((question, index) => {
          const answer = answers[question.id || ""];
          return (
            <div key={question.id || index} className="rounded-lg border border-border p-3">
              <p className="mb-2 whitespace-pre-wrap text-sm font-medium leading-6">{index + 1}. {question.prompt}</p>
              <HomeworkQuestionMedia
                className="mb-3"
                imageUrl={question.image_url}
                audioUrl={question.audio_url}
              />
              {isStudent && homework.status !== "corrected" ? (
                question.type === "open_text" ? (
                  <Textarea value={answer?.answer_text || ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.id || ""]: { ...answer, question: question.id || "", id: answer?.id || "", answer_text: event.target.value } }))} />
                ) : (
                  <div className="space-y-2">
                    {question.options.map((option, optionIndex) => (
                      <label key={optionIndex} className="flex items-start gap-2 text-sm">
                        <input type="radio" name={`answer-${homework.id}-${question.id}`} checked={answer?.selected_option_index === optionIndex} onChange={() => setAnswers((current) => ({ ...current, [question.id || ""]: { ...answer, question: question.id || "", id: answer?.id || "", selected_option_index: optionIndex } }))} />
                        <span className="whitespace-pre-wrap leading-6">{option}</span>
                      </label>
                    ))}
                  </div>
                )
              ) : (
                <AnswerPreview question={question} answer={answer} />
              )}
              {answer?.teacher_feedback && <p className="text-sm text-muted-foreground mt-2">Comentário: {answer.teacher_feedback}</p>}
              {isTeacher && answer?.id && (
                <Textarea className="mt-2" placeholder="Comentário do professor" value={answerFeedback[answer.id] || ""} onChange={(event) => setAnswerFeedback((current) => ({ ...current, [answer.id]: event.target.value }))} />
              )}
            </div>
          );
        })}
      </div>

      {isStudent && homework.status !== "corrected" && (
        <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}>
          <Send className="mr-2 h-4 w-4" /> Enviar Lição de Casa
        </Button>
      )}

      {isTeacher && (homework.status === "sent" || homework.status === "corrected") && (
        <div className="space-y-2">
          <Textarea placeholder="Feedback geral" value={feedback} onChange={(event) => setFeedback(event.target.value)} />
          <Button onClick={() => correctMutation.mutate()} disabled={correctMutation.isPending}>Marcar como corrigida</Button>
        </div>
      )}
    </div>
  );
};

const AnswerPreview = ({ question, answer }: { question: HomeworkQuestion; answer?: HomeworkAnswer }) => {
  const text = useMemo(() => {
    if (!answer) return "Sem resposta enviada.";
    if (question.type === "multiple_choice") {
      const selected = answer.selected_option_index;
      return selected === null || selected === undefined ? "Sem opção selecionada." : question.options[selected] || "Opção não encontrada.";
    }
    return answer.answer_text || "Sem resposta enviada.";
  }, [answer, question]);

  return <p className="whitespace-pre-wrap text-sm leading-6 text-card-foreground">{text}</p>;
};

const ReserveQuestionEditor = ({
  namePrefix,
  reserveQuestion,
  onChange,
}: {
  namePrefix: string;
  reserveQuestion?: ReserveQuestion | null;
  onChange: (reserveQuestion: ReserveQuestion) => void;
}) => {
  const value = reserveQuestion || {
    type: "open_text" as const,
    prompt: "",
    options: ["", ""],
    correct_option_index: null,
    reference_answer: "",
    explanation: "",
  };

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
      <p className="text-sm font-medium">Questão reserva</p>
      <select
        className="w-full rounded-lg border border-border bg-background p-2 text-sm"
        value={value.type}
        onChange={(event) => onChange({
          ...value,
          type: event.target.value as QuestionType,
          options: event.target.value === "multiple_choice" ? (value.options.length ? value.options : ["", ""]) : [],
          correct_option_index: event.target.value === "multiple_choice" ? value.correct_option_index : null,
        })}
      >
        <option value="open_text">Pergunta aberta</option>
        <option value="multiple_choice">Múltipla escolha</option>
      </select>

      <Textarea
        value={value.prompt}
        onChange={(event) => onChange({ ...value, prompt: event.target.value })}
        placeholder="Pergunta da segunda tentativa"
      />

      {value.type === "multiple_choice" ? (
        <div className="space-y-2">
          {value.options.map((option, optionIndex) => (
            <div key={optionIndex} className="flex items-center gap-2">
              <input
                type="radio"
                name={`${namePrefix}-correct`}
                checked={value.correct_option_index === optionIndex}
                onChange={() => onChange({ ...value, correct_option_index: optionIndex })}
              />
              <input
                className="flex-1 rounded-lg border border-border bg-background p-2 text-sm"
                value={option}
                onChange={(event) => {
                  const nextOptions = [...value.options];
                  nextOptions[optionIndex] = event.target.value;
                  onChange({ ...value, options: nextOptions });
                }}
                placeholder={`Opção ${optionIndex + 1}`}
              />
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...value, options: [...value.options, ""] })}>
            Adicionar opção
          </Button>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <Textarea
          value={value.reference_answer || ""}
          onChange={(event) => onChange({ ...value, reference_answer: event.target.value })}
          placeholder="Gabarito da questão reserva"
          rows={2}
        />
        <Textarea
          value={value.explanation || ""}
          onChange={(event) => onChange({ ...value, explanation: event.target.value })}
          placeholder="Feedback curto da questão reserva"
          rows={2}
        />
      </div>
    </div>
  );
};

const QuestionAttachmentsEditor = ({
  question,
  onChange,
}: {
  question: HomeworkQuestion;
  onChange: (patch: Partial<HomeworkQuestion>) => void;
}) => {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!question.image_file) {
      setImagePreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(question.image_file);
    setImagePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [question.image_file]);

  useEffect(() => {
    if (!question.audio_file) {
      setAudioPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(question.audio_file);
    setAudioPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [question.audio_file]);

  const currentImageUrl = question.remove_image ? "" : (imagePreviewUrl || question.image_url || "");
  const currentAudioUrl = question.remove_audio ? "" : (audioPreviewUrl || question.audio_url || "");

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-border bg-background p-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Imagem da pergunta</p>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0] || null;
              onChange({
                image_file: file,
                image_path: file ? "" : question.image_path || "",
                image_url: file ? "" : question.image_url || "",
                remove_image: false,
              });
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => imageInputRef.current?.click()}>
              <ImageIcon className="mr-2 h-4 w-4" /> {currentImageUrl ? "Trocar imagem" : "Adicionar imagem"}
            </Button>
            {currentImageUrl ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange({ image_file: null, image_path: "", image_url: "", remove_image: true })}
              >
                <X className="mr-2 h-4 w-4" /> Remover
              </Button>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Áudio da pergunta</p>
          <input
            ref={audioInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0] || null;
              onChange({
                audio_file: file,
                audio_path: file ? "" : question.audio_path || "",
                audio_url: file ? "" : question.audio_url || "",
                audio_transcript: file ? "" : question.audio_transcript || "",
                remove_audio: false,
              });
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => audioInputRef.current?.click()}>
              <Headphones className="mr-2 h-4 w-4" /> {currentAudioUrl ? "Trocar áudio" : "Adicionar áudio"}
            </Button>
            {currentAudioUrl ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange({ audio_file: null, audio_path: "", audio_url: "", audio_transcript: "", remove_audio: true })}
              >
                <X className="mr-2 h-4 w-4" /> Remover
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {(currentImageUrl || currentAudioUrl || question.audio_transcript) ? (
        <HomeworkQuestionMedia
          imageUrl={currentImageUrl}
          audioUrl={currentAudioUrl}
          audioTranscript={question.audio_transcript}
          showTranscript={Boolean(question.audio_transcript)}
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          O aluno verá a imagem e poderá ouvir o áudio na pergunta.
        </p>
      )}

      {(currentAudioUrl || question.audio_file || question.audio_transcript) ? (
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Transcrição do áudio</label>
          <Textarea
            value={question.audio_transcript || ""}
            onChange={(event) => onChange({ audio_transcript: event.target.value })}
            placeholder="Opcional"
            rows={3}
          />
        </div>
      ) : null}
    </div>
  );
};
