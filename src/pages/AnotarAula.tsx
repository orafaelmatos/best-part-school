import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Save, Link as LinkIcon, CheckCircle, ImagePlus, Loader2 } from "lucide-react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import { FlashcardEditor } from "@/components/FlashcardEditor";
import { HomeworkPanel } from "@/components/HomeworkPanel";
import PastLessonSummary from "@/components/PastLessonSummary";
import LessonSummarySection from "@/components/LessonSummarySection";
import { useAuth } from "@/contexts/AuthContext";

const AnotarAula = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const quillRef = useRef<ReactQuill | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const populatedLessonIdRef = useRef<string | null>(null);

  const [title, setTitle] = useState("");
  const [studentId, setStudentId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [students, setStudents] = useState<any[]>([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);

  const { data: lesson, isLoading } = useQuery({
    queryKey: ["lesson", id],
    queryFn: async () => {
      const res = await api.get(`/lessons/${id}/`);
      return res.data;
    },
  });

  const lockedCalendarFlow = searchParams.get("from") === "calendar" || lesson?.status === "in_progress" || lesson?.status === "completed";

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
    if (lesson && populatedLessonIdRef.current !== lesson.id) {
      setTitle(lesson.title || "");
      setStudentId(lesson.student || "");
      if (lesson.date) {
        const d = new Date(lesson.date);
        setDate(d.toISOString().split('T')[0]);
        setTime(d.toTimeString().slice(0, 5));
      }
      setNotes(lesson.notes || "");
      setMeetingUrl(lesson.meeting_url || lesson.recording_url || "");
      populatedLessonIdRef.current = lesson.id;
    }
  }, [lesson]);

  const noteImages = (lesson?.attachments || []).filter((attachment: any) => attachment.is_image);

  const quillModules = useMemo(() => ({
    toolbar: {
      container: [
        [{ header: [1, 2, false] }],
        ["bold", "italic", "underline", "strike", "blockquote"],
        [{ list: "ordered" }, { list: "bullet" }],
        ["link", "image"],
        ["clean"],
      ],
      handlers: {
        image: () => imageInputRef.current?.click(),
      },
    },
  }), []);

  const quillFormats = useMemo(
    () => ["header", "bold", "italic", "underline", "strike", "blockquote", "list", "bullet", "link", "image"],
    [],
  );

  const insertImageAtCursor = (imageUrl: string) => {
    const editor = quillRef.current?.getEditor();
    if (!editor) return;
    const selection = editor.getSelection(true);
    const index = selection?.index ?? editor.getLength();
    editor.insertEmbed(index, "image", imageUrl, "user");
    editor.insertText(index + 1, "\n", "user");
    editor.setSelection(index + 2, 0);
    setNotes(editor.root.innerHTML);
  };

  const uploadImagesToNotes = async (files: FileList | null) => {
    if (!files?.length || !id) return;
    setIsUploadingImages(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const formData = new FormData();
        formData.append("lesson", id);
        formData.append("file", file);
        const response = await api.post("/lessons-attachments/", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        if (response.data?.file_url) {
          insertImageAtCursor(response.data.file_url);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["lesson", id] });
      toast({ title: "Imagens anexadas às anotações." });
    } catch (error) {
      console.error(error);
      toast({ title: "Erro ao anexar imagens", variant: "destructive" });
    } finally {
      setIsUploadingImages(false);
    }
  };

  const openImagePicker = () => {
    imageInputRef.current?.click();
  };

  const updateMutation = useMutation({
    mutationFn: async (status: string) => {
      let datetime = lesson.date;
      if (date && time) {
        datetime = new Date(`${date}T${time}`).toISOString();
      }

      const payload: any = {
        title,
        notes,
        meeting_url: meetingUrl,
        status,
      };
      if (!lockedCalendarFlow) {
        payload.student = studentId;
        payload.date = datetime;
      }
      
      await api.patch(`/lessons/${id}/`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lessons"] });
      queryClient.invalidateQueries({ queryKey: ["lesson", id] });
      queryClient.invalidateQueries({ queryKey: ["student-lesson-feed", lesson?.student] });
      queryClient.invalidateQueries({ queryKey: ["student-lesson-summaries-feed", lesson?.student] });
      queryClient.invalidateQueries({ queryKey: ["student-lesson-homework-feed", lesson?.student] });
      toast({ title: "Aula salva com sucesso!" });
      if ((user?.role === "teacher" || user?.role === "admin") && lesson?.student) {
        navigate(`/alunos/${lesson.student}/aulas`);
        return;
      }
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader 
          title="Anotar Aula" 
          description={lockedCalendarFlow ? "Faça anotações, crie atividades e finalize a aula iniciada pelo calendário." : "Edite os dados da aula, faça anotações e crie atividades."}
        />
        <PastLessonSummary currentLesson={lesson} buttonClassName="shrink-0" />
      </div>

      <div className="w-full space-y-6">
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
                readOnly={lockedCalendarFlow}
              />
            </div>
            {lockedCalendarFlow ? (
              <div className="md:col-span-2 rounded-lg border border-border bg-muted p-3 text-sm">
                <p className="font-medium">{lesson.student_name}</p>
                <p className="text-muted-foreground">
                  {lesson.date && new Date(lesson.date).toLocaleDateString("pt-BR", {
                    weekday: "long",
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>

        {/* Rich Text */}
        <div className="bg-card p-6 border border-border rounded-xl shadow-sm">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              uploadImagesToNotes(event.target.files);
              event.target.value = "";
            }}
          />
          <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-sm font-semibold">Anotações da Aula</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Use texto, links e imagens de slides ou do quadro para registrar o contexto que a IA vai reutilizar.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={openImagePicker} disabled={isUploadingImages}>
              {isUploadingImages ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
              {isUploadingImages ? "Enviando imagens..." : "Adicionar imagens"}
            </Button>
          </div>
          <div className="bg-background rounded-md overflow-hidden border border-border h-80">
            <ReactQuill 
              ref={quillRef}
              theme="snow" 
              value={notes} 
              onChange={setNotes} 
              placeholder="Escreva o contexto da aula aqui. Você pode misturar texto, links e imagens."
              style={{ height: '100%', border: 'none' }}
              modules={quillModules}
              formats={quillFormats}
            />
          </div>
          <div className="mt-4 space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Imagens vinculadas a esta anotação
            </p>
            {noteImages.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma imagem anexada ainda.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {noteImages.map((attachment: any) => (
                  <a
                    key={attachment.id}
                    href={attachment.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="overflow-hidden rounded-xl border border-border bg-muted/20"
                  >
                    <img src={attachment.file_url} alt={attachment.file_name || "Imagem da aula"} className="h-40 w-full object-cover" />
                    <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                      {attachment.file_name}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Vocabulary Field */}
        <div className="bg-card p-6 border border-border rounded-xl shadow-sm">
          <FlashcardEditor lesson={lesson} refetch={() => queryClient.invalidateQueries({ queryKey: ["lesson", id] })} />
        </div>

        <HomeworkPanel lesson={lesson} />

        <LessonSummarySection lesson={lesson} notes={notes} />

        {/* Lesson Link */}
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

        <div className="flex gap-4 justify-end mt-8 border-t border-border pt-6">
          <Button 
            variant="outline" 
            onClick={() => handleSave(lockedCalendarFlow ? "in_progress" : "scheduled")}
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
