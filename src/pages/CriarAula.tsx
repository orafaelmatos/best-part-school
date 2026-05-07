import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import { api } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import CreatableSelect from "react-select/creatable";
import ScheduleSlotPicker from "@/components/ScheduleSlotPicker";

const CriarAula = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState<any[]>([]);
  const [templateOptions, setTemplateOptions] = useState<{label: string, value: string, title: string, level: string}[]>([]);
  const [calendarEvent, setCalendarEvent] = useState<any | null>(null);
  const eventId = searchParams.get("event");
  
  const [formData, setFormData] = useState({
    title: "",
    templateId: "",
    level: "A1",
    date: "",
    time: "",
    scheduledAt: "",
    studentId: "",
    meetingUrl: "",
  });

  useEffect(() => {
    const fetchStudents = async () => {
      try {
        const response = await api.get("/accounts/users/");
        const usersData = Array.isArray(response.data) ? response.data : (response.data.results || []);
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
        const response = await api.get("/lessons/templates/");
        const lessonsData = Array.isArray(response.data) ? response.data : (response.data.results || []);
        
        // Map templates
        const tOpts = lessonsData
           .filter((l: any) => l.is_template)
           .map((l: any) => ({ label: `[${l.level}] ${l.title}`, value: l.id, title: l.title, level: l.level }));
           
        setTemplateOptions(tOpts);
      } catch (err) {
        console.error("Failed to fetch lessons for autocomplete", err);
      }
    };

    fetchStudents();
    fetchLessons();
  }, []);

  useEffect(() => {
    if (!eventId) return;
    const fetchEvent = async () => {
      try {
        const response = await api.get(`/lessons/${eventId}/`);
        const lesson = response.data;
        setCalendarEvent(lesson);
        setFormData(prev => ({
          ...prev,
          title: lesson.title || "",
          templateId: lesson.template || "",
          level: lesson.level || prev.level,
          studentId: lesson.student || "",
        }));
      } catch (err) {
        alert("Evento de calendário não encontrado.");
        navigate("/calendario");
      }
    };
    fetchEvent();
  }, [eventId, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.studentId) {
      alert("Selecione um aluno.");
      return;
    }
    if (!formData.title) {
      alert("Selecione um título/template para a aula.");
      return;
    }
    if (!formData.templateId) {
      alert("A aula precisa estar conectada a um template.");
      return;
    }
    if (!eventId && !formData.scheduledAt) {
      alert("Selecione um horário disponível.");
      return;
    }
    
    setLoading(true);
    try {
      if (eventId) {
        const response = await api.patch(`/lessons/${eventId}/start_lesson/`, {
          template: formData.templateId,
        });
        queryClient.invalidateQueries({ queryKey: ["lessons"] });
        queryClient.invalidateQueries({ queryKey: ["calendar"] });
        navigate(`/aulas/${response.data.id}/anotar?from=calendar`);
        return;
      }

      await api.post("/lessons/", {
        title: formData.title,
        level: formData.level,
        template: formData.templateId,
        date: formData.scheduledAt,
        status: "scheduled",
        teacher: user?.user_id, // user is logged in
        student: formData.studentId,
        meeting_url: formData.meetingUrl,
      });
      queryClient.invalidateQueries({ queryKey: ["lessons"] });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      
      navigate("/calendario");
    } catch (err) {
      alert("Erro ao criar aula");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <PageHeader
        title={eventId ? "Iniciar Aula" : "Criar Nova Aula"}
        description={eventId ? "Confirme o template da aula agendada." : "Adicione uma nova aula ao sistema."}
      />
      <div className="max-w-md bg-card p-6 border border-border rounded-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          {calendarEvent && (
            <div className="rounded-lg border border-border bg-muted p-3 text-sm">
              <p className="font-medium">{calendarEvent.student_name}</p>
              <p className="text-muted-foreground">
                {new Date(calendarEvent.date).toLocaleDateString("pt-BR", {
                  weekday: "long",
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          )}
          <div className="relative">
            <label className="block text-sm font-medium mb-1">Título da Aula</label>
            <CreatableSelect 
              options={templateOptions}
              placeholder="Pesquise a aula..."
              isClearable
              isValidNewOption={() => false}
              value={templateOptions.find(option => option.value === formData.templateId) || null}
              onChange={(option: any) => {
                if (option) {
                  setFormData({...formData, title: option.title, templateId: option.value, level: option.level || formData.level});
                } else {
                  setFormData({...formData, title: "", templateId: ""});
                }
              }}
              styles={{
                control: (baseStyles) => ({
                  ...baseStyles,
                  backgroundColor: 'hsl(var(--background))',
                  borderColor: 'hsl(var(--border))',
                  padding: '2px'
                }),
                menu: (baseStyles) => ({
                  ...baseStyles,
                  backgroundColor: 'hsl(var(--card))',
                }),
                option: (baseStyles, state) => ({
                  ...baseStyles,
                  backgroundColor: state.isFocused ? 'hsl(var(--accent))' : 'transparent',
                  color: 'hsl(var(--foreground))',
                  cursor: 'pointer',
                }),
                singleValue: (baseStyles) => ({
                  ...baseStyles,
                  color: 'hsl(var(--foreground))',
                }),
                input: (baseStyles) => ({
                  ...baseStyles,
                  color: 'hsl(var(--foreground))',
                })
              }}
            />
          </div>
          {!eventId && (
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
              <label className="block text-sm font-medium mb-1">Nível</label>
              <select 
                className="w-full p-2 rounded-lg border border-border bg-background" 
                value={formData.level} 
                onChange={e => setFormData({...formData, level: e.target.value})}
              >
                <option value="A1/A2">A1 / A2</option>
                <option value="A1">A1</option>
                <option value="A2">A2</option>
                <option value="B1">B1</option>
                <option value="B2">B2</option>
                <option value="C1">C1</option>
                <option value="C2">C2</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-2">Data e horário</label>
              <ScheduleSlotPicker
                teacherId={user?.user_id}
                value={formData.scheduledAt}
                onChange={(scheduledAt) => setFormData({...formData, scheduledAt})}
              />
            </div>
          </div>
          )}
          <button disabled={loading} className="w-full mt-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:opacity-90 transition-opacity">
            {loading ? "Salvando..." : (eventId ? "Iniciar Aula" : "Agendar Aula")}
          </button>
        </form>
      </div>
    </DashboardLayout>
  );
};
export default CriarAula;
