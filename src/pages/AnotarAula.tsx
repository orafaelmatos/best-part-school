import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Save, Link as LinkIcon, CheckCircle, Paperclip } from "lucide-react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";

const AnotarAula = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [studentId, setStudentId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [students, setStudents] = useState<any[]>([]);

  const { data: lesson, isLoading } = useQuery({
    queryKey: ["lesson", id],
    queryFn: async () => {
      const res = await api.get(`/lessons/${id}/`);
      return res.data;
    },
  });

  useEffect(() => {
    const fetchStudents = async () => {
      try {
        const response = await api.get("/accounts/users/");
        const usersData = Array.isArray(response.data) ? response.data : (response.data.results || []);
        setStudents(usersData.filter((u: any) => u.role === "student"));
      } catch (err) {
        console.error("Failed to fetch students", err);
      }
    };
    fetchStudents();
  }, []);

  useEffect(() => {
    if (lesson) {
      setTitle(lesson.title || "");
      setStudentId(lesson.student || "");
      if (lesson.date) {
        const d = new Date(lesson.date);
        setDate(d.toISOString().split('T')[0]);
        setTime(d.toTimeString().slice(0, 5));
      }
      setNotes(lesson.notes || "");
      // Combinando as duas origens antigas num único link, se houver
      setMeetingUrl(lesson.meeting_url || lesson.recording_url || "");
    }
  }, [lesson]);

  const updateMutation = useMutation({
    mutationFn: async (status: string) => {
      let datetime = lesson.date;
      if (date && time) {
        datetime = new Date(`${date}T${time}`).toISOString();
      }

      const payload = {
        title,
        student: studentId,
        date: datetime,
        notes,
        meeting_url: meetingUrl,
        status,
      };
      
      // Upload file if exists
      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("lesson", id!);
        await api.post("/lessons-attachments/", formData, { 
          headers: { "Content-Type": "multipart/form-data" }
        }).catch(err => console.log('Erro ao subir anexo, ignorando', err));
      }

      await api.patch(`/lessons/${id}/`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lessons"] });
      queryClient.invalidateQueries({ queryKey: ["lesson", id] });
      toast({ title: "Aula salva com sucesso!" });
      navigate("/aulas");
    },
    onError: () => {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    }
  });

  const handleSave = (status: string) => {
    updateMutation.mutate(status);
  };

  if (isLoading) return <DashboardLayout><p>Carregando...</p></DashboardLayout>;
  if (!lesson) return <DashboardLayout><p>Aula não encontrada.</p></DashboardLayout>;

  return (
    <DashboardLayout>
      <PageHeader 
        title="Anotar Aula" 
        description="Edite os dados da aula, faça anotações e anexe materiais." 
      />

      <div className="max-w-4xl space-y-6">
        {/* Top Info Editor */}
        <div className="bg-card p-6 border border-border rounded-xl shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold mb-1">Título da Aula</label>
              <input 
                type="text" 
                className="w-full p-2 border border-border rounded-lg bg-background text-sm"
                value={title} 
                onChange={(e) => setTitle(e.target.value)} 
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Aluno</label>
              <select 
                className="w-full p-2 border border-border rounded-lg bg-background text-sm" 
                value={studentId} 
                onChange={(e) => setStudentId(e.target.value)}
              >
                <option value="" disabled>Selecione um aluno</option>
                {students.map((student: any) => (
                  <option key={student.id} value={student.id}>
                    {student.name || student.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-semibold mb-1">Data</label>
                <input 
                  type="date" 
                  className="w-full p-2 border border-border rounded-lg bg-background text-sm"
                  value={date} 
                  onChange={(e) => setDate(e.target.value)} 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Hora</label>
                <input 
                  type="time" 
                  className="w-full p-2 border border-border rounded-lg bg-background text-sm"
                  value={time} 
                  onChange={(e) => setTime(e.target.value)} 
                />
              </div>
            </div>
          </div>
        </div>

        {/* Rich Text */}
        <div className="bg-card p-6 border border-border rounded-xl shadow-sm">
          <h2 className="text-sm font-semibold mb-3">Anotações da Aula (Rich Text)</h2>
          <div className="bg-background rounded-md overflow-hidden border border-border h-80">
            <ReactQuill 
              theme="snow" 
              value={notes} 
              onChange={setNotes} 
              style={{ height: '100%', border: 'none' }}
              modules={{
                toolbar: [
                  [{ 'header': [1, 2, false] }],
                  ['bold', 'italic', 'underline', 'strike', 'blockquote'],
                  [{'list': 'ordered'}, {'list': 'bullet'}],
                  ['link'],
                  ['clean']
                ],
              }}
            />
          </div>
        </div>

        {/* Links and Attachments */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-card p-5 border border-border rounded-xl">
            <label className="flex items-center gap-2 text-sm font-semibold mb-2">
              <LinkIcon size={16} /> Link da Aula (URL)
            </label>
            <input 
              type="url" 
              placeholder="https://..." 
              className="w-full p-2 border border-border rounded-lg bg-background text-sm"
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
            />
          </div>
          
          <div className="bg-card p-5 border border-border rounded-xl">
            <label className="flex items-center gap-2 text-sm font-semibold mb-2">
              <Paperclip size={16} /> Anexar Material / Lição de Casa
            </label>
            <input 
              type="file" 
              className="w-full p-2 border border-border rounded-lg bg-background text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:opacity-90"
              onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
            />
          </div>
        </div>

        <div className="flex gap-4 justify-end mt-8 border-t border-border pt-6">
          <Button 
            variant="outline" 
            onClick={() => handleSave("scheduled")}
            disabled={updateMutation.isPending}
          >
            <Save className="mr-2 h-4 w-4" /> Salvar como Rascunho
          </Button>
          <Button 
            onClick={() => handleSave("completed")}
            className="bg-green-600 hover:bg-green-700 text-white"
            disabled={updateMutation.isPending}
          >
            <CheckCircle className="mr-2 h-4 w-4" /> Marcar como Concluída
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AnotarAula;
