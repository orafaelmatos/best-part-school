import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle,
  History,
  ImagePlus,
  Link as LinkIcon,
  Loader2,
  NotebookPen,
  Save,
  Trash2,
  XCircle,
} from "lucide-react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import { FlashcardEditor } from "@/components/FlashcardEditor";
import { HomeworkPanel } from "@/components/HomeworkPanel";
import PastLessonSummary from "@/components/PastLessonSummary";
import LessonSummarySection from "@/components/LessonSummarySection";
import { useAuth } from "@/contexts/AuthContext";
import { APP_PATHS } from "@/lib/routes";
import { sortLessonsBySequence } from "@/lib/lessonSequence";
import type { LessonHistoryLesson } from "@/lib/studentLessonHistory";
import {
  formatLessonDate,
  sortLessonsByDateDesc,
  stripHtml,
} from "@/lib/studentLessonHistory";

type LessonSaveStatus = "scheduled" | "in_progress" | "completed" | "canceled";
type LessonPickerMode = "past" | "future";
type AutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error";
type ManualSaveAction = {
  status: LessonSaveStatus;
  stayOnPage?: boolean;
};

const PLANNABLE_STATUSES = ["pending", "scheduled", "rescheduled", "in_progress"];

const normalizeList = (data: any) => Array.isArray(data) ? data : (data?.results || []);

const makeLessonFormSnapshot = ({
  title,
  notes,
  meetingUrl,
  date,
  time,
}: {
  title: string;
  notes: string;
  meetingUrl: string;
  date: string;
  time: string;
}) => JSON.stringify({ title, notes, meetingUrl, date, time });

const removeImageFromNotesHtml = (html: string, imageUrl?: string) => {
  if (!html || !imageUrl || typeof document === "undefined") {
    return html || "";
  }
  const element = document.createElement("div");
  element.innerHTML = html;
  element.querySelectorAll("img").forEach((image) => {
    if (image.getAttribute("src") === imageUrl || image.src === imageUrl) {
      image.remove();
    }
  });
  return element.innerHTML;
};

const hasLessonNotes = (lesson: Pick<LessonHistoryLesson, "notes">) =>
  stripHtml(lesson.notes || "").trim().length > 0;

const isPastAnnotatedLesson = (lesson: LessonHistoryLesson) => {
  if (!hasLessonNotes(lesson)) {
    return false;
  }
  if (lesson.status === "completed") {
    return true;
  }
  if (!lesson.date) {
    return false;
  }
  const lessonTime = new Date(lesson.date).getTime();
  return !Number.isNaN(lessonTime) && lessonTime < Date.now();
};

const isFuturePlannableLesson = (lesson: LessonHistoryLesson) => {
  if (!PLANNABLE_STATUSES.includes(lesson.status)) {
    return false;
  }
  if (lesson.status === "pending" || lesson.status === "in_progress" || !lesson.date) {
    return true;
  }
  const lessonTime = new Date(lesson.date).getTime();
  return Number.isNaN(lessonTime) || lessonTime >= Date.now();
};

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
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSnapshotRef = useRef("");
  const hydratingSnapshotRef = useRef("");

  const [title, setTitle] = useState("");
  const [studentId, setStudentId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [students, setStudents] = useState<any[]>([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [lessonPickerMode, setLessonPickerMode] = useState<LessonPickerMode | null>(null);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);
  const [isSwitchingLesson, setIsSwitchingLesson] = useState(false);

  const { data: lesson, isLoading } = useQuery({
    queryKey: ["lesson", id],
    queryFn: async () => {
      const res = await api.get(`/lessons/${id}/`);
      return res.data;
    },
  });

  const lockedCalendarFlow = searchParams.get("from") === "calendar" || lesson?.status === "in_progress" || lesson?.status === "completed";
  const expectedStudentId = searchParams.get("student") || "";
  const mainLessonId = searchParams.get("main_lesson") || id || "";
  const lessonStudentId = lesson?.student ? String(lesson.student) : "";
  const contextStudentId = lessonStudentId || studentId || expectedStudentId;
  const studentContextMismatch = Boolean(expectedStudentId && lessonStudentId && expectedStudentId !== lessonStudentId);
  const isStudentContextLocked = Boolean(lessonStudentId);
  const contextStudent = students.find((student: any) => String(student.id) === String(contextStudentId));
  const currentStudentName =
    lesson?.student_name ||
    contextStudent?.name ||
    contextStudent?.email ||
    "Aluno";

  const { data: studentLessons = [], isLoading: studentLessonsLoading } = useQuery({
    queryKey: ["annotation-student-lessons", contextStudentId],
    queryFn: async () => {
      const res = await api.get("/lessons/", {
        params: {
          all: true,
          student: contextStudentId,
          is_template: false,
          ordering: "order",
        },
      });
      return normalizeList(res.data) as LessonHistoryLesson[];
    },
    enabled: Boolean(contextStudentId),
  });

  const pastAnnotatedLessons = useMemo(
    () =>
      sortLessonsByDateDesc(
        studentLessons.filter((studentLesson) => studentLesson.id !== id && isPastAnnotatedLesson(studentLesson)),
      ),
    [id, studentLessons],
  );

  const futurePlannableLessons = useMemo(
    () =>
      sortLessonsBySequence(
        studentLessons.filter((studentLesson) => studentLesson.id !== id && isFuturePlannableLesson(studentLesson)),
      ),
    [id, studentLessons],
  );

  const mainLesson = mainLessonId === id
    ? lesson
    : studentLessons.find((studentLesson) => String(studentLesson.id) === String(mainLessonId));
  const isViewingMainLesson = !mainLessonId || mainLessonId === id;
  const openedLessonLabel = isViewingMainLesson
    ? "Aula principal"
    : lesson && isFuturePlannableLesson(lesson)
      ? "Planejamento futuro"
      : "Histórico";
  const mainLessonTitle = mainLesson?.title || "Aula principal";
  const mainLessonDate = mainLesson?.date ? formatLessonDate(mainLesson.date) : "";
  const pickerLessons = lessonPickerMode === "past" ? pastAnnotatedLessons : futurePlannableLessons;
  const pickerTitle = lessonPickerMode === "past" ? "Anotações aulas passadas" : "Planejar aula futura";
  const pickerDescription =
    lessonPickerMode === "past"
      ? `Histórico de aulas anotadas de ${currentStudentName}.`
      : `Aulas futuras de ${currentStudentName} para preparar com antecedência.`;
  const pickerEmptyMessage =
    lessonPickerMode === "past"
      ? "Nenhuma aula passada com anotações foi encontrada para este aluno."
      : "Nenhuma aula futura foi encontrada para este aluno.";
  const autosaveLabel =
    autosaveStatus === "pending"
      ? "Salvando em instantes..."
      : autosaveStatus === "saving"
        ? "Salvando..."
        : autosaveStatus === "error"
          ? "Erro no autosave"
          : "Salvo automaticamente";
  const autosaveClassName =
    autosaveStatus === "error"
      ? "text-destructive"
      : autosaveStatus === "saved"
        ? "text-emerald-700"
        : "text-muted-foreground";
  const isLessonNavigationBusy = isSwitchingLesson || isUploadingImages;

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
      const initialTitle = lesson.title || "";
      const initialStudentId = lesson.student || "";
      const initialNotes = lesson.notes || "";
      const initialMeetingUrl = lesson.meeting_url || lesson.recording_url || "";
      let initialDate = "";
      let initialTime = "";
      if (lesson.date) {
        const d = new Date(lesson.date);
        initialDate = d.toISOString().split('T')[0];
        initialTime = d.toTimeString().slice(0, 5);
      }
      setTitle(initialTitle);
      setStudentId(initialStudentId);
      setDate(initialDate);
      setTime(initialTime);
      setNotes(initialNotes);
      setMeetingUrl(initialMeetingUrl);
      const initialSnapshot = makeLessonFormSnapshot({
        title: initialTitle,
        notes: initialNotes,
        meetingUrl: initialMeetingUrl,
        date: initialDate,
        time: initialTime,
      });
      lastSavedSnapshotRef.current = initialSnapshot;
      hydratingSnapshotRef.current = initialSnapshot;
      setAutosaveStatus("saved");
      populatedLessonIdRef.current = lesson.id;
    }
  }, [lesson]);

  const noteImages = (lesson?.attachments || []).filter((attachment: any) => attachment.is_image);
  const draftStatus: LessonSaveStatus =
    lesson?.status === "completed"
      ? "completed"
      : lesson?.status === "canceled"
        ? "canceled"
        : lockedCalendarFlow
          ? "in_progress"
          : "scheduled";
  const canCancelAnnotation = ["scheduled", "rescheduled", "in_progress"].includes(lesson?.status || "");
  const currentDraftSnapshot = useMemo(
    () => makeLessonFormSnapshot({ title, notes, meetingUrl, date, time }),
    [date, meetingUrl, notes, time, title],
  );

  const buildAutosavePayload = useCallback((notesOverride?: string) => {
    const payload: any = {
      title,
      notes: notesOverride ?? notes,
      meeting_url: meetingUrl,
    };
    if (!lockedCalendarFlow && date && time) {
      payload.date = new Date(`${date}T${time}`).toISOString();
    }
    return payload;
  }, [date, lockedCalendarFlow, meetingUrl, notes, time, title]);

  const invalidateAnnotationQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["lessons"] });
    queryClient.invalidateQueries({ queryKey: ["lesson", id] });
    queryClient.invalidateQueries({ queryKey: ["annotation-student-lessons", contextStudentId] });
    queryClient.invalidateQueries({ queryKey: ["calendar"] });
    queryClient.invalidateQueries({ queryKey: ["student-lesson-feed", lesson?.student] });
    queryClient.invalidateQueries({ queryKey: ["student-lesson-summaries-feed", lesson?.student] });
    queryClient.invalidateQueries({ queryKey: ["student-lesson-homework-feed", lesson?.student] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-student-lessons", lesson?.student] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-student-summaries", lesson?.student] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-student-homework", lesson?.student] });
    queryClient.invalidateQueries({ queryKey: ["student-vocabulary-dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-student-vocabulary"] });
  }, [contextStudentId, id, lesson?.student, queryClient]);

  const saveDraftNow = useCallback(async (options?: { notesOverride?: string; snapshot?: string; showErrorToast?: boolean }) => {
    if (!id || !lesson || studentContextMismatch) {
      return false;
    }
    const snapshot = options?.snapshot ?? currentDraftSnapshot;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (!options?.notesOverride && lastSavedSnapshotRef.current === snapshot) {
      return true;
    }
    setAutosaveStatus("saving");
    try {
      await api.patch(`/lessons/${id}/`, buildAutosavePayload(options?.notesOverride));
      lastSavedSnapshotRef.current = snapshot;
      setAutosaveStatus("saved");
      invalidateAnnotationQueries();
      return true;
    } catch (error) {
      console.error(error);
      setAutosaveStatus("error");
      if (options?.showErrorToast) {
        toast({
          title: "Erro ao salvar automaticamente",
          description: "As alterações não foram salvas. Tente novamente antes de trocar de aula.",
          variant: "destructive",
        });
      }
      return false;
    }
  }, [
    buildAutosavePayload,
    currentDraftSnapshot,
    id,
    invalidateAnnotationQueries,
    lesson,
    studentContextMismatch,
    toast,
  ]);

  useEffect(() => {
    if (hydratingSnapshotRef.current) {
      if (currentDraftSnapshot === hydratingSnapshotRef.current) {
        hydratingSnapshotRef.current = "";
      }
      return;
    }

    if (!lesson?.id || studentContextMismatch || lastSavedSnapshotRef.current === currentDraftSnapshot) {
      return;
    }

    setAutosaveStatus("pending");
    const snapshot = currentDraftSnapshot;
    autosaveTimerRef.current = setTimeout(() => {
      saveDraftNow({ snapshot });
    }, 900);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [currentDraftSnapshot, lesson?.id, saveDraftNow, studentContextMismatch]);

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

  const handleRemoveImage = async (attachment: any) => {
    if (!id || deletingImageId) {
      return;
    }

    const nextNotes = removeImageFromNotesHtml(notes, attachment.file_url);
    const nextSnapshot = makeLessonFormSnapshot({
      title,
      notes: nextNotes,
      meetingUrl,
      date,
      time,
    });

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    setDeletingImageId(attachment.id);
    setAutosaveStatus("saving");
    try {
      await api.patch(`/lessons/${id}/`, buildAutosavePayload(nextNotes));
      await api.delete(`/lessons-attachments/${attachment.id}/`);
      setNotes(nextNotes);
      lastSavedSnapshotRef.current = nextSnapshot;
      setAutosaveStatus("saved");
      invalidateAnnotationQueries();
      toast({ title: "Imagem removida das anotações." });
    } catch (error) {
      console.error(error);
      setAutosaveStatus("error");
      toast({
        title: "Erro ao remover imagem",
        description: "Não foi possível remover esta imagem agora.",
        variant: "destructive",
      });
    } finally {
      setDeletingImageId(null);
    }
  };

  const updateMutation = useMutation({
    mutationFn: async ({ status, stayOnPage }: ManualSaveAction) => {
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
      if (!lockedCalendarFlow && !isStudentContextLocked) {
        payload.student = studentId;
      }
      if (!lockedCalendarFlow) {
        payload.date = datetime;
      }
      
      await api.patch(`/lessons/${id}/`, payload);
      return { status, stayOnPage };
    },
    onSuccess: (_response, { status: savedStatus, stayOnPage }) => {
      lastSavedSnapshotRef.current = currentDraftSnapshot;
      setAutosaveStatus("saved");
      invalidateAnnotationQueries();
      toast(
        savedStatus === "canceled"
          ? {
              title: "Anotação cancelada",
              description: "A aula foi marcada como cancelada e saiu da trilha ativa do aluno.",
            }
          : { title: "Aula salva com sucesso!" },
      );
      if (stayOnPage || (savedStatus !== "completed" && savedStatus !== "canceled")) {
        return;
      }
      if ((user?.role === "teacher" || user?.role === "admin") && lesson?.student) {
        navigate(APP_PATHS.studentLessons(lesson.student));
        return;
      }
      navigate(APP_PATHS.lessons);
    },
    onError: (_error, { status: savedStatus }) => {
      toast({
        title: savedStatus === "canceled" ? "Erro ao cancelar anotação" : "Erro ao salvar",
        variant: "destructive",
      });
    }
  });

  const handleSave = (status: LessonSaveStatus, stayOnPage = false) => {
    if (studentContextMismatch) {
      toast({
        title: "Aula fora do contexto do aluno",
        description: "Abra uma aula vinculada a este aluno antes de salvar anotações.",
        variant: "destructive",
      });
      return;
    }
    updateMutation.mutate({ status, stayOnPage });
  };

  const buildAnnotationPath = (lessonId: string, keepMainLesson = true) => {
    const params = new URLSearchParams();
    if (contextStudentId) {
      params.set("student", contextStudentId);
    }
    if (keepMainLesson && mainLessonId && lessonId !== mainLessonId) {
      params.set("main_lesson", mainLessonId);
    }
    const query = params.toString();
    return `${APP_PATHS.annotateLesson(lessonId)}${query ? `?${query}` : ""}`;
  };

  const openLessonInStudentContext = async (lessonId: string, keepMainLesson = true) => {
    if (isLessonNavigationBusy) {
      return;
    }
    setIsSwitchingLesson(true);
    const saved = await saveDraftNow({ showErrorToast: true });
    if (!saved) {
      setIsSwitchingLesson(false);
      return;
    }
    setLessonPickerMode(null);
    navigate(buildAnnotationPath(lessonId, keepMainLesson));
    setIsSwitchingLesson(false);
  };

  const returnToMainLesson = async () => {
    if (!mainLessonId) {
      return;
    }
    if (isLessonNavigationBusy) {
      return;
    }
    setIsSwitchingLesson(true);
    const saved = await saveDraftNow({ showErrorToast: true });
    if (!saved) {
      setIsSwitchingLesson(false);
      return;
    }
    if (!contextStudentId) {
      navigate(APP_PATHS.annotateLesson(mainLessonId));
      setIsSwitchingLesson(false);
      return;
    }
    navigate(buildAnnotationPath(mainLessonId, false));
    setIsSwitchingLesson(false);
  };

  const handleCancelAnnotation = () => {
    if (!canCancelAnnotation || updateMutation.isPending) {
      return;
    }
    setIsCancelDialogOpen(true);
  };

  const confirmCancelAnnotation = () => {
    setIsCancelDialogOpen(false);
    handleSave("canceled");
  };

  if (isLoading) return <DashboardLayout><p>Carregando...</p></DashboardLayout>;
  if (!lesson) return <DashboardLayout><p>Aula não encontrada.</p></DashboardLayout>;
  if (studentContextMismatch) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <h1 className="font-semibold">Aula fora do contexto do aluno</h1>
              <p className="mt-1 text-sm">
                Esta aula pertence a outro aluno. Volte para a lista correta antes de fazer anotações.
              </p>
              <Button
                type="button"
                className="mt-4"
                onClick={() => navigate(APP_PATHS.studentLessons(expectedStudentId))}
              >
                Voltar para aulas do aluno
              </Button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader 
          title="Anotar Aula" 
          description={lockedCalendarFlow ? "Faça anotações, crie atividades e finalize a aula iniciada pelo calendário." : "Edite os dados da aula, faça anotações e crie atividades."}
        />
      </div>

      <div className="w-full space-y-6">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                  {openedLessonLabel}
                </span>
                <span className="text-xs font-medium text-muted-foreground">{currentStudentName}</span>
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-card-foreground">{lesson.title}</h2>
                <p className="text-sm text-muted-foreground">{formatLessonDate(lesson.date)}</p>
                <p className={`mt-1 flex items-center gap-1.5 text-xs font-medium ${autosaveClassName}`}>
                  {(autosaveStatus === "pending" || autosaveStatus === "saving") && (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  )}
                  {autosaveLabel}
                </p>
              </div>
              {!isViewingMainLesson && (
                <div className="flex flex-col gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-card-foreground sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <span className="text-muted-foreground">Aula principal: </span>
                    <span className="font-semibold">{mainLessonTitle}</span>
                    {mainLessonDate && <span className="text-muted-foreground"> · {mainLessonDate}</span>}
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={returnToMainLesson} disabled={isLessonNavigationBusy}>
                    {isLessonNavigationBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowLeft className="mr-2 h-4 w-4" />}
                    Voltar
                  </Button>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row xl:shrink-0">
              <PastLessonSummary currentLesson={lesson} buttonClassName="shrink-0" />
              {!isViewingMainLesson && (
                <Button type="button" variant="outline" onClick={returnToMainLesson} disabled={isLessonNavigationBusy}>
                  {isLessonNavigationBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowLeft className="mr-2 h-4 w-4" />}
                  Aula principal
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => setLessonPickerMode("past")} disabled={isLessonNavigationBusy}>
                <History className="mr-2 h-4 w-4" /> Ver anotações aulas passadas
              </Button>
              <Button type="button" onClick={() => setLessonPickerMode("future")} disabled={isLessonNavigationBusy}>
                <CalendarClock className="mr-2 h-4 w-4" /> Planejar aula futura
              </Button>
            </div>
          </div>
        </div>

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
                {isStudentContextLocked ? (
                  <div>
                    <label className="block text-sm font-semibold mb-1">Aluno</label>
                    <div className="w-full rounded-lg border border-border bg-muted p-2 text-sm">
                      {currentStudentName}
                    </div>
                  </div>
                ) : (
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
                )}
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
                  <div
                    key={attachment.id}
                    className="overflow-hidden rounded-xl border border-border bg-muted/20"
                  >
                    <a href={attachment.file_url} target="_blank" rel="noreferrer">
                      <img src={attachment.file_url} alt={attachment.file_name || "Imagem da aula"} className="h-40 w-full object-cover" />
                    </a>
                    <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
                      <a href={attachment.file_url} target="_blank" rel="noreferrer" className="min-w-0 truncate hover:text-foreground">
                        {attachment.file_name}
                      </a>
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(attachment)}
                        disabled={deletingImageId === attachment.id}
                        className="rounded-md p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                        title="Remover imagem"
                        aria-label="Remover imagem"
                      >
                        {deletingImageId === attachment.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Vocabulary Field */}
        <div className="bg-card p-6 border border-border rounded-xl shadow-sm">
          <FlashcardEditor
            lesson={lesson}
            refetch={() => queryClient.invalidateQueries({ queryKey: ["lesson", id] })}
            onBeforePersist={() => saveDraftNow({ showErrorToast: true })}
          />
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
            onClick={() => handleSave(draftStatus, true)}
            disabled={updateMutation.isPending}
          >
            <Save className="mr-2 h-4 w-4" /> Salvar como Rascunho
          </Button>
          {canCancelAnnotation && (
            <Button
              variant="destructive"
              onClick={handleCancelAnnotation}
              disabled={updateMutation.isPending}
            >
              <XCircle className="mr-2 h-4 w-4" /> Cancelar anotação
            </Button>
          )}
          <Button 
            onClick={() => handleSave("completed")}
            className="bg-green-600 hover:bg-green-700 text-white"
            disabled={updateMutation.isPending}
          >
            <CheckCircle className="mr-2 h-4 w-4" /> Marcar como Concluída
          </Button>
        </div>
      </div>
      <Dialog open={lessonPickerMode !== null} onOpenChange={(open) => !open && setLessonPickerMode(null)}>
        <DialogContent className="max-h-[82vh] overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="border-b border-border px-6 py-5">
            <DialogTitle>{pickerTitle}</DialogTitle>
            <DialogDescription>{pickerDescription}</DialogDescription>
          </DialogHeader>
          {!isViewingMainLesson && (
            <div className="border-b border-border bg-muted/30 px-6 py-3">
              <button
                type="button"
                onClick={returnToMainLesson}
                disabled={isLessonNavigationBusy}
                className="flex w-full items-center justify-between gap-4 rounded-lg px-2 py-2 text-left transition hover:bg-background"
              >
                <span className="min-w-0">
                  <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Aula principal
                  </span>
                  <span className="mt-1 block truncate text-sm font-semibold text-card-foreground">
                    {mainLessonTitle}
                  </span>
                </span>
                {isLessonNavigationBusy ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  <ArrowLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </button>
            </div>
          )}
          <div className="max-h-[62vh] overflow-y-auto px-6 pb-6">
            {studentLessonsLoading ? (
              <p className="py-6 text-sm text-muted-foreground">Carregando aulas...</p>
            ) : pickerLessons.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">{pickerEmptyMessage}</p>
            ) : (
              <div className="space-y-2 pt-4">
                {pickerLessons.map((studentLesson) => (
                  <button
                    key={studentLesson.id}
                    type="button"
                    onClick={() => openLessonInStudentContext(studentLesson.id)}
                    disabled={isLessonNavigationBusy}
                    className="flex w-full items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3 text-left transition hover:border-primary/50 hover:bg-accent disabled:cursor-wait disabled:opacity-60"
                  >
                    <span className="min-w-0">
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-card-foreground">
                          {studentLesson.title}
                        </span>
                        {studentLesson.id === mainLessonId && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                            Aula principal
                          </span>
                        )}
                        {lessonPickerMode === "future" && hasLessonNotes(studentLesson) && (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                            Planejada
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {formatLessonDate(studentLesson.date)}
                      </span>
                    </span>
                    {isLessonNavigationBusy ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : (
                      <NotebookPen className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar anotação?</AlertDialogTitle>
            <AlertDialogDescription>
              A aula será marcada como cancelada e deixará de contar na trilha ativa do aluno.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateMutation.isPending}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancelAnnotation}
              disabled={updateMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Confirmar cancelamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default AnotarAula;
