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

const getInitials = (name: string) => {
  if (!name) return "A";
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
};

const getTotalLessons = (level: string) => {
  const levelData = curriculumData[level as keyof typeof curriculumData] || { lessons: [], grammar: [] };
  const transversalData = curriculumData["ALL LEVELS"] || { lessons: [], grammar: [] };
  return levelData.lessons.length + levelData.grammar.length + transversalData.lessons.length + transversalData.grammar.length;
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
      <div className="flex items-center justify-between mb-6">
        <PageHeader title="Alunos" description={`${students.length} alunos cadastrados`} />
        <Button asChild>
          <Link to="/alunos/novo">+ Novo Aluno</Link>
        </Button>
      </div>


      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <input 
          type="text"
          placeholder="Buscar aluno..."
          className="w-full pl-10 pr-4 py-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <p>Carregando alunos...</p>
        ) : filteredStudents.length === 0 ? (
          <p className="text-muted-foreground">Nenhum aluno encontrado.</p>
        ) : (
          filteredStudents.map((student: any) => (
            <div key={student.id} className="bg-card border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow relative group">
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-black text-white rounded-full flex items-center justify-center font-bold text-xl flex-shrink-0">
                    {getInitials(student.name)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg text-foreground">{student.name || "Aluno sem nome"}</h3>
                    <p className="text-sm text-muted-foreground">
                      {student.level === "A1/A2" ? "Básico (A1/A2)" : `Nível (${student.level || "A1/A2"})`} - {student.email}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="text-right flex flex-col items-center">
                    <span className="font-bold text-base leading-none">0/{getTotalLessons(student.level || "A1/A2")}</span>
                    <span className="text-xs text-muted-foreground">aulas</span>
                  </div>

                  <div className="flex gap-2 text-muted-foreground opacity-100 transition-opacity">
                    <PastLessonSummary
                      student={student}
                      compact
                      buttonVariant="ghost"
                      buttonClassName="h-auto p-1 text-muted-foreground hover:text-primary hover:bg-muted"
                    />
                    <Link
                      to={`/alunos/${student.id}/aulas`}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-primary transition-colors"
                      title="Abrir histórico do aluno"
                    >
                      <BookOpenCheck size={16} />
                      Histórico
                    </Link>
                    <button 
                      onClick={() => openEditModal(student)} 
                      className="p-1 hover:text-primary hover:bg-muted rounded transition-colors"
                      title="Editar"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button 
                      onClick={() => {
                        if(window.confirm(`Excluir o aluno ${student.name}?`)) {
                          deleteMutation.mutate(student.id);
                        }
                      }} 
                      className="p-1 hover:text-destructive hover:bg-red-50 rounded transition-colors"
                      title="Remover"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                {[
                  { name: "Listening", val: student.listening ?? 1 },
                  { name: "Speaking", val: student.speaking ?? 1 },
                  { name: "Reading", val: student.reading ?? 1 },
                  { name: "Writing", val: student.writing ?? 1 },
                ].map(skill => (
                  <div key={skill.name} className="flex flex-col gap-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-foreground">{skill.name}</span>
                      <span className="text-muted-foreground text-xs">{skill.val}/10</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div className="bg-black h-full rounded-full" style={{ width: `${(skill.val / 10) * 100}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

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
