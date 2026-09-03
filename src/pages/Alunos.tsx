import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import FileUploadField from "@/components/FileUploadField";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import RecurringSchedulePicker from "@/components/RecurringSchedulePicker";
import { useToast } from "@/hooks/use-toast";
import { curriculumData } from "@/data/curriculum";
import { BookOpenCheck, CalendarClock, Edit2, Search, Trash2 } from "lucide-react";
import PastLessonSummary from "@/components/PastLessonSummary";
import { APP_PATHS } from "@/lib/routes";
import { absoluteMediaUrl } from "@/lib/config";

const skillConfigs = [
  { key: "listening", label: "Listening" },
  { key: "speaking", label: "Speaking" },
  { key: "reading", label: "Reading" },
  { key: "writing", label: "Writing" },
] as const;

const MAX_PHOTO_SIZE = 8 * 1024 * 1024;
const recurringDayShortLabels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];

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
  schedules: { day: string; time: string }[];
};

type RecurringScheduleRecord = {
  id: string;
  teacher?: string | null;
  day_of_week: number;
  start_time: string;
  active: boolean;
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
});

const trackingTextFields = [
  { key: "learningGoal", label: "Objetivo que quer aprender ingles", rows: 3 },
  { key: "taughtContent", label: "O que ja foi ensinado", rows: 4 },
  { key: "contentToTeach", label: "O que precisa ensinar", rows: 4 },
  { key: "strengths", label: "Pontos fortes", rows: 3 },
  { key: "weaknesses", label: "Pontos fracos", rows: 3 },
] as const;

const getInitials = (name: string) => {
  if (!name) return "A";
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
};

const getSafeSkillValue = (value: number | null | undefined) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(10, parsed));
};

const getTotalLessons = (level: string) => {
  const levelData = curriculumData[level as keyof typeof curriculumData] || { lessons: [], grammar: [] };
  const transversalData = curriculumData["ALL LEVELS"] || { lessons: [], grammar: [] };
  return levelData.lessons.length + levelData.grammar.length + transversalData.lessons.length + transversalData.grammar.length;
};

const getStudentName = (student: any) => student.name?.trim() || student.email?.split("@")[0] || "Aluno sem nome";

const getLevelLabel = (level?: string) => level === "A1/A2" ? "Basico (A1/A2)" : `Nivel ${level || "A1/A2"}`;

const getRecurringSchedules = (student: any): RecurringScheduleRecord[] =>
  Array.isArray(student?.recurring_schedules) ? student.recurring_schedules.filter((schedule: any) => schedule?.active !== false) : [];

const formatRecurringScheduleCompact = (schedule?: RecurringScheduleRecord | null) => {
  if (!schedule) return "Sem horario fixo";
  const dayLabel = recurringDayShortLabels[schedule.day_of_week] || "Dia";
  return `${dayLabel} ${schedule.start_time.slice(0, 5)}`;
};

const formatRecurringSchedulesSummary = (schedules: RecurringScheduleRecord[]) => {
  if (!schedules.length) return "Sem horario fixo";
  const labels = schedules.map((schedule) => formatRecurringScheduleCompact(schedule));
  if (labels.length <= 2) return labels.join(" · ");
  return `${labels.slice(0, 2).join(" · ")} +${labels.length - 2}`;
};

const getCompletedLessons = (student: any) => {
  const parsed = Number(
    student.effective_completed_lessons_count ??
    student.completed_lessons_count ??
    student.completed_lessons ??
    student.completedLessons ??
    student.finished_lessons ??
    student.finishedLessons ??
    0
  );
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
};

const getPlannedLessons = (student: any) => {
  const parsed = Number(student.effective_planned_lessons_count ?? student.planned_lessons_count);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return getTotalLessons(student.level || "A1/A2");
};

const getPendingLessons = (student: any) => {
  const parsed = Number(student.pending_lessons_count);
  if (Number.isFinite(parsed)) {
    return Math.max(0, parsed);
  }
  return Math.max(getPlannedLessons(student) - getCompletedLessons(student), 0);
};

const toDateInputValue = (value?: string | null) => value ? value.slice(0, 10) : "";

const getAverageSkill = (student: any) => {
  const total = skillConfigs.reduce((sum, skill) => sum + getSafeSkillValue(student[skill.key]), 0);
  return total / skillConfigs.length;
};

const Alunos = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [contractError, setContractError] = useState("");
  const [currentContractName, setCurrentContractName] = useState("");
  const [currentContractUrl, setCurrentContractUrl] = useState<string | null>(null);
  const [formData, setFormData] = useState<StudentFormData>(createEmptyFormData);

  const { data: students = [], isLoading } = useQuery({
    queryKey: ["students"],
    queryFn: async () => {
      const res = await api.get("/accounts/users/");
      const usersData = Array.isArray(res.data) ? res.data : (res.data.results || []);
      return usersData.filter((u: any) => u.role === "student");
    },
  });

  const { data: financeSettings } = useQuery({
    queryKey: ["finance-settings"],
    queryFn: async () => {
      const res = await api.get("/finance/settings/me/");
      return res.data;
    },
    enabled: user?.role === "teacher" || user?.role === "admin",
  });

  const filteredStudents = useMemo(() => {
    if (!searchQuery) return students;
    const lowerQuery = searchQuery.toLowerCase();
    return students.filter(
      (s: any) =>
        s.name?.toLowerCase().includes(lowerQuery) ||
        s.email?.toLowerCase().includes(lowerQuery)
    );
  }, [students, searchQuery]);

  const activeLevelsCount = useMemo(() => {
    return new Set(students.map((student: any) => student.level || "A1/A2")).size;
  }, [students]);

  const averageSkillAcrossStudents = useMemo(() => {
    if (!students.length) return "0.0";
    const total = students.reduce((sum: number, student: any) => sum + getAverageSkill(student), 0);
    return (total / students.length).toFixed(1);
  }, [students]);

  const saveMutation = useMutation({
    mutationFn: async (data: StudentFormData) => {
      if (editingStudentId) {
        const payload = new FormData();
        payload.append("name", data.name);
        payload.append("email", data.email);
        payload.append("level", data.level);
        payload.append("listening", String(data.listening));
        payload.append("speaking", String(data.speaking));
        payload.append("reading", String(data.reading));
        payload.append("writing", String(data.writing));
        payload.append("planned_lessons_count", data.plannedLessons || "0");
        payload.append("completed_lessons_count", data.completedLessons || "0");
        payload.append("contract_start_date", data.contractStartDate);
        payload.append("contract_end_date", data.contractEndDate);
        payload.append("learning_goal", data.learningGoal);
        payload.append("taught_content", data.taughtContent);
        payload.append("content_to_teach", data.contentToTeach);
        payload.append("strengths", data.strengths);
        payload.append("weaknesses", data.weaknesses);
        payload.append("teacher_id", user?.user_id || "");
        if (data.monthlyFee) payload.append("monthly_fee", data.monthlyFee);
        if (data.dueDay) payload.append("due_day", data.dueDay);
        payload.append("finance_notes", data.financeNotes);
        payload.append("schedules", JSON.stringify(data.schedules.map((schedule) => ({
          day_of_week: parseInt(schedule.day),
          time: schedule.time,
        }))));
        if (data.password) payload.append("password", data.password);
        if (photoFile) payload.append("photo", photoFile);
        if (removePhoto) payload.append("remove_photo", "true");
        if (contractFile) {
          payload.append("contract_file", contractFile);
          payload.append("contract_name", contractFile.name);
        }
        await api.patch(`/accounts/users/${editingStudentId}/`, payload, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        return null;
      } else {
        const payload: any = {
          name: data.name,
          email: data.email,
          password: data.password,
          role: "student",
          level: data.level,
          listening: data.listening,
          speaking: data.speaking,
          reading: data.reading,
          writing: data.writing,
          planned_lessons_count: Number(data.plannedLessons || 0),
          completed_lessons_count: Number(data.completedLessons || 0),
          contract_start_date: data.contractStartDate || null,
          contract_end_date: data.contractEndDate || null,
          learning_goal: data.learningGoal,
          taught_content: data.taughtContent,
          content_to_teach: data.contentToTeach,
          strengths: data.strengths,
          weaknesses: data.weaknesses,
          monthly_fee: data.monthlyFee || financeSettings?.default_monthly_fee || 0,
          due_day: data.dueDay || financeSettings?.default_due_day || 10,
          finance_notes: data.financeNotes,
          teacher_id: user?.user_id || undefined,
        };

        payload.schedules = data.schedules
          .filter(schedule => schedule.day && schedule.time)
          .map(schedule => ({
            day_of_week: parseInt(schedule.day),
            time: schedule.time,
          }));

        const res = await api.post("/accounts/register/", payload);
        return res.data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-availability-recurring"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-day-slots"] });
      toast({ title: editingStudentId ? "Aluno atualizado com sucesso!" : "Aluno cadastrado com sucesso!" });
      closeModal();
    },
    onError: (err: any) => {
      console.error(err);
      toast({
        title: "Erro ao salvar",
        description:
          err.response?.data?.schedule ||
          err.response?.data?.completed_lessons_count?.[0] ||
          err.response?.data?.contract_end_date?.[0] ||
          err.response?.data?.monthly_fee?.[0] ||
          err.response?.data?.photo?.[0] ||
          err.response?.data?.email?.[0] ||
          err.response?.data?.error ||
          "Verifique os dados e tente novamente.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/accounts/users/${id}/`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      toast({ title: "Aluno removido com sucesso!" });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const handlePhotoChange = (file: File | null) => {
    if (!file) {
      setPhotoFile(null);
      setPhotoError("");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setPhotoError("A foto precisa ser uma imagem valida.");
      return;
    }
    if (file.size > MAX_PHOTO_SIZE) {
      setPhotoError("A foto deve ter no maximo 8 MB.");
      return;
    }
    setPhotoFile(file);
    setPhotoError("");
    setRemovePhoto(false);
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setCurrentPhotoUrl(null);
    setPhotoError("");
    setRemovePhoto(true);
  };

  const handleContractChange = (file: File | null) => {
    if (!file) {
      setContractFile(null);
      setContractError("");
      return;
    }
    if (file.size > MAX_PHOTO_SIZE) {
      setContractError("O contrato deve ter no maximo 8 MB.");
      return;
    }
    setContractFile(file);
    setContractError("");
  };

  const handleLevelChange = (level: string) => {
    const currentDefault = String(getTotalLessons(formData.level));
    const nextDefault = String(getTotalLessons(level));
    setFormData({
      ...formData,
      level,
      plannedLessons: formData.plannedLessons === currentDefault ? nextDefault : formData.plannedLessons,
    });
  };

  const openEditModal = (student: any) => {
    const financeProfile = student.finance_profile || {};
    const schedules = getRecurringSchedules(student).map((schedule) => ({
      day: String(schedule.day_of_week),
      time: schedule.start_time.slice(0, 5),
    }));
    setFormData({
      name: student.name || "",
      email: student.email || "",
      password: "",
      level: student.level || "A1/A2",
      listening: student.listening ?? 1,
      speaking: student.speaking ?? 1,
      reading: student.reading ?? 1,
      writing: student.writing ?? 1,
      plannedLessons: String(getPlannedLessons(student)),
      completedLessons: String(getCompletedLessons(student)),
      contractStartDate: toDateInputValue(student.contract_start_date),
      contractEndDate: toDateInputValue(student.contract_end_date),
      learningGoal: student.learning_goal || "",
      taughtContent: student.taught_content || "",
      contentToTeach: student.content_to_teach || "",
      strengths: student.strengths || "",
      weaknesses: student.weaknesses || "",
      monthlyFee: financeProfile.monthly_fee ? String(financeProfile.monthly_fee) : String(financeSettings?.default_monthly_fee || ""),
      dueDay: financeProfile.due_day ? String(financeProfile.due_day) : String(financeSettings?.default_due_day || 10),
      financeNotes: financeProfile.notes || "",
      schedules,
    });
    setPhotoFile(null);
    setPhotoError("");
    setCurrentPhotoUrl(absoluteMediaUrl(student.photo_url));
    setRemovePhoto(false);
    setContractFile(null);
    setContractError("");
    setCurrentContractName(financeProfile.contract_name || "");
    setCurrentContractUrl(absoluteMediaUrl(financeProfile.contract_url));
    setEditingStudentId(student.id);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingStudentId(null);
    setPhotoFile(null);
    setPhotoError("");
    setCurrentPhotoUrl(null);
    setRemovePhoto(false);
    setContractFile(null);
    setContractError("");
    setCurrentContractName("");
    setCurrentContractUrl(null);
    setFormData(createEmptyFormData());
  };

  const modalPendingLessons = Math.max(Number(formData.plannedLessons || 0) - Number(formData.completedLessons || 0), 0);

  return (
    <DashboardLayout>
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <PageHeader title="Alunos" description={`${students.length} alunos cadastrados`} />
        <Button asChild className="rounded-lg">
          <Link to={APP_PATHS.newStudent}>+ Novo Aluno</Link>
        </Button>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Total de alunos</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{students.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Niveis ativos</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{activeLevelsCount}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Media das habilidades</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{averageSkillAcrossStudents}/10</p>
        </div>
      </div>

      <section className="school-surface overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-border/80 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Lista de alunos</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Visualize nivel, andamento da trilha e habilidades principais em um unico lugar.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <span className="inline-flex w-fit items-center rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">
              {filteredStudents.length} exibidos
            </span>
            <label className="relative block sm:w-[320px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar aluno..."
                className="h-11 w-full rounded-xl border border-border bg-white/90 pl-10 pr-4 text-sm outline-none transition-shadow focus:ring-2 focus:ring-primary"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </label>
          </div>
        </div>

        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Carregando alunos...</div>
        ) : filteredStudents.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">Nenhum aluno encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1120px] w-full divide-y divide-border text-sm">
              <thead className="bg-slate-50/90">
                <tr className="text-left">
                  <th className="px-5 py-3.5 font-medium text-muted-foreground">Aluno</th>
                  <th className="px-5 py-3.5 font-medium text-muted-foreground">Nivel</th>
                  <th className="px-5 py-3.5 font-medium text-muted-foreground">Trilha</th>
                  <th className="px-5 py-3.5 font-medium text-muted-foreground">Habilidades</th>
                  <th className="px-5 py-3.5 text-right font-medium text-muted-foreground">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredStudents.map((student: any, index: number) => {
                  const studentName = getStudentName(student);
                  const studentPhotoUrl = absoluteMediaUrl(student.photo_url);
                  const recurringSchedules = getRecurringSchedules(student);
                  const scheduleSummary = formatRecurringSchedulesSummary(recurringSchedules);
                  const totalLessons = getPlannedLessons(student);
                  const completedLessons = getCompletedLessons(student);
                  const pendingLessons = getPendingLessons(student);
                  const lessonProgress = totalLessons > 0 ? Math.min((completedLessons / totalLessons) * 100, 100) : 0;
                  return (
                    <tr
                      key={student.id}
                      className={[
                        "transition-colors hover:bg-slate-50/90",
                        index % 2 === 0 ? "bg-white/90" : "bg-sky-50/45",
                      ].join(" ")}
                    >
                      <td className="px-5 py-3 align-top">
                        <div className="flex min-w-[280px] items-center gap-3">
                          <Avatar className="h-12 w-12 rounded-2xl shadow-sm">
                            <AvatarImage src={studentPhotoUrl || undefined} alt={`Foto de ${studentName}`} className="object-cover" />
                            <AvatarFallback className="rounded-2xl bg-primary text-lg font-bold text-primary-foreground">
                              {getInitials(studentName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-base font-semibold text-foreground">{studentName}</p>
                            <p className="mt-1 truncate text-sm text-muted-foreground">{student.email}</p>
                            <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                              <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{scheduleSummary}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 align-top">
                        <div className="min-w-[170px]">
                          <span className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
                            {getLevelLabel(student.level)}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 align-top">
                        <div className="min-w-[210px] rounded-xl border border-border/70 bg-white/75 p-3 shadow-sm">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Trilha</p>
                              <p className="mt-1 text-lg font-semibold leading-none text-foreground">
                                {completedLessons}/{totalLessons}
                              </p>
                            </div>
                            <span className="text-xs font-medium text-muted-foreground">{Math.round(lessonProgress)}%</span>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${lessonProgress}%` }} />
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {pendingLessons} aulas pendentes
                          </p>
                        </div>
                      </td>
                      <td className="px-5 py-3 align-top">
                        <div className="grid min-w-[320px] gap-2 sm:grid-cols-2">
                          {skillConfigs.map((skill) => {
                            const skillValue = getSafeSkillValue(student[skill.key]);

                            return (
                              <div key={skill.key} className="rounded-xl border border-border/70 bg-white/75 px-3 py-2.5 shadow-sm">
                                <div className="flex items-center justify-between gap-3 text-xs">
                                  <span className="font-medium text-foreground">{skill.label}</span>
                                  <span className="text-muted-foreground">{skillValue}/10</span>
                                </div>
                                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                                  <div
                                    className="h-full rounded-full bg-primary transition-all"
                                    style={{ width: `${skillValue * 10}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-5 py-3 align-top">
                        <div className="flex min-w-[220px] flex-wrap justify-end gap-2">
                          <PastLessonSummary
                            student={student}
                            compact
                            buttonVariant="outline"
                            buttonClassName="h-9 rounded-lg border-border bg-white/80 px-3 text-xs font-medium shadow-sm"
                          />
                          <Button asChild variant="outline" size="sm" className="h-9 rounded-lg bg-white/80 shadow-sm">
                            <Link to={APP_PATHS.studentLessons(student.id)} title="Abrir historico do aluno">
                              <BookOpenCheck className="h-4 w-4" />
                              Historico
                            </Link>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:bg-white hover:text-primary"
                            onClick={() => openEditModal(student)}
                            title="Editar"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:bg-red-50 hover:text-destructive"
                            onClick={() => {
                              if (window.confirm(`Excluir o aluno ${studentName}?`)) {
                                deleteMutation.mutate(student.id);
                              }
                            }}
                            title="Remover"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 px-3 py-6">
          <div className="flex max-h-[94vh] w-[min(98vw,1500px)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <div className="border-b border-border px-6 py-5">
              <h2 className="text-xl font-semibold">
                {editingStudentId ? "Editar Aluno" : "Cadastrar Novo Aluno"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Dados pessoais, trilha, contrato, financeiro e acompanhamento pedagogico em um unico lugar.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="min-h-0 flex-1 overflow-y-auto">
              <div className="space-y-6 p-6">
                <section className="rounded-xl border border-border bg-background/70 p-4">
                  <h3 className="text-base font-semibold">Dados pessoais</h3>
                  <div className="mt-4 grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
                    <FileUploadField
                      label="Foto do aluno"
                      description="A imagem aparece na lista. Sem foto, o sistema mostra as iniciais."
                      accept=".png,.jpg,.jpeg,.webp"
                      formatsLabel="PNG, JPG, JPEG ou WEBP"
                      file={photoFile}
                      existingUrl={currentPhotoUrl}
                      existingName={currentPhotoUrl ? "Foto atual do aluno" : undefined}
                      onChange={handlePhotoChange}
                      onRemoveExisting={currentPhotoUrl ? handleRemovePhoto : undefined}
                      error={photoError}
                    />
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium mb-1">Nome do Aluno</label>
                        <input
                          required
                          type="text"
                          className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">E-mail</label>
                        <input
                          required
                          type="email"
                          className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium mb-1">
                          {editingStudentId ? "Nova Senha (opcional)" : "Senha Inicial"}
                        </label>
                        <input
                          required={!editingStudentId}
                          type="password"
                          className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-border bg-background/70 p-4">
                  <h3 className="text-base font-semibold">Dados academicos</h3>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                    <div>
                      <label className="block text-sm font-medium mb-1">Nivel Base</label>
                      <select
                        required
                        className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                        value={formData.level}
                        onChange={(e) => handleLevelChange(e.target.value)}
                      >
                        {Object.keys(curriculumData).filter(k => k !== "ALL LEVELS").map((lvl) => (
                          <option key={lvl} value={lvl}>{lvl}</option>
                        ))}
                      </select>
                    </div>

                    {(["listening", "speaking", "reading", "writing"] as const).map(skill => (
                      <div key={skill}>
                        <label className="block text-sm font-medium mb-1 capitalize">{skill}</label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                          value={formData[skill]}
                          onChange={(e) => setFormData({ ...formData, [skill]: parseInt(e.target.value) })}
                        />
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-xl border border-border bg-background/70 p-4">
                  <h3 className="text-base font-semibold">Agenda recorrente</h3>
                  <div className="mt-4">
                    <RecurringSchedulePicker
                      teacherId={user?.user_id}
                      value={formData.schedules}
                      onChange={(schedules) => setFormData({ ...formData, schedules })}
                    />
                  </div>
                </section>

                <section className="rounded-xl border border-border bg-background/70 p-4">
                  <h3 className="text-base font-semibold">Acompanhamento do aluno</h3>
                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium">Quantidade de aulas que ele tera</label>
                      <input
                        type="number"
                        min="0"
                        className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                        value={formData.plannedLessons}
                        onChange={(e) => setFormData({ ...formData, plannedLessons: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Quantidade de aulas que ele ja teve</label>
                      <input
                        type="number"
                        min="0"
                        className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                        value={formData.completedLessons}
                        onChange={(e) => setFormData({ ...formData, completedLessons: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Aulas pendentes</label>
                      <input
                        type="number"
                        readOnly
                        className="w-full rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground"
                        value={modalPendingLessons}
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium">Data que comecou o contrato</label>
                      <input
                        type="date"
                        className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                        value={formData.contractStartDate}
                        onChange={(e) => setFormData({ ...formData, contractStartDate: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Data que terminara o contrato</label>
                      <input
                        type="date"
                        className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                        value={formData.contractEndDate}
                        onChange={(e) => setFormData({ ...formData, contractEndDate: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {trackingTextFields.map((field) => (
                      <div key={field.key} className={field.key === "learningGoal" ? "lg:col-span-2" : ""}>
                        <label className="mb-1 block text-sm font-medium">{field.label}</label>
                        <textarea
                          rows={field.rows}
                          className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                          value={formData[field.key]}
                          onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                        />
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-xl border border-border bg-background/70 p-4">
                  <h3 className="text-base font-semibold">Financeiro e contrato</h3>
                  <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-sm font-medium">Mensalidade</label>
                          <input
                            type="number"
                            step="0.01"
                            className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                            value={formData.monthlyFee}
                            onChange={(e) => setFormData({ ...formData, monthlyFee: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium">Dia do vencimento</label>
                          <input
                            type="number"
                            min="1"
                            max="28"
                            className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                            value={formData.dueDay}
                            onChange={(e) => setFormData({ ...formData, dueDay: e.target.value })}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium">Observacoes financeiras</label>
                        <textarea
                          rows={4}
                          className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                          value={formData.financeNotes}
                          onChange={(e) => setFormData({ ...formData, financeNotes: e.target.value })}
                        />
                      </div>
                    </div>

                    <FileUploadField
                      label="Contrato do aluno"
                      description="Contrato visivel para professor e aluno. Aceita PDF e imagens."
                      file={contractFile}
                      existingUrl={currentContractUrl}
                      existingName={currentContractName || (currentContractUrl ? "Contrato atual" : undefined)}
                      onChange={handleContractChange}
                      error={contractError}
                    />
                  </div>
                </section>
              </div>

              <div className="sticky bottom-0 flex flex-col gap-3 border-t border-border bg-card px-6 py-4 sm:flex-row sm:items-center sm:justify-end">
                <Button type="button" variant="outline" onClick={closeModal}>Cancelar</Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Salvando..." : (editingStudentId ? "Salvar Edicao" : "Cadastrar")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};
export default Alunos;
