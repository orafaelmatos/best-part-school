import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { curriculumData } from "@/data/curriculum";
import { BookOpenCheck, Edit2, Search, Trash2 } from "lucide-react";
import PastLessonSummary from "@/components/PastLessonSummary";
import { APP_PATHS } from "@/lib/routes";

const skillConfigs = [
  { key: "listening", label: "Listening" },
  { key: "speaking", label: "Speaking" },
  { key: "reading", label: "Reading" },
  { key: "writing", label: "Writing" },
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

const getCompletedLessons = (student: any) => {
  const parsed = Number(student.completed_lessons ?? student.completedLessons ?? student.finished_lessons ?? student.finishedLessons ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
};

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

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    level: "A1/A2",
    listening: 1,
    speaking: 1,
    reading: 1,
    writing: 1,
    schedules: [] as { day: string; time: string }[],
  });

  const { data: students = [], isLoading } = useQuery({
    queryKey: ["students"],
    queryFn: async () => {
      const res = await api.get("/accounts/users/");
      const usersData = Array.isArray(res.data) ? res.data : (res.data.results || []);
      return usersData.filter((u: any) => u.role === "student");
    },
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
    mutationFn: async (data: typeof formData) => {
      if (editingStudentId) {
        const payload: any = {
          name: data.name,
          email: data.email,
          level: data.level,
          listening: data.listening,
          speaking: data.speaking,
          reading: data.reading,
          writing: data.writing,
        };
        if (data.password) payload.password = data.password;
        await api.patch(`/accounts/users/${editingStudentId}/`, payload);
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
        description: err.response?.data?.schedule || err.response?.data?.email?.[1] || err.response?.data?.error || "Verifique os dados e tente novamente.",
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

  const openEditModal = (student: any) => {
    setFormData({
      name: student.name || "",
      email: student.email || "",
      password: "",
      level: student.level || "A1/A2",
      listening: student.listening ?? 1,
      speaking: student.speaking ?? 1,
      reading: student.reading ?? 1,
      writing: student.writing ?? 1,
      schedules: [],
    });
    setEditingStudentId(student.id);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingStudentId(null);
    setFormData({ name: "", email: "", password: "", level: "A1/A2", listening: 1, speaking: 1, reading: 1, writing: 1, schedules: [] });
  };


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
                  const totalLessons = getTotalLessons(student.level || "A1/A2");
                  const completedLessons = getCompletedLessons(student);
                  const lessonProgress = totalLessons > 0 ? Math.min((completedLessons / totalLessons) * 100, 100) : 0;
                  return (
                    <tr
                      key={student.id}
                      className={[
                        "transition-colors hover:bg-slate-50/90",
                        index % 2 === 0 ? "bg-white/90" : "bg-sky-50/45",
                      ].join(" ")}
                    >
                      <td className="px-5 py-4 align-top">
                        <div className="flex min-w-[260px] items-start gap-4">
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground shadow-sm">
                            {getInitials(studentName)}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-base font-semibold text-foreground">{studentName}</p>
                            <p className="mt-1 truncate text-sm text-muted-foreground">{student.email}</p>
                            <p className="mt-3 text-xs text-muted-foreground">
                              Perfil academico pronto para acompanhamento continuo.
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <div className="min-w-[180px]">
                          <span className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
                            {getLevelLabel(student.level)}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <div className="min-w-[210px] rounded-xl border border-border/70 bg-white/75 p-4 shadow-sm">
                          <div className="flex items-end justify-between gap-3">
                            <div>
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">Aulas concluidas</p>
                              <p className="mt-1 text-lg font-semibold text-foreground">
                                {completedLessons}/{totalLessons}
                              </p>
                            </div>
                            <span className="text-xs text-muted-foreground">trilha</span>
                          </div>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${lessonProgress}%` }} />
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {completedLessons > 0 ? "Acompanhamento ativo da sequencia de aulas." : "Trilha pronta para iniciar o acompanhamento."}
                          </p>
                        </div>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <div className="grid min-w-[320px] gap-3 sm:grid-cols-2">
                          {skillConfigs.map((skill) => {
                            const skillValue = getSafeSkillValue(student[skill.key]);

                            return (
                              <div key={skill.key} className="rounded-xl border border-border/70 bg-white/75 p-3 shadow-sm">
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
                      <td className="px-5 py-4 align-top">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto pt-10 pb-10">
          <div className="bg-card border border-border p-6 rounded-xl w-full max-w-md my-auto">
            <h2 className="text-lg font-semibold mb-4">
              {editingStudentId ? "Editar Aluno" : "Cadastrar Novo Aluno"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nome do Aluno</label>
                <input
                  required type="text"
                  className="w-full p-2 rounded-lg border border-border bg-background"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">E-mail</label>
                <input
                  required type="email"
                  className="w-full p-2 rounded-lg border border-border bg-background"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {editingStudentId ? "Nova Senha (opcional)" : "Senha Inicial"}
                </label>
                <input
                  required={!editingStudentId} 
                  type="password"
                  className="w-full p-2 rounded-lg border border-border bg-background"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Nível Base</label>
                <select
                  required className="w-full p-2 rounded-lg border border-border bg-background"
                  value={formData.level}
                  onChange={(e) => setFormData({...formData, level: e.target.value})}
                >
                  {Object.keys(curriculumData).filter(k => k !== "ALL LEVELS").map((lvl) => (
                    <option key={lvl} value={lvl}>{lvl}</option>
                  ))}
                </select>
              </div>
              
              <div className="grid grid-cols-2 gap-4 pt-2">
                {(["listening", "speaking", "reading", "writing"] as const).map(skill => (
                  <div key={skill}>
                    <label className="block text-sm font-medium mb-1 capitalize">{skill}</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      className="w-full p-2 rounded-lg border border-border bg-background"
                      value={formData[skill as keyof typeof formData]}
                      onChange={(e) => setFormData({...formData, [skill]: parseInt(e.target.value)})}
                    />
                  </div>
                ))}
              </div>
              
              <div className="flex gap-3 justify-end pt-4">
                <Button type="button" variant="outline" onClick={closeModal}>Cancelar</Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Salvando..." : (editingStudentId ? "Salvar Edição" : "Cadastrar")}
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
