import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import { api } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";

const CriarAula = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState<any[]>([]);
  const [existingTitles, setExistingTitles] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    title: "",
    level: "A1",
    date: "",
    time: "",
    studentId: "",
    meetingUrl: "",
  });

  useEffect(() => {
    const fetchStudents = async () => {
      try {
        const response = await api.get("/accounts/users/");
        const usersData = Array.isArray(response.data) ? response.data : (response.data.results || []);
        // Filter out those who are students
        const studentList = usersData.filter((u: any) => u.role === "student");
        setStudents(studentList);
        if (studentList.length > 0) {
          setFormData(prev => ({ ...prev, studentId: studentList[0].id }));
        }
      } catch (err) {
        console.error("Failed to fetch students", err);
      }
    };
    
    const fetchLessons = async () => {
      try {
        const response = await api.get("/lessons/");
        const lessonsData = Array.isArray(response.data) ? response.data : (response.data.results || []);
        const titles = Array.from(new Set(lessonsData.map((l: any) => l.title))).filter(Boolean) as string[];
        setExistingTitles(titles);
      } catch (err) {
        console.error("Failed to fetch lessons for autocomplete", err);
      }
    };

    fetchStudents();
    fetchLessons();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.studentId) {
      alert("Selecione um aluno.");
      return;
    }
    
    setLoading(true);
    try {
      const datetime = new Date(`${formData.date}T${formData.time}`).toISOString();
      const response = await api.post("/lessons/", {
        title: formData.title,
        level: formData.level,
        date: datetime,
        status: "scheduled",
        teacher: user?.user_id, // user is logged in
        student: formData.studentId,
        meeting_url: formData.meetingUrl,
      });
      queryClient.invalidateQueries({ queryKey: ["lessons"] });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      
      // Ir para a página de anotações para concluir/editar a aula
      const createdLessonId = response.data.id;
      navigate(`/aulas/${createdLessonId}/anotar`);
    } catch (err) {
      alert("Erro ao criar aula");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <PageHeader title="Criar Nova Aula" description="Adicione uma nova aula ao sistema." />
      <div className="max-w-md bg-card p-6 border border-border rounded-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <label className="block text-sm font-medium mb-1">Título da Aula</label>
            <input 
              required 
              type="text" 
              list="title-options"
              className="w-full p-2 rounded-lg border border-border bg-background" 
              value={formData.title} 
              onChange={e => setFormData({...formData, title: e.target.value})} 
              autoComplete="off"
              placeholder="Digite para criar ou buscar uma aula..."
            />
            <datalist id="title-options">
              {existingTitles.map(t => <option key={t} value={t} />)}
            </datalist>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Aluno</label>
              <select 
                className="w-full p-2 rounded-lg border border-border bg-background" 
                value={formData.studentId} 
                onChange={e => setFormData({...formData, studentId: e.target.value})}
              >
                {students.map((student: any) => (
                  <option key={student.id} value={student.id}>
                    {student.name || student.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Data</label>
              <input required type="date" className="w-full p-2 rounded-lg border border-border bg-background" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Hora</label>
              <input required type="time" className="w-full p-2 rounded-lg border border-border bg-background" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} />
            </div>
          </div>
          <button disabled={loading} className="w-full mt-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:opacity-90 transition-opacity">
            {loading ? "Iniciando..." : "Iniciar Aula"}
          </button>
        </form>
      </div>
    </DashboardLayout>
  );
};
export default CriarAula;
