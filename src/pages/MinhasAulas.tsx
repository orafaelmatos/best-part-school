import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpenCheck,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  NotebookText,
  Sparkles,
  Target,
  X,
} from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import LessonExperienceCard from "@/components/lesson-history/LessonExperienceCard";
import ScheduleSlotPicker from "@/components/ScheduleSlotPicker";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { fetchAllPages } from "@/lib/fetchAllPages";
import {
  LessonHistoryHomework,
  LessonHistoryLesson,
  LessonHistorySummary,
  countLearnedWords,
  formatLessonDate,
  getReviewPendingCount,
  isArchivedLesson,
  isCompletedLesson,
  isUpcomingLesson,
  sortLessonsByDateAsc,
  sortLessonsByDateDesc,
} from "@/lib/studentLessonHistory";

type VocabularyStats = {
  due_today: number;
  overdue: number;
  difficult: number;
  study_streak: number;
  total_learned_words: number;
  reviewed_30_days: number;
};

const MinhasAulas = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reschedulingLesson, setReschedulingLesson] = useState<LessonHistoryLesson | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");

  const studentId = user?.user_id || "";

  const lessonsQuery = useQuery({
    queryKey: ["student-lesson-feed", studentId],
    queryFn: async () => {
      const response = await api.get("/lessons/", {
        params: {
          all: true,
          is_template: false,
        },
      });
      return Array.isArray(response.data) ? response.data : response.data.results || [];
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

  const vocabularyStatsQuery = useQuery({
    queryKey: ["student-vocabulary-dashboard"],
    queryFn: async () => {
      const response = await api.get("/vocabulary-cards/dashboard/");
      return response.data as VocabularyStats;
    },
    enabled: user?.role === "student",
  });

  const rescheduleMutation = useMutation({
    mutationFn: async ({ id, date }: { id: string; date: string }) =>
      api.patch(`/lessons/${id}/reschedule/`, { date }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-lesson-feed", studentId] });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-day-slots"] });
      toast({ title: "Aula reagendada", description: "O novo horario foi salvo na sua agenda." });
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

  const lessons = (lessonsQuery.data || []) as LessonHistoryLesson[];
  const summaries = summariesQuery.data || [];
  const homeworkItems = homeworkQuery.data || [];
  const vocabularyStats = vocabularyStatsQuery.data;

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

  const visibleLessons = useMemo(
    () => lessons.filter((lesson) => lesson.status !== "pending"),
    [lessons],
  );

  const upcomingLessons = useMemo(
    () => sortLessonsByDateAsc(visibleLessons.filter((lesson) => isUpcomingLesson(lesson))),
    [visibleLessons],
  );

  const historyLessons = useMemo(
    () =>
      sortLessonsByDateDesc(
        visibleLessons.filter((lesson) => isCompletedLesson(lesson) || isArchivedLesson(lesson)),
      ),
    [visibleLessons],
  );

  const completedCount = useMemo(
    () => visibleLessons.filter((lesson) => isCompletedLesson(lesson)).length,
    [visibleLessons],
  );

  const progressPercent = visibleLessons.length
    ? Math.round((completedCount / visibleLessons.length) * 100)
    : 0;

  const nextLesson = upcomingLessons[0];
  const learnedWords = vocabularyStats?.total_learned_words || countLearnedWords(visibleLessons);
  const dueReviewCount =
    (vocabularyStats?.due_today || 0) +
    (vocabularyStats?.overdue || 0) ||
    visibleLessons.reduce((total, lesson) => total + getReviewPendingCount(lesson, summaryByLesson.get(lesson.id)), 0);
  const pendingHomeworkCount = homeworkItems.filter((item) => item.status !== "draft" && item.status !== "corrected").length;
  const correctedHomeworkCount = homeworkItems.filter((item) => item.status === "corrected").length;

  const isSameLessonDate = (nextDate: string, currentDate?: string | null) =>
    !!nextDate &&
    !!currentDate &&
    new Date(nextDate).getTime() === new Date(currentDate).getTime();

  if (user?.role !== "student") {
    return <Navigate to="/alunos" replace />;
  }

  const isLoading =
    lessonsQuery.isLoading ||
    summariesQuery.isLoading ||
    homeworkQuery.isLoading ||
    vocabularyStatsQuery.isLoading;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.14),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-6 shadow-[0_24px_80px_-45px_rgba(15,23,42,0.45)] sm:p-8">
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1.15fr)_380px]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">Minha evolucao</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Minhas Aulas</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Seu historico completo fica aqui: proximas aulas, resumos, palavras aprendidas, materiais, flashcards, tarefas e sinais claros de progresso.
              </p>

              <div className="mt-6 rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-sm backdrop-blur">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Proxima aula</p>
                    <p className="mt-2 text-xl font-semibold text-foreground">
                      {nextLesson ? nextLesson.title : "Nenhuma aula agendada agora"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {nextLesson ? formatLessonDate(nextLesson.date) : "Quando uma nova aula for marcada, ela aparecera aqui."}
                    </p>
                  </div>

                  <div className="min-w-[220px]">
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Progresso do ciclo atual</span>
                      <span className="font-semibold text-foreground">{progressPercent}%</span>
                    </div>
                    <Progress value={progressPercent} className="h-3 bg-slate-200" />
                    <p className="mt-2 text-xs text-muted-foreground">
                      {completedCount} de {visibleLessons.length || 0} aulas concluidas
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard
                title="Concluidas"
                value={completedCount}
                description="Aulas finalizadas no seu historico"
                icon={CheckCircle2}
                tone="success"
              />
              <MetricCard
                title="Palavras"
                value={learnedWords}
                description="Vocabulos registrados ao longo das aulas"
                icon={BookOpenCheck}
                tone="default"
              />
              <MetricCard
                title="Homework"
                value={pendingHomeworkCount}
                description={`${correctedHomeworkCount} tarefas ja corrigidas`}
                icon={NotebookText}
                tone={pendingHomeworkCount > 0 ? "warning" : "default"}
              />
              <MetricCard
                title="Revisoes"
                value={dueReviewCount}
                description={`${vocabularyStats?.study_streak || 0} dias de sequencia`}
                icon={BrainCircuit}
                tone={dueReviewCount > 0 ? "warning" : "success"}
              />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">Proximas aulas</h2>
            <p className="text-sm text-muted-foreground">Tudo que esta chegando, com acesso rapido a resumos, materiais e reagendamento.</p>
          </div>

          {isLoading ? (
            <div className="rounded-[26px] border border-border bg-card p-6 text-sm text-muted-foreground">
              Carregando suas aulas...
            </div>
          ) : upcomingLessons.length === 0 ? (
            <div className="rounded-[26px] border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
              Nenhuma aula futura encontrada.
            </div>
          ) : (
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
          )}
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">Feed da sua evolucao</h2>
              <p className="text-sm text-muted-foreground">Cada aula funciona como um registro vivo do que voce aprendeu, praticou e precisa revisar.</p>
            </div>

            {historyLessons.length === 0 ? (
              <div className="rounded-[26px] border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
                Suas aulas concluidas vao aparecer aqui em formato de timeline.
              </div>
            ) : (
              <div className="relative pl-6 before:absolute before:left-2 before:top-4 before:bottom-4 before:w-px before:bg-slate-200">
                <div className="space-y-6">
                  {historyLessons.map((lesson) => (
                    <div key={lesson.id} className="relative">
                      <span className="absolute -left-[1.55rem] top-8 h-4 w-4 rounded-full border-4 border-background bg-emerald-500" />
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
          </div>

          <aside className="space-y-4">
            <div className="rounded-[28px] border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2 text-primary">
                <Target className="h-4 w-4" />
                <h3 className="font-semibold text-card-foreground">Leitura rapida</h3>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <QuickRow
                  label="Resumos gerados"
                  value={summaries.length}
                />
                <QuickRow
                  label="Aulas arquivadas"
                  value={visibleLessons.filter((lesson) => isArchivedLesson(lesson)).length}
                />
                <QuickRow
                  label="Cards dificeis"
                  value={vocabularyStats?.difficult || 0}
                />
                <QuickRow
                  label="Revisoes nos ultimos 30 dias"
                  value={vocabularyStats?.reviewed_30_days || 0}
                />
              </div>
            </div>

            <div className="rounded-[28px] border border-border bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.98))] p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sky-700">
                <Sparkles className="h-4 w-4" />
                <h3 className="font-semibold text-card-foreground">Proximo foco</h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {dueReviewCount > 0
                  ? `Voce tem ${dueReviewCount} revisao${dueReviewCount > 1 ? "oes" : ""} para manter o conteudo ativo entre as aulas.`
                  : "Seu ritmo de revisao esta em dia. Aproveite para consolidar os resumos e o homework mais recente."}
              </p>
              <div className="mt-4 space-y-2">
                <SignalPill
                  icon={CalendarClock}
                  label={nextLesson ? `Proxima aula: ${formatLessonDate(nextLesson.date, { weekday: undefined })}` : "Nenhuma aula agendada"}
                />
                <SignalPill
                  icon={BrainCircuit}
                  label={`${dueReviewCount} revisao${dueReviewCount > 1 ? "oes" : ""} pendente${dueReviewCount > 1 ? "s" : ""}`}
                />
                <SignalPill
                  icon={NotebookText}
                  label={`${pendingHomeworkCount} homework pendente${pendingHomeworkCount > 1 ? "s" : ""}`}
                />
              </div>
            </div>
          </aside>
        </section>
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
                  Escolha um novo horario livre dentro da agenda do professor.
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

const QuickRow = ({ label, value }: { label: string; value: number }) => (
  <div className="flex items-center justify-between rounded-2xl bg-muted/40 px-3 py-2">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-semibold text-foreground">{value}</span>
  </div>
);

const SignalPill = ({
  icon: Icon,
  label,
}: {
  icon: typeof CalendarClock;
  label: string;
}) => (
  <div className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm text-muted-foreground shadow-sm ring-1 ring-slate-100">
    <Icon className="h-4 w-4 text-sky-700" />
    <span>{label}</span>
  </div>
);

export default MinhasAulas;
