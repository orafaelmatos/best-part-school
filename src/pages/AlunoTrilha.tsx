import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  GripVertical,
  NotebookText,
  Sparkles,
  Target,
  X,
} from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import LessonExperienceCard from "@/components/lesson-history/LessonExperienceCard";
import PageHeader from "@/components/PageHeader";
import ScheduleSlotPicker from "@/components/ScheduleSlotPicker";
import StatusBadge from "@/components/StatusBadge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { fetchAllPages } from "@/lib/fetchAllPages";
import { isReorderableLesson, sortLessonsBySequence } from "@/lib/lessonSequence";
import {
  LessonHistoryHomework,
  LessonHistoryLesson,
  LessonHistorySummary,
  countLearnedWords,
  formatLessonDate,
  getReviewPendingCount,
  isActiveTrailLesson,
  isArchivedLesson,
  isCompletedLesson,
  isUpcomingLesson,
  sortLessonsByDateAsc,
  sortLessonsByDateDesc,
} from "@/lib/studentLessonHistory";
import { useAuth } from "@/contexts/AuthContext";
import { APP_PATHS } from "@/lib/routes";

type PracticeMode = "review" | "speaking" | "writing";

type AIStudyRecommendation = {
  id: string;
  mode: PracticeMode;
  note?: string;
  teacher_name?: string;
  lesson?: string | null;
  lesson_detail?: {
    id: string;
    title: string;
  } | null;
};

const readCount = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
};

const formatStudentDate = (value?: string | null) => {
  if (!value) {
    return "Nao informado";
  }

  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) {
    return "Nao informado";
  }

  return date.toLocaleDateString("pt-BR");
};

const AlunoTrilha = () => {
  const { id: studentId = "" } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [futureOrderIds, setFutureOrderIds] = useState<string[]>([]);
  const [draggedLessonId, setDraggedLessonId] = useState<string | null>(null);
  const [reschedulingLesson, setReschedulingLesson] = useState<LessonHistoryLesson | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");

  const studentQuery = useQuery({
    queryKey: ["student", studentId],
    queryFn: async () => {
      const response = await api.get(`/accounts/users/${studentId}/`);
      return response.data;
    },
    enabled: !!studentId,
  });

  const lessonsQuery = useQuery({
    queryKey: ["student-lesson-feed", studentId],
    queryFn: async () => {
      const response = await api.get("/lessons/", {
        params: {
          all: true,
          student: studentId,
          is_template: false,
          ordering: "order",
        },
      });
      const data = Array.isArray(response.data) ? response.data : response.data.results || [];
      return sortLessonsBySequence(data);
    },
    enabled: !!studentId,
  });

  const summariesQuery = useQuery({
    queryKey: ["student-lesson-summaries-feed", studentId],
    queryFn: () => fetchAllPages<LessonHistorySummary>(`/students/${studentId}/lesson-summaries/`),
    enabled: !!studentId,
  });

  const homeworkQuery = useQuery({
    queryKey: ["student-lesson-homework-feed", studentId],
    queryFn: () =>
      fetchAllPages<LessonHistoryHomework>("/homework/", {
        student: studentId,
        ordering: "-due_date",
      }),
    enabled: !!studentId,
  });

  const recommendationQuery = useQuery({
    queryKey: ["student-ai-study-recommendation", studentId],
    queryFn: async () => {
      const response = await api.get("/ai-study/recommendations/current/", {
        params: { student: studentId },
      });
      return response.data as AIStudyRecommendation | null;
    },
    enabled: !!studentId,
  });

  const lessons = (lessonsQuery.data || []) as LessonHistoryLesson[];
  const student = studentQuery.data;
  const summaries = summariesQuery.data || [];
  const homeworkItems = homeworkQuery.data || [];

  const orderedLessons = useMemo(() => sortLessonsBySequence(lessons), [lessons]);
  const reorderableLessons = useMemo(
    () => orderedLessons.filter((lesson) => isReorderableLesson(lesson)),
    [orderedLessons],
  );

  useEffect(() => {
    setFutureOrderIds(reorderableLessons.map((lesson) => lesson.id));
  }, [reorderableLessons]);

  const summaryByLesson = useMemo(
    () => new Map(summaries.map((summary) => [summary.lesson, summary])),
    [summaries],
  );

  const homeworkByLesson = useMemo(() => {
    const map = new Map<string, LessonHistoryHomework[]>();
    homeworkItems.forEach((item) => {
      if (!item.lesson) {
        return;
      }
      const group = map.get(item.lesson) || [];
      group.push(item);
      map.set(item.lesson, group);
    });
    return map;
  }, [homeworkItems]);

  const futureLessonMap = useMemo(
    () => new Map(reorderableLessons.map((lesson) => [lesson.id, lesson])),
    [reorderableLessons],
  );

  const futureQueueLessons = useMemo(() => {
    const fallbackIds = reorderableLessons.map((lesson) => lesson.id);
    const ids = futureOrderIds.length === fallbackIds.length ? futureOrderIds : fallbackIds;
    return ids.map((lessonId) => futureLessonMap.get(lessonId)).filter(Boolean) as LessonHistoryLesson[];
  }, [futureLessonMap, futureOrderIds, reorderableLessons]);

  const currentLessons = useMemo(
    () => sortLessonsByDateAsc(orderedLessons.filter((lesson) => lesson.status === "in_progress")),
    [orderedLessons],
  );

  const upcomingLessons = useMemo(
    () =>
      sortLessonsByDateAsc(
        orderedLessons.filter((lesson) => isUpcomingLesson(lesson) && lesson.status !== "in_progress"),
      ),
    [orderedLessons],
  );

  const historyLessons = useMemo(
    () =>
      sortLessonsByDateDesc(
        orderedLessons.filter((lesson) => isCompletedLesson(lesson) || isArchivedLesson(lesson)),
      ),
    [orderedLessons],
  );

  const trailLessonsBase = useMemo(
    () => orderedLessons.filter((lesson) => isActiveTrailLesson(lesson)),
    [orderedLessons],
  );

  const actualCompletedCount = trailLessonsBase.filter((lesson) => isCompletedLesson(lesson)).length;
  const plannedLessonsCount = readCount(
    student?.effective_planned_lessons_count ?? student?.planned_lessons_count,
    trailLessonsBase.length,
  ) || trailLessonsBase.length;
  const completedCount = Math.max(
    actualCompletedCount,
    readCount(student?.effective_completed_lessons_count ?? student?.completed_lessons_count),
  );
  const pendingLessonsCount = readCount(
    student?.pending_lessons_count,
    Math.max(plannedLessonsCount - completedCount, 0),
  );
  const progressPercent = plannedLessonsCount
    ? Math.min(Math.round((completedCount / plannedLessonsCount) * 100), 100)
    : 0;
  const learnedWords = countLearnedWords(trailLessonsBase);
  const reviewPendingCount = trailLessonsBase.reduce(
    (total, lesson) => total + getReviewPendingCount(lesson, summaryByLesson.get(lesson.id)),
    0,
  );
  const openHomeworkCount = homeworkItems.filter((item) => item.status !== "draft" && item.status !== "corrected").length;
  const completedLessonRecords = sortLessonsByDateDesc(trailLessonsBase.filter((lesson) => isCompletedLesson(lesson)));
  const recentCompletedLesson = completedLessonRecords[0] || trailLessonsBase[0] || orderedLessons[0];

  const recommendationMutation = useMutation({
    mutationFn: async ({ mode, clear }: { mode?: PracticeMode; clear?: boolean }) => {
      if (clear) {
        return api.delete("/ai-study/recommendations/current/", {
          params: { student: studentId },
        });
      }
      return api.post("/ai-study/recommendations/current/", {
        student_id: studentId,
        mode,
        lesson_id: mode === "review" ? recentCompletedLesson?.id : undefined,
      });
    },
    onSuccess: (_response, variables) => {
      queryClient.invalidateQueries({ queryKey: ["student-ai-study-recommendation", studentId] });
      toast({
        title: variables.clear ? "Recomendação removida" : "Recomendação salva",
        description: variables.clear
          ? "O aluno não tem mais um modo recomendado."
          : "O próximo acesso do aluno ao Praticar com IA vai destacar esse modo.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao salvar recomendação",
        description: error.response?.data?.detail || "Nao foi possivel atualizar o modo recomendado.",
        variant: "destructive",
      });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (lessonIds: string[]) =>
      api.patch("/lessons/reorder_student_lessons/", {
        student: studentId,
        lesson_ids: lessonIds,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-lesson-feed", studentId] });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      toast({ title: "Sequencia atualizada", description: "A ordem futura deste aluno foi sincronizada." });
    },
    onError: (error: any) => {
      setFutureOrderIds(reorderableLessons.map((lesson) => lesson.id));
      toast({
        title: "Erro ao reordenar",
        description: error.response?.data?.error || "Nao foi possivel salvar a nova ordem.",
        variant: "destructive",
      });
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: async ({ id, date }: { id: string; date: string }) =>
      api.patch(`/lessons/${id}/reschedule/`, { date }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-lesson-feed", studentId] });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-day-slots"] });
      toast({ title: "Aula reagendada", description: "O novo horario foi salvo na agenda do aluno." });
      setReschedulingLesson(null);
      setRescheduleDate("");
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao reagendar",
        description: error.response?.data?.error || "Nao foi possivel reagendar esta aula.",
        variant: "destructive",
      });
    },
  });

  const buildOrderAfterDrop = (sourceId: string, targetId: string) => {
    const nextIds = [...futureOrderIds];
    const fromIndex = nextIds.indexOf(sourceId);
    const toIndex = nextIds.indexOf(targetId);

    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
      return nextIds;
    }

    const [movedId] = nextIds.splice(fromIndex, 1);
    nextIds.splice(toIndex, 0, movedId);
    return nextIds;
  };

  const handleDrop = (targetId: string) => {
    if (!draggedLessonId || reorderMutation.isPending) {
      return;
    }

    const nextIds = buildOrderAfterDrop(draggedLessonId, targetId);
    const didChange = nextIds.join("|") !== futureOrderIds.join("|");
    setDraggedLessonId(null);

    if (!didChange) {
      return;
    }

    setFutureOrderIds(nextIds);
    reorderMutation.mutate(nextIds);
  };

  const isSameLessonDate = (nextDate: string, currentDate?: string | null) =>
    !!nextDate &&
    !!currentDate &&
    new Date(nextDate).getTime() === new Date(currentDate).getTime();

  if (user?.role !== "teacher" && user?.role !== "admin") {
    return (
      <DashboardLayout>
        <PageHeader title="Aulas do Aluno" description="Apenas professores podem gerenciar esta visao." />
      </DashboardLayout>
    );
  }

  const isLoading =
    studentQuery.isLoading ||
    lessonsQuery.isLoading ||
    summariesQuery.isLoading ||
    homeworkQuery.isLoading ||
    recommendationQuery.isLoading;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.14),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.14),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-6 shadow-[0_24px_80px_-45px_rgba(15,23,42,0.45)] sm:p-8">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <Link
                to={APP_PATHS.students}
                className="mt-1 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/80 bg-white/80 text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground"
                aria-label="Voltar para alunos"
              >
                <ArrowLeft size={18} />
              </Link>
              <PageHeader
                title={student ? `Aulas de ${student.name || student.email}` : "Aulas do Aluno"}
                description="Toda a experiencia da aula fica centralizada aqui: sequencia futura, registros por aula, resumo, materiais, flashcards e homework."
              />
            </div>
            <Link
              to={APP_PATHS.calendar}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/80 bg-white/80 px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent"
            >
              <CalendarClock size={16} /> Abrir calendario
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <MetricCard title="Aulas" value={plannedLessonsCount} description="Planejadas" icon={BookOpenCheck} tone="default" />
            <MetricCard title="Concluidas" value={completedCount} description="Ja feitas" icon={CheckCircle2} tone="success" />
            <MetricCard title="Pendentes" value={pendingLessonsCount} description="A cumprir" icon={CalendarClock} tone="default" />
            <MetricCard title="Palavras" value={learnedWords} description="Vocabulos registrados" icon={Sparkles} tone="success" />
            <MetricCard title="Homework" value={openHomeworkCount} description="Itens em aberto" icon={NotebookText} tone={openHomeworkCount > 0 ? "warning" : "default"} />
            <MetricCard title="Revisoes" value={reviewPendingCount} description="Pontos que pedem reforco" icon={Target} tone={reviewPendingCount > 0 ? "warning" : "success"} />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="rounded-[28px] border border-white/80 bg-white/80 p-5 shadow-sm">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progresso do aluno</span>
                <span className="font-semibold text-foreground">{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-3 bg-slate-200" />
              <p className="mt-2 text-xs text-muted-foreground">
                {completedCount} de {plannedLessonsCount || 0} aulas concluidas
              </p>
            </div>

            <div className="space-y-6">
              <div className="rounded-[28px] border border-white/80 bg-white/80 p-5 shadow-sm">
                <p className="text-sm font-semibold text-card-foreground">Habilidades observadas</p>
                <div className="mt-4 space-y-3">
                  {[
                    { label: "Listening", value: student?.listening ?? 1 },
                    { label: "Speaking", value: student?.speaking ?? 1 },
                    { label: "Reading", value: student?.reading ?? 1 },
                    { label: "Writing", value: student?.writing ?? 1 },
                  ].map((skill) => (
                    <SkillMeter key={skill.label} label={skill.label} value={skill.value} />
                  ))}
                </div>
              </div>

              <div className="rounded-[28px] border border-white/80 bg-white/80 p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-card-foreground">Modo recomendado em Praticar com IA</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      O aluno abre diretamente o modo recomendado quando entra em Praticar com IA.
                    </p>
                  </div>
                  {recommendationMutation.isPending ? <p className="text-xs text-primary">Salvando...</p> : null}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {([
                    { mode: "review" as PracticeMode, label: "Revisar Aula" },
                    { mode: "speaking" as PracticeMode, label: "Speaking" },
                    { mode: "writing" as PracticeMode, label: "Writing" },
                  ]).map((item) => {
                    const active = recommendationQuery.data?.mode === item.mode;
                    return (
                      <button
                        key={item.mode}
                        type="button"
                        onClick={() => recommendationMutation.mutate({ mode: item.mode })}
                        className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                          active
                            ? "bg-slate-900 text-white"
                            : "border border-border bg-background text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 rounded-2xl bg-muted/40 p-4 text-sm">
                  {recommendationQuery.data ? (
                    <>
                      <p className="font-medium text-foreground">
                        Atual: {recommendationQuery.data.mode === "review" ? "Revisar Aula" : recommendationQuery.data.mode === "speaking" ? "Speaking" : "Writing"}
                      </p>
                      {recommendationQuery.data.lesson_detail ? (
                        <p className="mt-1 text-muted-foreground">Aula vinculada: {recommendationQuery.data.lesson_detail.title}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-muted-foreground">
                        Atualizado por {recommendationQuery.data.teacher_name || "professor"}.
                      </p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">Nenhum modo recomendado no momento.</p>
                  )}
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => recommendationMutation.mutate({ clear: true })}
                    disabled={!recommendationQuery.data}
                    className="rounded-xl border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Limpar recomendação
                  </button>
                </div>
              </div>
            </div>
          </div>

          <StudentTrackingPanel
            student={student}
            plannedLessonsCount={plannedLessonsCount}
            completedCount={completedCount}
            pendingLessonsCount={pendingLessonsCount}
          />
        </section>

        {isLoading ? (
          <div className="rounded-[26px] border border-border bg-card p-6 text-sm text-muted-foreground">
            Carregando historico do aluno...
          </div>
        ) : orderedLessons.length === 0 ? (
          <div className="rounded-[26px] border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
            Nenhuma aula foi encontrada para este aluno.
          </div>
        ) : (
          <>
            <section className="rounded-[28px] border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-card-foreground">Sequencia futura</h2>
                  <p className="text-sm text-muted-foreground">
                    Arraste para mudar a ordem das proximas aulas. O calendario reflete essa sequencia.
                  </p>
                </div>
                {reorderMutation.isPending && <p className="text-sm text-primary">Salvando nova ordem...</p>}
              </div>

              <div className="space-y-3">
                {futureQueueLessons.map((lesson, index) => {
                  const homeworkCount = homeworkByLesson.get(lesson.id)?.filter((item) => item.status !== "draft" && item.status !== "corrected").length || 0;
                  const reviewCount = getReviewPendingCount(lesson, summaryByLesson.get(lesson.id));
                  const isDragging = draggedLessonId === lesson.id;

                  return (
                    <div
                      key={lesson.id}
                      draggable={!reorderMutation.isPending}
                      onDragStart={() => setDraggedLessonId(lesson.id)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => handleDrop(lesson.id)}
                      onDragEnd={() => setDraggedLessonId(null)}
                      className={`rounded-[24px] border border-border bg-background p-4 transition ${isDragging ? "opacity-50" : "hover:border-foreground/20 hover:shadow-sm"}`}
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="mt-0.5 flex items-center gap-2 text-muted-foreground">
                            <GripVertical size={18} />
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
                              {typeof lesson.order === "number" && lesson.order > 0 ? lesson.order : index + 1}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-foreground">{lesson.title}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{formatLessonDate(lesson.date)}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <StatusBadge status={lesson.status as any} />
                              {(lesson.new_words?.length || 0) > 0 && (
                                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                                  +{lesson.new_words?.length} palavras
                                </span>
                              )}
                              {homeworkCount > 0 && (
                                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                                  {homeworkCount} homework
                                </span>
                              )}
                              {reviewCount > 0 && (
                                <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
                                  {reviewCount} revisao
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setExpandedId((current) => (current === lesson.id ? null : lesson.id))}
                          className="rounded-xl border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
                        >
                          Ver detalhes
                        </button>
                      </div>
                    </div>
                  );
                })}

                {futureQueueLessons.length === 0 && (
                  <div className="rounded-[24px] border border-dashed border-border bg-muted/20 p-5 text-sm text-muted-foreground">
                    Nenhuma aula futura pendente para reordenar.
                  </div>
                )}
              </div>
            </section>

            {currentLessons.length > 0 && (
              <section className="space-y-4">
                <div className="flex flex-col gap-1">
                  <h2 className="text-2xl font-semibold tracking-tight text-foreground">Aula em andamento</h2>
                  <p className="text-sm text-muted-foreground">O professor pode continuar a aula atual e manter todo o registro no historico deste aluno.</p>
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  {currentLessons.map((lesson) => (
                    <LessonExperienceCard
                      key={lesson.id}
                      lesson={lesson}
                      summary={summaryByLesson.get(lesson.id)}
                      homeworkItems={homeworkByLesson.get(lesson.id) || []}
                      expanded={expandedId === lesson.id}
                      onToggle={() => setExpandedId((current) => (current === lesson.id ? null : lesson.id))}
                      onRefreshLessons={() => lessonsQuery.refetch()}
                      onRefreshHomework={() => homeworkQuery.refetch()}
                      onRefreshSummaries={() => summariesQuery.refetch()}
                      onRequestReschedule={(selectedLesson) => {
                        setReschedulingLesson(selectedLesson);
                        setRescheduleDate(selectedLesson.date || "");
                      }}
                    />
                  ))}
                </div>
              </section>
            )}

            {upcomingLessons.length > 0 && (
              <section className="space-y-4">
                <div className="flex flex-col gap-1">
                  <h2 className="text-2xl font-semibold tracking-tight text-foreground">Proximas aulas do aluno</h2>
                  <p className="text-sm text-muted-foreground">Cada aula futura ja carrega contexto, materiais e tarefas no mesmo card.</p>
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  {upcomingLessons.map((lesson) => (
                    <LessonExperienceCard
                      key={lesson.id}
                      lesson={lesson}
                      summary={summaryByLesson.get(lesson.id)}
                      homeworkItems={homeworkByLesson.get(lesson.id) || []}
                      expanded={expandedId === lesson.id}
                      onToggle={() => setExpandedId((current) => (current === lesson.id ? null : lesson.id))}
                      onRefreshLessons={() => lessonsQuery.refetch()}
                      onRefreshHomework={() => homeworkQuery.refetch()}
                      onRefreshSummaries={() => summariesQuery.refetch()}
                      onRequestReschedule={(selectedLesson) => {
                        setReschedulingLesson(selectedLesson);
                        setRescheduleDate(selectedLesson.date || "");
                      }}
                    />
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-4">
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">Feed de evolucao</h2>
                <p className="text-sm text-muted-foreground">Historico completo com resumos, anexos, palavras aprendidas, flashcards e status de cada aula.</p>
              </div>

              {historyLessons.length === 0 ? (
                <div className="rounded-[26px] border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
                  As aulas concluidas e arquivadas vao aparecer aqui.
                </div>
              ) : (
                <div className="relative pl-6 before:absolute before:left-2 before:top-4 before:bottom-4 before:w-px before:bg-slate-200">
                  <div className="space-y-6">
                    {historyLessons.map((lesson) => (
                      <div key={lesson.id} className="relative">
                        <span
                          className={`absolute -left-[1.55rem] top-8 h-4 w-4 rounded-full border-4 border-background ${lesson.status === "completed" ? "bg-emerald-500" : "bg-slate-400"}`}
                        />
                        <LessonExperienceCard
                          lesson={lesson}
                          summary={summaryByLesson.get(lesson.id)}
                          homeworkItems={homeworkByLesson.get(lesson.id) || []}
                          expanded={expandedId === lesson.id}
                          onToggle={() => setExpandedId((current) => (current === lesson.id ? null : lesson.id))}
                          onRefreshLessons={() => lessonsQuery.refetch()}
                          onRefreshHomework={() => homeworkQuery.refetch()}
                          onRefreshSummaries={() => summariesQuery.refetch()}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {reschedulingLesson && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4"
          onClick={() => {
            setReschedulingLesson(null);
            setRescheduleDate("");
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[28px] bg-card p-6 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-card-foreground">Reagendar aula</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Escolha um novo horario livre na agenda do professor.
                </p>
                <p className="mt-2 text-sm font-medium text-foreground">{reschedulingLesson.title}</p>
                <p className="text-xs text-muted-foreground">
                  Horario atual: {formatLessonDate(reschedulingLesson.date)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReschedulingLesson(null);
                  setRescheduleDate("");
                }}
                className="rounded-xl p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <ScheduleSlotPicker
              teacherId={reschedulingLesson.teacher}
              excludeLessonId={reschedulingLesson.id}
              value={rescheduleDate}
              onChange={setRescheduleDate}
            />

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setReschedulingLesson(null);
                  setRescheduleDate("");
                }}
                className="rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  !rescheduleDate ||
                  isSameLessonDate(rescheduleDate, reschedulingLesson.date) ||
                  rescheduleMutation.isPending
                }
                onClick={() => rescheduleMutation.mutate({ id: reschedulingLesson.id, date: rescheduleDate })}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {rescheduleMutation.isPending ? "Reagendando..." : "Confirmar reagendamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

const MetricCard = ({
  title,
  value,
  description,
  icon: Icon,
  tone,
}: {
  title: string;
  value: number;
  description: string;
  icon: typeof CheckCircle2;
  tone: "default" | "success" | "warning";
}) => {
  const toneClass =
    tone === "success"
      ? "text-emerald-600"
      : tone === "warning"
        ? "text-amber-600"
        : "text-slate-700";

  return (
    <div className="rounded-[24px] border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{title}</p>
        <Icon className={`h-4 w-4 ${toneClass}`} />
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  );
};

const SkillMeter = ({ label, value }: { label: string; value: number }) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <span className="text-xs text-muted-foreground">{value}/10</span>
    </div>
    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
      <div className="h-full rounded-full bg-slate-900" style={{ width: `${Math.max(0, Math.min(100, value * 10))}%` }} />
    </div>
  </div>
);

const StudentTrackingPanel = ({
  student,
  plannedLessonsCount,
  completedCount,
  pendingLessonsCount,
}: {
  student: any;
  plannedLessonsCount: number;
  completedCount: number;
  pendingLessonsCount: number;
}) => {
  const textBlocks = [
    { label: "Objetivo que quer aprender ingles", value: student?.learning_goal },
    { label: "O que ja foi ensinado", value: student?.taught_content },
    { label: "O que precisa ensinar", value: student?.content_to_teach },
    { label: "Pontos fortes", value: student?.strengths },
    { label: "Pontos fracos", value: student?.weaknesses },
  ];

  return (
    <div className="mt-6 rounded-[28px] border border-white/80 bg-white/80 p-5 shadow-sm">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-card-foreground">Acompanhamento do aluno</p>
        <p className="text-xs leading-5 text-muted-foreground">Resumo operacional para contrato, progresso e planejamento pedagogico.</p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <TrackingMetric label="Aulas planejadas" value={plannedLessonsCount} />
        <TrackingMetric label="Aulas ja feitas" value={completedCount} />
        <TrackingMetric label="Aulas pendentes" value={pendingLessonsCount} />
        <TrackingMetric label="Inicio do contrato" value={formatStudentDate(student?.contract_start_date)} />
        <TrackingMetric label="Fim do contrato" value={formatStudentDate(student?.contract_end_date)} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {textBlocks.map((block) => (
          <div key={block.label} className={block.label.startsWith("Objetivo") ? "rounded-2xl border border-slate-200 bg-slate-50/80 p-4 lg:col-span-2" : "rounded-2xl border border-slate-200 bg-slate-50/80 p-4"}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{block.label}</p>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">
              {block.value?.trim() || "Nao informado"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

const TrackingMetric = ({ label, value }: { label: string; value: number | string }) => (
  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <p className="mt-1 text-base font-semibold text-foreground">{value}</p>
  </div>
);

export default AlunoTrilha;
