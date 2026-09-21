import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeDollarSign,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { curriculumData } from "@/data/curriculum";
import RecurringSchedulePicker from "@/components/RecurringSchedulePicker";
import FileUploadField from "@/components/FileUploadField";
import RichTextEditor from "@/components/RichTextEditor";
import { cn } from "@/lib/utils";
import { APP_PATHS } from "@/lib/routes";
import { stripRichText } from "@/lib/richText";

const STEPS = [
  { key: "personal", label: "Dados pessoais", icon: UserRound },
  { key: "academic", label: "Dados academicos", icon: BookOpen },
  { key: "tracking", label: "Acompanhamento", icon: ClipboardList },
  { key: "finance", label: "Financeiro", icon: BadgeDollarSign },
  { key: "review", label: "Revisao", icon: CheckCircle2 },
] as const;

const MAX_UPLOAD_SIZE = 8 * 1024 * 1024;
const trackingTextFields = [
  { key: "learningGoal", label: "Objetivo que quer aprender ingles", rows: 3 },
  { key: "taughtContent", label: "O que ja foi ensinado", rows: 4 },
  { key: "contentToTeach", label: "O que precisa ensinar", rows: 4 },
  { key: "strengths", label: "Pontos fortes", rows: 3 },
  { key: "weaknesses", label: "Pontos fracos", rows: 3 },
] as const;

type RegistrationMode = "student" | "group";
type ScheduleSlot = { day: string; time: string };
type SkillKey = "listening" | "speaking" | "reading" | "writing";

type StudentFormData = {
  name: string;
  email: string;
  password: string;
  level: string;
  listening: number;
  speaking: number;
  reading: number;
  writing: number;
  plannedLessons: string;
  completedLessons: string;
  contractStartDate: string;
  contractEndDate: string;
  learningGoal: string;
  taughtContent: string;
  contentToTeach: string;
  strengths: string;
  weaknesses: string;
  monthlyFee: string;
  dueDay: string;
  financeNotes: string;
  schedules: ScheduleSlot[];
  useManualFirstLessonDate: boolean;
  firstLessonDate: string;
};

type StudentDraft = {
  id: string;
  formData: StudentFormData;
  studentPhoto: File | null;
  studentPhotoError: string;
  contractFile: File | null;
  contractError: string;
  showPassword: boolean;
};

const getTotalLessons = (level: string) => {
  const levelData = curriculumData[level as keyof typeof curriculumData] || { lessons: [], grammar: [] };
  const transversalData = curriculumData["ALL LEVELS"] || { lessons: [], grammar: [] };
  return levelData.lessons.length + levelData.grammar.length + transversalData.lessons.length + transversalData.grammar.length;
};

const createEmptyFormData = (): StudentFormData => ({
  name: "",
  email: "",
  password: "",
  level: "A1/A2",
  listening: 1,
  speaking: 1,
  reading: 1,
  writing: 1,
  plannedLessons: String(getTotalLessons("A1/A2")),
  completedLessons: "0",
  contractStartDate: "",
  contractEndDate: "",
  learningGoal: "",
  taughtContent: "",
  contentToTeach: "",
  strengths: "",
  weaknesses: "",
  monthlyFee: "",
  dueDay: "10",
  financeNotes: "",
  schedules: [],
  useManualFirstLessonDate: false,
  firstLessonDate: "",
});

let draftIdSequence = 0;

const createStudentDraft = (): StudentDraft => ({
  id: `student-draft-${Date.now()}-${draftIdSequence++}`,
  formData: createEmptyFormData(),
  studentPhoto: null,
  studentPhotoError: "",
  contractFile: null,
  contractError: "",
  showPassword: false,
});

const getPendingLessons = (formData: StudentFormData) =>
  Math.max(Number(formData.plannedLessons || 0) - Number(formData.completedLessons || 0), 0);

const getStudentTitle = (student: StudentDraft, index: number) =>
  student.formData.name.trim() || `Aluno ${index + 1}`;

const formatFirstLesson = (formData: StudentFormData) => {
  if (!formData.useManualFirstLessonDate || !formData.firstLessonDate) return "Automatica";
  return new Date(formData.firstLessonDate).toLocaleString("pt-BR");
};

const formatApiErrorValue = (value: unknown): string => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(formatApiErrorValue).filter(Boolean).join(" ");
  if (typeof value === "object") {
    return Object.values(value).map(formatApiErrorValue).filter(Boolean).join(" ");
  }
  return String(value);
};

const getApiErrorMessage = (err: any) => {
  const data = err?.response?.data;
  if (!data) return err?.message || "Verifique os dados e tente novamente.";

  const priorityFields = [
    "schedule",
    "monthly_fee",
    "completed_lessons_count",
    "contract_end_date",
    "photo",
    "email",
    "error",
  ];
  for (const field of priorityFields) {
    const message = formatApiErrorValue(data[field]);
    if (message) return message;
  }

  return formatApiErrorValue(data) || "Verifique os dados e tente novamente.";
};

const buildReviewItems = (student: StudentDraft, financeSettings: any) => {
  const formData = student.formData;
  const pendingLessons = getPendingLessons(formData);

  return [
    { label: "Aluno", value: formData.name || "Nao informado" },
    { label: "E-mail", value: formData.email || "Nao informado" },
    { label: "Nivel", value: formData.level },
    { label: "Foto", value: student.studentPhoto ? "Adicionada" : "Sem foto" },
    { label: "Aulas planejadas", value: `${formData.plannedLessons || 0} aulas` },
    { label: "Aulas ja feitas", value: `${formData.completedLessons || 0} aulas` },
    { label: "Aulas pendentes", value: `${pendingLessons} aulas` },
    { label: "Inicio do contrato", value: formData.contractStartDate || "Nao informado" },
    { label: "Fim do contrato", value: formData.contractEndDate || "Nao informado" },
    { label: "Objetivo", value: stripRichText(formData.learningGoal) || "Nao informado" },
    { label: "Mensalidade", value: `R$ ${formData.monthlyFee || financeSettings?.default_monthly_fee || "0,00"}` },
    { label: "Vencimento", value: `Dia ${formData.dueDay || financeSettings?.default_due_day || 10}` },
    { label: "Horarios", value: formData.schedules.length ? `${formData.schedules.length} horarios selecionados` : "Sem agenda recorrente" },
    { label: "Primeira aula", value: formatFirstLesson(formData) },
  ];
};

const CriarAluno = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode>("student");
  const [stepIndex, setStepIndex] = useState(0);
  const [students, setStudents] = useState<StudentDraft[]>(() => [createStudentDraft()]);

  const { data: financeSettings } = useQuery({
    queryKey: ["finance-settings"],
    queryFn: async () => {
      const res = await api.get("/finance/settings/me/");
      return res.data;
    },
    enabled: user?.role === "teacher" || user?.role === "admin",
  });

  const isGroupMode = registrationMode === "group";
  const visibleStudents = isGroupMode ? students : students.slice(0, 1);

  const updateStudentDraft = (studentId: string, updater: (student: StudentDraft) => StudentDraft) => {
    setStudents((current) => current.map((student) => (student.id === studentId ? updater(student) : student)));
  };

  const updateStudentForm = (studentId: string, changes: Partial<StudentFormData>) => {
    updateStudentDraft(studentId, (student) => ({
      ...student,
      formData: { ...student.formData, ...changes },
    }));
  };

  const updateStudentSkill = (studentId: string, skill: SkillKey, value: number) => {
    updateStudentDraft(studentId, (student) => ({
      ...student,
      formData: {
        ...student.formData,
        [skill]: Number.isFinite(value) ? value : 1,
      },
    }));
  };

  const handleRegistrationModeChange = (nextMode: RegistrationMode) => {
    setRegistrationMode(nextMode);
    setStudents((current) => {
      if (nextMode === "group") {
        return current.length >= 2 ? current : [...current, createStudentDraft()];
      }
      return current;
    });
  };

  const addStudentToGroup = () => {
    setStudents((current) => [...current, createStudentDraft()]);
  };

  const removeStudentFromGroup = (studentId: string) => {
    setStudents((current) => {
      if (current.length <= 2) return current;
      return current.filter((student) => student.id !== studentId);
    });
  };

  const handleStudentPhotoChange = (studentId: string, file: File | null) => {
    if (!file) {
      updateStudentDraft(studentId, (student) => ({
        ...student,
        studentPhoto: null,
        studentPhotoError: "",
      }));
      return;
    }
    if (!file.type.startsWith("image/")) {
      updateStudentDraft(studentId, (student) => ({
        ...student,
        studentPhotoError: "A foto precisa ser uma imagem valida.",
      }));
      return;
    }
    if (file.size > MAX_UPLOAD_SIZE) {
      updateStudentDraft(studentId, (student) => ({
        ...student,
        studentPhotoError: "A foto deve ter no maximo 8 MB.",
      }));
      return;
    }
    updateStudentDraft(studentId, (student) => ({
      ...student,
      studentPhoto: file,
      studentPhotoError: "",
    }));
  };

  const handleContractChange = (studentId: string, file: File | null) => {
    if (!file) {
      updateStudentDraft(studentId, (student) => ({
        ...student,
        contractFile: null,
        contractError: "",
      }));
      return;
    }
    if (file.size > MAX_UPLOAD_SIZE) {
      updateStudentDraft(studentId, (student) => ({
        ...student,
        contractError: "O contrato deve ter no maximo 8 MB.",
      }));
      return;
    }
    updateStudentDraft(studentId, (student) => ({
      ...student,
      contractFile: file,
      contractError: "",
    }));
  };

  const handleLevelChange = (studentId: string, level: string) => {
    updateStudentDraft(studentId, (student) => {
      const currentDefault = String(getTotalLessons(student.formData.level));
      const nextDefault = String(getTotalLessons(level));
      return {
        ...student,
        formData: {
          ...student.formData,
          level,
          plannedLessons: student.formData.plannedLessons === currentDefault ? nextDefault : student.formData.plannedLessons,
        },
      };
    });
  };

  const buildStudentPayload = (student: StudentDraft) => {
    const formData = student.formData;
    const payload = new FormData();
    payload.append("name", formData.name);
    payload.append("email", formData.email);
    payload.append("password", formData.password);
    payload.append("role", "student");
    payload.append("level", formData.level);
    payload.append("listening", String(formData.listening));
    payload.append("speaking", String(formData.speaking));
    payload.append("reading", String(formData.reading));
    payload.append("writing", String(formData.writing));
    payload.append("planned_lessons_count", formData.plannedLessons || "0");
    payload.append("completed_lessons_count", formData.completedLessons || "0");
    if (formData.contractStartDate) payload.append("contract_start_date", formData.contractStartDate);
    if (formData.contractEndDate) payload.append("contract_end_date", formData.contractEndDate);
    payload.append("learning_goal", formData.learningGoal);
    payload.append("taught_content", formData.taughtContent);
    payload.append("content_to_teach", formData.contentToTeach);
    payload.append("strengths", formData.strengths);
    payload.append("weaknesses", formData.weaknesses);
    payload.append("teacher_id", user?.user_id || "");
    payload.append("monthly_fee", formData.monthlyFee || String(financeSettings?.default_monthly_fee || 0));
    payload.append("due_day", formData.dueDay || String(financeSettings?.default_due_day || 10));
    payload.append("finance_notes", formData.financeNotes);
    payload.append("schedules", JSON.stringify(formData.schedules
      .filter((schedule) => schedule.day && schedule.time)
      .map((schedule) => ({
        day_of_week: parseInt(schedule.day),
        time: schedule.time,
      }))));
    if (formData.useManualFirstLessonDate && formData.firstLessonDate) {
      payload.append("first_lesson_date", formData.firstLessonDate);
    }
    if (student.contractFile) {
      payload.append("contract_file", student.contractFile);
      payload.append("contract_name", student.contractFile.name);
    }
    if (student.studentPhoto) {
      payload.append("photo", student.studentPhoto);
    }

    return payload;
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const createdStudents: string[] = [];
      const responses = [];

      for (let index = 0; index < visibleStudents.length; index += 1) {
        const student = visibleStudents[index];
        try {
          const res = await api.post("/accounts/register/", buildStudentPayload(student), {
            headers: { "Content-Type": "multipart/form-data" },
          });
          createdStudents.push(getStudentTitle(student, index));
          responses.push(res.data);
        } catch (err: any) {
          const partialMessage = createdStudents.length
            ? ` ${createdStudents.length} aluno(s) ja foram cadastrados.`
            : "";
          throw new Error(`${getStudentTitle(student, index)}: ${getApiErrorMessage(err)}${partialMessage}`);
        }
      }

      return responses;
    },
    onSuccess: (createdStudents) => {
      toast({
        title: isGroupMode ? "Grupo cadastrado com sucesso!" : "Aluno cadastrado com sucesso!",
        description: isGroupMode ? `${createdStudents.length} alunos foram cadastrados separadamente.` : undefined,
      });
      navigate(APP_PATHS.students);
    },
    onError: (err: any) => {
      toast({
        title: isGroupMode ? "Erro ao cadastrar grupo" : "Erro ao cadastrar",
        description: err?.message || "Verifique os dados e tente novamente.",
        variant: "destructive",
      });
    },
  });

  const validateBeforeSubmit = () => {
    if (isGroupMode && visibleStudents.length < 2) {
      toast({
        title: "Grupo precisa ter pelo menos 2 alunos",
        description: "Adicione outro aluno antes de concluir o cadastro.",
        variant: "destructive",
      });
      return false;
    }

    const missingPersonalIndex = visibleStudents.findIndex((student) => {
      const formData = student.formData;
      return !formData.name.trim() || !formData.email.trim() || !formData.password;
    });
    if (missingPersonalIndex >= 0) {
      setStepIndex(0);
      toast({
        title: "Dados pessoais incompletos",
        description: `Preencha nome, e-mail e senha do ${getStudentTitle(visibleStudents[missingPersonalIndex], missingPersonalIndex)}.`,
        variant: "destructive",
      });
      return false;
    }

    const missingFirstLessonIndex = visibleStudents.findIndex((student) =>
      student.formData.useManualFirstLessonDate && !student.formData.firstLessonDate
    );
    if (missingFirstLessonIndex >= 0) {
      setStepIndex(1);
      toast({
        title: "Primeira aula sem data",
        description: `Informe a data da primeira aula do ${getStudentTitle(visibleStudents[missingFirstLessonIndex], missingFirstLessonIndex)}.`,
        variant: "destructive",
      });
      return false;
    }

    const invalidLessonCountIndex = visibleStudents.findIndex((student) =>
      Number(student.formData.completedLessons || 0) > Number(student.formData.plannedLessons || 0)
    );
    if (invalidLessonCountIndex >= 0) {
      setStepIndex(2);
      toast({
        title: "Quantidade de aulas invalida",
        description: `As aulas ja feitas nao podem passar das aulas planejadas do ${getStudentTitle(visibleStudents[invalidLessonCountIndex], invalidLessonCountIndex)}.`,
        variant: "destructive",
      });
      return false;
    }

    const fileErrorIndex = visibleStudents.findIndex((student) => student.studentPhotoError || student.contractError);
    if (fileErrorIndex >= 0) {
      setStepIndex(visibleStudents[fileErrorIndex].studentPhotoError ? 0 : 3);
      toast({
        title: "Arquivo invalido",
        description: visibleStudents[fileErrorIndex].studentPhotoError || visibleStudents[fileErrorIndex].contractError,
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const nextStep = () => setStepIndex((current) => Math.min(current + 1, STEPS.length - 1));
  const previousStep = () => setStepIndex((current) => Math.max(current - 1, 0));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateBeforeSubmit()) return;
    createMutation.mutate();
  };

  const renderStudentHeader = (student: StudentDraft, index: number) => {
    if (!isGroupMode) return null;

    return (
      <div className="mb-5 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Aluno {index + 1}</p>
          <h3 className="mt-1 text-base font-semibold text-foreground">{getStudentTitle(student, index)}</h3>
        </div>
        {visibleStudents.length > 2 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-fit text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onClick={() => removeStudentFromGroup(student.id)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Remover
          </Button>
        )}
      </div>
    );
  };

  const currentStep = STEPS[stepIndex].key;
  const pageTitle = isGroupMode ? "Novo Grupo" : "Novo Aluno";
  const pageDescription = isGroupMode
    ? "Cadastre varios alunos no mesmo fluxo, mantendo os dados de cada um separados."
    : "Cadastro guiado com agenda, financeiro e contrato em um fluxo claro.";

  return (
    <DashboardLayout>
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <PageHeader title={pageTitle} description={pageDescription} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="inline-flex rounded-xl border border-border bg-muted/40 p-1">
            <button
              type="button"
              aria-pressed={registrationMode === "student"}
              onClick={() => handleRegistrationModeChange("student")}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
                registrationMode === "student"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <UserRound className="h-4 w-4" />
              Novo aluno
            </button>
            <button
              type="button"
              aria-pressed={registrationMode === "group"}
              onClick={() => handleRegistrationModeChange("group")}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
                registrationMode === "group"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <UsersRound className="h-4 w-4" />
              Novo grupo
            </button>
          </div>
          <Button type="button" variant="outline" onClick={() => navigate(APP_PATHS.students)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-3 md:grid-cols-5">
          {STEPS.map((step, index) => {
            const active = index === stepIndex;
            const done = index < stepIndex;
            return (
              <button
                key={step.key}
                type="button"
                onClick={() => setStepIndex(index)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-4 text-left transition",
                  active && "border-primary bg-primary text-primary-foreground shadow-sm",
                  done && !active && "border-primary/20 bg-primary/5",
                  !active && !done && "border-border bg-card hover:bg-muted/50"
                )}
              >
                <div className={cn("rounded-lg p-2", active ? "bg-white/15" : "bg-muted")}>
                  <step.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide opacity-70">Etapa {index + 1}</p>
                  <p className="text-sm font-semibold">{step.label}</p>
                </div>
              </button>
            );
          })}
        </div>

        {isGroupMode && (
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">{visibleStudents.length} alunos neste grupo</p>
              <p className="mt-1 text-sm text-muted-foreground">Cada aluno sera cadastrado com perfil, trilha, financeiro e agenda proprios.</p>
            </div>
            <Button type="button" variant="outline" onClick={addStudentToGroup}>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar aluno
            </Button>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card shadow-sm">
          {currentStep === "personal" && (
            <section className="space-y-6 p-6">
              {visibleStudents.map((student, index) => (
                <div key={student.id} className={cn(isGroupMode && "rounded-xl border border-border bg-background/70 p-4")}>
                  {renderStudentHeader(student, index)}
                  <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                    <div className="space-y-4">
                      <div>
                        <h2 className="text-lg font-semibold">Dados pessoais</h2>
                        <p className="text-sm text-muted-foreground">Informacoes basicas de acesso para o aluno.</p>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium">Nome do aluno</label>
                        <input
                          required
                          type="text"
                          className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                          value={student.formData.name}
                          onChange={(e) => updateStudentForm(student.id, { name: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium">E-mail</label>
                        <input
                          required
                          type="email"
                          className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                          value={student.formData.email}
                          onChange={(e) => updateStudentForm(student.id, { email: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium">Senha inicial</label>
                        <div className="relative">
                          <input
                            required
                            type={student.showPassword ? "text" : "password"}
                            className="w-full rounded-lg border border-border bg-background p-3 pr-12 text-sm"
                            value={student.formData.password}
                            onChange={(e) => updateStudentForm(student.id, { password: e.target.value })}
                          />
                          <button
                            type="button"
                            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground transition hover:text-foreground"
                            onClick={() => updateStudentDraft(student.id, (current) => ({ ...current, showPassword: !current.showPassword }))}
                            aria-label={student.showPassword ? "Ocultar senha" : "Mostrar senha"}
                            title={student.showPassword ? "Ocultar senha" : "Mostrar senha"}
                          >
                            {student.showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4 rounded-2xl bg-muted/40 p-6">
                      <FileUploadField
                        label="Foto do aluno"
                        description="A foto aparece na lista de alunos. Sem foto, o sistema mostra as iniciais."
                        accept=".png,.jpg,.jpeg,.webp"
                        formatsLabel="PNG, JPG, JPEG ou WEBP"
                        file={student.studentPhoto}
                        onChange={(file) => handleStudentPhotoChange(student.id, file)}
                        error={student.studentPhotoError}
                      />
                      {!isGroupMode && (
                        <div>
                          <h3 className="text-sm font-semibold">Visao rapida</h3>
                          <p className="mt-2 text-sm text-muted-foreground">O professor consegue cadastrar o aluno, configurar a mensalidade e ja sair com a trilha e as cobrancas prontas.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </section>
          )}

          {currentStep === "academic" && (
            <section className="space-y-6 p-6">
              {visibleStudents.map((student, index) => (
                <div key={student.id} className={cn(isGroupMode && "rounded-xl border border-border bg-background/70 p-4")}>
                  {renderStudentHeader(student, index)}
                  <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
                    <div className="space-y-4">
                      <div>
                        <h2 className="text-lg font-semibold">Dados academicos</h2>
                        <p className="text-sm text-muted-foreground">Nivel inicial e percepcao de habilidade do aluno.</p>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium">Nivel base</label>
                        <select
                          className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                          value={student.formData.level}
                          onChange={(e) => handleLevelChange(student.id, e.target.value)}
                        >
                          {Object.keys(curriculumData).filter((level) => level !== "ALL LEVELS").map((level) => (
                            <option key={level} value={level}>{level}</option>
                          ))}
                        </select>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {(["listening", "speaking", "reading", "writing"] as const).map((skill) => (
                          <div key={skill}>
                            <label className="mb-1 block text-sm font-medium capitalize">{skill}</label>
                            <input
                              type="number"
                              min="1"
                              max="10"
                              className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                              value={student.formData[skill]}
                              onChange={(e) => updateStudentSkill(student.id, skill, parseInt(e.target.value))}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-semibold">Agenda recorrente</h3>
                        <p className="text-sm text-muted-foreground">Selecione os horarios fixos. A sequencia de aulas sera gerada automaticamente.</p>
                      </div>
                      <RecurringSchedulePicker
                        teacherId={user?.user_id}
                        value={student.formData.schedules}
                        onChange={(schedules) => updateStudentForm(student.id, { schedules })}
                      />
                      <div className="rounded-2xl border border-border bg-muted/30 p-4">
                        <label className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 rounded border-border"
                            checked={student.formData.useManualFirstLessonDate}
                            onChange={(e) => updateStudentForm(student.id, {
                              useManualFirstLessonDate: e.target.checked,
                              firstLessonDate: e.target.checked ? student.formData.firstLessonDate : "",
                            })}
                          />
                          <span>
                            <span className="block text-sm font-semibold">Primeira aula em data especifica</span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              Use quando a primeira aula ja aconteceu hoje ou precisa comecar em uma data diferente.
                            </span>
                          </span>
                        </label>
                        {student.formData.useManualFirstLessonDate && (
                          <div className="mt-4">
                            <label className="mb-1 block text-sm font-medium">Data e horario da primeira aula</label>
                            <input
                              type="datetime-local"
                              required
                              className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                              value={student.formData.firstLessonDate}
                              onChange={(e) => updateStudentForm(student.id, { firstLessonDate: e.target.value })}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </section>
          )}

          {currentStep === "tracking" && (
            <section className="space-y-6 p-6">
              <div>
                <h2 className="text-lg font-semibold">Acompanhamento do aluno</h2>
                <p className="text-sm text-muted-foreground">Plano de aulas, contrato e pontos pedagogicos para orientar as proximas aulas.</p>
              </div>

              {visibleStudents.map((student, index) => (
                <div key={student.id} className={cn(isGroupMode && "rounded-xl border border-border bg-background/70 p-4")}>
                  {renderStudentHeader(student, index)}
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium">Quantidade de aulas que ele tera</label>
                      <input
                        type="number"
                        min="0"
                        className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                        value={student.formData.plannedLessons}
                        onChange={(e) => updateStudentForm(student.id, { plannedLessons: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Quantidade de aulas que ele ja teve</label>
                      <input
                        type="number"
                        min="0"
                        className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                        value={student.formData.completedLessons}
                        onChange={(e) => updateStudentForm(student.id, { completedLessons: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Aulas pendentes</label>
                      <input
                        type="number"
                        readOnly
                        className="w-full rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground"
                        value={getPendingLessons(student.formData)}
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium">Data que comecou o contrato</label>
                      <input
                        type="date"
                        className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                        value={student.formData.contractStartDate}
                        onChange={(e) => updateStudentForm(student.id, { contractStartDate: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Data que terminara o contrato</label>
                      <input
                        type="date"
                        className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                        value={student.formData.contractEndDate}
                        onChange={(e) => updateStudentForm(student.id, { contractEndDate: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {trackingTextFields.map((field) => (
                      <div key={field.key} className={field.key === "learningGoal" ? "lg:col-span-2" : ""}>
                        <label className="mb-1 block text-sm font-medium">{field.label}</label>
                        <RichTextEditor
                          value={student.formData[field.key]}
                          minHeight={field.rows * 42}
                          placeholder="Registre observacoes, listas e pontos importantes."
                          onChange={(value) => updateStudentDraft(student.id, (current) => ({
                            ...current,
                            formData: { ...current.formData, [field.key]: value },
                          }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}

          {currentStep === "finance" && (
            <section className="space-y-6 p-6">
              {visibleStudents.map((student, index) => (
                <div key={student.id} className={cn(isGroupMode && "rounded-xl border border-border bg-background/70 p-4")}>
                  {renderStudentHeader(student, index)}
                  <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
                    <div className="space-y-4">
                      <div>
                        <h2 className="text-lg font-semibold">Financeiro</h2>
                        <p className="text-sm text-muted-foreground">Mensalidade, vencimento, observacoes e contrato.</p>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-sm font-medium">Mensalidade</label>
                          <input
                            type="number"
                            step="0.01"
                            className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                            placeholder={String(financeSettings?.default_monthly_fee || "0.00")}
                            value={student.formData.monthlyFee}
                            onChange={(e) => updateStudentForm(student.id, { monthlyFee: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium">Dia do vencimento</label>
                          <input
                            type="number"
                            min="1"
                            max="28"
                            className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                            value={student.formData.dueDay}
                            onChange={(e) => updateStudentForm(student.id, { dueDay: e.target.value })}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium">Observacoes financeiras</label>
                        <textarea
                          className="min-h-32 w-full rounded-lg border border-border bg-background p-3 text-sm"
                          value={student.formData.financeNotes}
                          onChange={(e) => updateStudentForm(student.id, { financeNotes: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <FileUploadField
                        label="Contrato do aluno"
                        description="Contrato visivel para professor e aluno. Aceita PDF e imagens."
                        file={student.contractFile}
                        onChange={(file) => handleContractChange(student.id, file)}
                        error={student.contractError}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </section>
          )}

          {currentStep === "review" && (
            <section className="space-y-6 p-6">
              <div>
                <h2 className="text-lg font-semibold">Revisao final</h2>
                <p className="mt-1 text-sm text-muted-foreground">Confira os dados antes de concluir o cadastro.</p>
              </div>

              <div className={cn("grid gap-6", isGroupMode ? "lg:grid-cols-2" : "lg:grid-cols-[0.9fr_1.1fr]")}>
                {visibleStudents.map((student, index) => (
                  <div key={student.id} className="rounded-xl border border-border bg-background/70 p-4">
                    {renderStudentHeader(student, index)}
                    <div className="space-y-3">
                      {buildReviewItems(student, financeSettings).map((item) => (
                        <div key={item.label} className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 px-4 py-3">
                          <span className="text-sm text-muted-foreground">{item.label}</span>
                          <span className="text-right text-sm font-medium text-foreground">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {!isGroupMode && (
                  <div className="rounded-2xl bg-muted/40 p-6">
                    <h3 className="text-sm font-semibold">O que acontece ao salvar</h3>
                    <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                      <p>O perfil financeiro do aluno sera criado com contrato, mensalidade e vencimento.</p>
                      <p>As mensalidades iniciais do aluno serao geradas automaticamente para os proximos meses.</p>
                      <p>A trilha sera criada com {visibleStudents[0].formData.plannedLessons || 0} aulas, considerando {visibleStudents[0].formData.completedLessons || 0} ja feitas.</p>
                    </div>
                  </div>
                )}
              </div>

              {isGroupMode && (
                <div className="rounded-2xl bg-muted/40 p-6">
                  <h3 className="text-sm font-semibold">O que acontece ao salvar</h3>
                  <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                    <p>Cada aluno do grupo sera criado como um cadastro separado.</p>
                    <p>O financeiro, contrato, agenda e trilha serao gerados individualmente para cada aluno.</p>
                    <p>Se algum cadastro falhar, a mensagem indicara qual aluno precisa de ajuste.</p>
                  </div>
                </div>
              )}
            </section>
          )}

          <div className="flex flex-col gap-3 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={stepIndex === 0 ? () => navigate(APP_PATHS.students) : previousStep}>
              {stepIndex === 0 ? "Cancelar" : "Voltar"}
            </Button>
            <div className="flex flex-col gap-3 sm:flex-row">
              {stepIndex < STEPS.length - 1 ? (
                <Button type="button" className="w-full sm:w-auto" onClick={nextStep}>Continuar</Button>
              ) : (
                <Button type="submit" className="w-full sm:w-auto" disabled={createMutation.isPending}>
                  {createMutation.isPending
                    ? (isGroupMode ? "Cadastrando grupo..." : "Cadastrando...")
                    : (isGroupMode ? `Cadastrar ${visibleStudents.length} alunos` : "Cadastrar aluno")}
                </Button>
              )}
            </div>
          </div>
        </div>
      </form>
    </DashboardLayout>
  );
};

export default CriarAluno;
