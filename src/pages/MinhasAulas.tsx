import { Fragment, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpenCheck,
  BrainCircuit,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  Flag,
  NotebookText,
  Sparkles,
  Target,
} from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import LessonExperienceCard from "@/components/lesson-history/LessonExperienceCard";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { fetchAllPages } from "@/lib/fetchAllPages";
import { APP_PATHS } from "@/lib/routes";
import { cn } from "@/lib/utils";
import {
  LessonHistoryHomework,
  LessonHistoryLesson,
  LessonHistorySummary,
  countLearnedWords,
  formatLessonDate,
  formatLessonDateShort,
  getLessonDateValue,
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
  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const upcomingSectionRef = useRef<HTMLElement | null>(null);
  const completedSectionRef = useRef<HTMLElement | null>(null);
  const trailSectionRef = useRef<HTMLDivElement | null>(null);

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

  const lessons = useMemo(() => (lessonsQuery.data || []) as LessonHistoryLesson[], [lessonsQuery.data]);
  const summaries = useMemo(() => summariesQuery.data || [], [summariesQuery.data]);
  const homeworkItems = useMemo(() => homeworkQuery.data || [], [homeworkQuery.data]);
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

  const completedLessons = useMemo(
    () => sortLessonsByDateDesc(visibleLessons.filter((lesson) => isCompletedLesson(lesson))),
    [visibleLessons],
  );

  const archivedLessons = useMemo(
    () => sortLessonsByDateDesc(visibleLessons.filter((lesson) => isArchivedLesson(lesson))),
    [visibleLessons],
  );

  const trailLessons = useMemo(
    () =>
      [...visibleLessons].sort((left, right) => {
        const leftOrder = typeof left.order === "number" ? left.order : Number.MAX_SAFE_INTEGER;
        const rightOrder = typeof right.order === "number" ? right.order : Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }
        return getLessonDateValue(left.date) - getLessonDateValue(right.date);
      }),
    [visibleLessons],
  );

  const completedCount = completedLessons.length;
  const progressPercent = visibleLessons.length
    ? Math.round((completedCount / visibleLessons.length) * 100)
    : 0;

  const nextLesson = upcomingLessons[0];
  const latestCompletedLesson = completedLessons[0];
  const learnedWords = vocabularyStats?.total_learned_words || countLearnedWords(visibleLessons);
  const dueReviewCount =
    (vocabularyStats?.due_today || 0) +
    (vocabularyStats?.overdue || 0) ||
    visibleLessons.reduce((total, lesson) => total + getReviewPendingCount(lesson, summaryByLesson.get(lesson.id)), 0);
  const pendingHomeworkCount = homeworkItems.filter((item) => item.status !== "draft" && item.status !== "corrected").length;
  const correctedHomeworkCount = homeworkItems.filter((item) => item.status === "corrected").length;
  const remainingLessonsCount = upcomingLessons.length;
  const archivedCount = archivedLessons.length;
  const scrollToUpcomingLessons = () => {
    upcomingSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };
  const scrollToCompletedLessons = () => {
    completedSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };
  const scrollToTrailSection = () => {
    trailSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  if (user?.role !== "student") {
    return <Navigate to={APP_PATHS.students} replace />;
  }

  const isLoading =
    lessonsQuery.isLoading ||
    summariesQuery.isLoading ||
    homeworkQuery.isLoading ||
    vocabularyStatsQuery.isLoading;

  return (
    <DashboardLayout>
      <div className="space-y-7">
        <section className="relative overflow-hidden rounded-[30px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(240,249,255,0.96),rgba(255,255,255,0.98)_52%,rgba(236,253,245,0.9))] p-5 text-slate-900 shadow-[0_26px_70px_-46px_rgba(14,116,144,0.26)] sm:p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.12),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.1),transparent_24%)]" />
          <div className="relative z-10 space-y-5">
            <div className="max-w-4xl space-y-2 text-slate-950">
              <h1 className="text-3xl font-bold tracking-tight sm:text-[2.2rem]">Minhas Aulas</h1>
              <p className="max-w-3xl text-sm font-medium leading-6 text-slate-900/80 sm:text-[0.98rem]">
                Acompanhe suas proximas aulas, o que ja foi concluido e o que ainda falta na trilha.
              </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
              <div className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-3">
                  <HeroSnapshot
                    eyebrow="Proxima aula"
                    title={nextLesson ? nextLesson.title : "Nenhuma aula agendada"}
                    description={nextLesson ? formatLessonDate(nextLesson.date) : "Quando uma nova aula for marcada, ela aparecera aqui."}
                    icon={CalendarDays}
                    onClick={scrollToUpcomingLessons}
                    tone="lesson"
                    actionLabel={nextLesson ? "Ver agenda" : undefined}
                  />
                  <HeroSnapshot
                    eyebrow="Aulas feitas"
                    title={`${completedCount} concluida${completedCount === 1 ? "" : "s"}`}
                    description={
                      latestCompletedLesson
                        ? `Ultima aula: ${latestCompletedLesson.title} em ${formatLessonDate(latestCompletedLesson.date, { weekday: undefined })}`
                        : "Suas aulas concluidas vao aparecer aqui conforme voce avanca."
                    }
                    icon={CheckCircle2}
                    onClick={scrollToCompletedLessons}
                    tone="completed"
                  />
                  <HeroSnapshot
                    eyebrow="Andamento da trilha"
                    title={`${progressPercent}% concluido`}
                    description={
                      visibleLessons.length
                        ? `${remainingLessonsCount} aula${remainingLessonsCount === 1 ? "" : "s"} restante${remainingLessonsCount === 1 ? "" : "s"} nesta trilha`
                        : "Sua trilha aparecera aqui assim que as aulas forem organizadas."
                    }
                    icon={Flag}
                    tone="progress"
                    onClick={scrollToTrailSection}
                    progressValue={progressPercent}
                  />
                </div>

                <div className="rounded-[18px] border border-sky-200/70 bg-white/72 px-4 py-3 text-sm text-slate-700 shadow-sm backdrop-blur-[2px]">
                  Se precisar mudar um horario, fale com seu professor. O reagendamento e feito apenas pelo professor.
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <MetricCard
                  title="Concluidas"
                  value={completedCount}
                  description="Aulas finalizadas no seu historico"
                  icon={CheckCircle2}
                  tone="sky"
                  onClick={scrollToCompletedLessons}
                />
                <MetricCard
                  title="Palavras"
                  value={learnedWords}
                  description="Vocabulos registrados ao longo das aulas"
                  icon={BookOpenCheck}
                  tone="indigo"
                  onClick={() => navigate(APP_PATHS.learnedWords)}
                />
                <MetricCard
                  title="Homework"
                  value={pendingHomeworkCount}
                  description={`${correctedHomeworkCount} tarefas ja corrigidas`}
                  icon={NotebookText}
                  tone="sand"
                  onClick={() => navigate(APP_PATHS.homework)}
                />
                <MetricCard
                  title="Revisoes"
                  value={dueReviewCount}
                  description={`${vocabularyStats?.study_streak || 0} dias de sequencia`}
                  icon={BrainCircuit}
                  tone="coral"
                  onClick={() => navigate(APP_PATHS.learnedWords)}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-slate-200/80 bg-white/96 p-5 shadow-[0_18px_50px_-40px_rgba(15,23,42,0.28)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">Resumo do ciclo atual</p>
              <p className="mt-2 text-xl font-semibold text-foreground">
                {visibleLessons.length ? `${completedCount} de ${visibleLessons.length} aulas concluidas` : "Ainda sem aulas visiveis"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Use a trilha ao lado para entender rapidamente o que ja passou e o que vem depois.
              </p>
            </div>

            <div className="min-w-[240px] rounded-[22px] bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-slate-600">Progresso do ciclo atual</span>
                <span className="font-semibold text-foreground">{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-3 bg-slate-200" />
              <p className="mt-2 text-xs text-muted-foreground">
                {remainingLessonsCount} proxima{remainingLessonsCount === 1 ? "" : "s"} etapa{remainingLessonsCount === 1 ? "" : "s"} pela frente
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
          <div className="space-y-8">
            <section ref={upcomingSectionRef} className="space-y-4">
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold text-foreground">Proximas aulas</h2>
                <p className="text-sm text-muted-foreground">
                  Aqui ficam somente as aulas que ainda vao acontecer, para voce bater o olho e saber o que vem primeiro.
                </p>
              </div>

              {isLoading ? (
                <div className="school-surface p-6 text-sm text-muted-foreground">
                  Carregando suas aulas...
                </div>
              ) : upcomingLessons.length === 0 ? (
                <div className="school-surface border-dashed p-6 text-sm text-muted-foreground">
                  Nenhuma aula futura encontrada.
                </div>
              ) : (
                <div className="school-surface overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-border text-sm">
                      <thead className="bg-slate-50/90">
                        <tr className="text-left">
                          <th className="px-4 py-3.5 font-medium text-muted-foreground">Aula</th>
                          <th className="px-4 py-3.5 font-medium text-muted-foreground">Data</th>
                          <th className="px-4 py-3.5 font-medium text-muted-foreground">Nivel</th>
                          <th className="px-4 py-3.5 font-medium text-muted-foreground">Status</th>
                          <th className="px-4 py-3.5 text-right font-medium text-muted-foreground">Detalhes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {upcomingLessons.map((lesson, index) => {
                          const isExpanded = expandedId === lesson.id;
                          return (
                            <Fragment key={lesson.id}>
                              <tr
                                className={[
                                  "transition",
                                  index % 2 === 0 ? "bg-sky-50/55" : "bg-emerald-50/45",
                                  isExpanded ? "bg-slate-50" : "hover:bg-slate-50/90",
                                ].join(" ")}
                              >
                                <td className="px-4 py-3 align-top">
                                  <div className="min-w-[220px]">
                                    <p className="font-semibold text-foreground">{lesson.title}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {typeof lesson.order === "number" && lesson.order > 0
                                        ? `Aula ${lesson.order}`
                                        : "Ordem nao definida"}
                                    </p>
                                  </div>
                                </td>
                                <td className="px-4 py-3 align-top text-muted-foreground">
                                  {formatLessonDate(lesson.date, { weekday: undefined })}
                                </td>
                                <td className="px-4 py-3 align-top text-muted-foreground">
                                  {lesson.level || "Nao informado"}
                                </td>
                                <td className="px-4 py-3 align-top">
                                  <span className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-100">
                                    {formatStatusLabel(lesson.status)}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right align-top">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedId((current) => (current === lesson.id ? null : lesson.id))}
                                    className="rounded-full bg-sky-700 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-sky-800"
                                  >
                                    {isExpanded ? "Ocultar" : "Ver detalhes"}
                                  </button>
                                </td>
                              </tr>
                              {isExpanded ? (
                                <tr className="bg-background">
                                  <td colSpan={5} className="p-4">
                                    <LessonExperienceCard
                                      lesson={lesson}
                                      summary={summaryByLesson.get(lesson.id)}
                                      homeworkItems={homeworkByLesson.get(lesson.id) || []}
                                      expanded
                                      onToggle={() => setExpandedId(null)}
                                      onRefreshLessons={() => lessonsQuery.refetch()}
                                      onRefreshHomework={() => homeworkQuery.refetch()}
                                      onRefreshSummaries={() => summariesQuery.refetch()}
                                    />
                                  </td>
                                </tr>
                              ) : null}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>

            <section ref={completedSectionRef} className="space-y-4">
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold text-foreground">Aulas feitas</h2>
                <p className="text-sm text-muted-foreground">
                  Aqui ficam as aulas concluidas, com os resumos, palavras e tarefas que ajudam a revisar o que ja passou.
                </p>
              </div>

              {completedLessons.length === 0 ? (
                <div className="school-surface border-dashed p-6 text-sm text-muted-foreground">
                  Suas aulas concluidas vao aparecer aqui conforme voce finalizar a trilha.
                </div>
              ) : (
                <div className="relative rounded-[30px] border border-white/70 bg-white/80 p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.22)] before:absolute before:bottom-6 before:left-8 before:top-6 before:w-px before:bg-gradient-to-b before:from-sky-200 before:via-emerald-200 before:to-slate-200">
                  <div className="space-y-6">
                    {completedLessons.map((lesson) => (
                      <div key={lesson.id} className="relative pl-8">
                        <span className="absolute left-[0.2rem] top-8 h-4 w-4 rounded-full border-4 border-background bg-emerald-500" />
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
          </div>

          <aside className="space-y-4">
            <div
              ref={trailSectionRef}
              className="overflow-hidden rounded-[30px] border border-orange-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,245,240,0.96))] p-5 shadow-[0_24px_60px_-40px_rgba(154,52,18,0.35)]"
            >
              <div className="flex items-center gap-2 text-orange-700">
                <Target className="h-4 w-4" />
                <h3 className="font-semibold text-card-foreground">Andamento da trilha</h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                A trilha abaixo mostra a ordem das aulas e deixa claro o que ja foi concluido e o que ainda esta por vir.
              </p>

              <div className="mt-4 rounded-[24px] bg-white/95 p-4 ring-1 ring-orange-100">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Progresso</span>
                  <span className="font-semibold text-foreground">{progressPercent}%</span>
                </div>
                <Progress value={progressPercent} className="mt-3 h-3 bg-orange-100" />
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                  <TrailMetric label="Feitas" value={completedCount} />
                  <TrailMetric label="Proximas" value={remainingLessonsCount} />
                  <TrailMetric label="Arquivadas" value={archivedCount} />
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {trailLessons.length === 0 ? (
                  <div className="rounded-[22px] border border-dashed border-border bg-muted/30 px-4 py-5 text-sm text-muted-foreground">
                    Sua trilha aparecera aqui quando as aulas estiverem disponiveis.
                  </div>
                ) : (
                  trailLessons.map((lesson) => (
                    <TrailStep
                      key={lesson.id}
                      lesson={lesson}
                      isNext={lesson.id === nextLesson?.id}
                    />
                  ))
                )}
              </div>
            </div>

            <div className="school-surface p-5">
              <div className="flex items-center gap-2 text-sky-700">
                <Target className="h-4 w-4" />
                <h3 className="font-semibold text-card-foreground">Leitura rapida</h3>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <QuickRow label="Resumos gerados" value={summaries.length} />
                <QuickRow label="Aulas arquivadas" value={archivedCount} />
                <QuickRow label="Cards dificeis" value={vocabularyStats?.difficult || 0} />
                <QuickRow label="Revisoes nos ultimos 30 dias" value={vocabularyStats?.reviewed_30_days || 0} />
              </div>
            </div>

            <div className="rounded-[30px] border border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.98),rgba(255,255,255,0.98))] p-5 shadow-[0_24px_60px_-42px_rgba(5,150,105,0.28)]">
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

            {archivedLessons.length > 0 && (
              <div className="rounded-[30px] border border-amber-200 bg-amber-50/80 p-5 shadow-[0_20px_60px_-42px_rgba(217,119,6,0.35)]">
                <div className="flex items-center gap-2 text-amber-700">
                  <CircleDashed className="h-4 w-4" />
                  <h3 className="font-semibold text-card-foreground">Aulas arquivadas</h3>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  Estas aulas ficaram fora do fluxo principal por cancelamento ou falta.
                </p>
                <div className="mt-4 space-y-2">
                  {archivedLessons.slice(0, 3).map((lesson) => (
                    <div key={lesson.id} className="rounded-2xl bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-amber-100">
                      <p className="font-medium text-foreground">{lesson.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatLessonDate(lesson.date, { weekday: undefined })} {" - "} {formatStatusLabel(lesson.status)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
};

const formatStatusLabel = (status: string) => {
  if (status === "completed") return "Concluida";
  if (status === "scheduled") return "Agendada";
  if (status === "rescheduled") return "Reagendada";
  if (status === "in_progress") return "Em andamento";
  if (status === "canceled") return "Cancelada";
  if (status === "missed") return "Perdida";
  return status;
};

const HeroSnapshot = ({
  eyebrow,
  title,
  description,
  icon: Icon,
  onClick,
  tone,
  actionLabel,
  progressValue,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: typeof CalendarDays;
  onClick?: () => void;
  tone: "lesson" | "completed" | "progress";
  actionLabel?: string;
  progressValue?: number;
}) => {
  const toneClasses = {
    lesson: "border-amber-200/90 bg-[linear-gradient(135deg,rgba(255,225,124,0.97),rgba(239,193,67,0.94))] text-slate-950",
    completed: "border-emerald-200/90 bg-[linear-gradient(135deg,rgba(209,245,198,0.98),rgba(155,221,158,0.94))] text-slate-950",
    progress: "border-orange-200/90 bg-[linear-gradient(135deg,rgba(236,128,102,0.96),rgba(220,97,79,0.94))] text-white",
  } as const;

  const iconClasses = {
    lesson: "bg-white/70 text-amber-700",
    completed: "bg-white/70 text-emerald-700",
    progress: "bg-white/18 text-white ring-1 ring-white/25",
  } as const;

  const eyebrowClasses = {
    lesson: "text-slate-900/65",
    completed: "text-slate-900/65",
    progress: "text-white/72",
  } as const;

  const titleClasses = {
    lesson: "text-slate-950",
    completed: "text-slate-950",
    progress: "text-white",
  } as const;

  const descriptionClasses = {
    lesson: "text-slate-900/78",
    completed: "text-slate-900/78",
    progress: "text-white/82",
  } as const;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-[20px] border p-4 text-left shadow-[0_18px_38px_-30px_rgba(15,23,42,0.28)]",
        toneClasses[tone],
        onClick ? "transition hover:-translate-y-0.5 hover:shadow-[0_24px_48px_-30px_rgba(15,23,42,0.42)]" : "cursor-default",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className={cn("text-[11px] font-semibold uppercase tracking-[0.24em]", eyebrowClasses[tone])}>{eyebrow}</p>
        <span className={cn("flex h-9 w-9 items-center justify-center rounded-2xl", iconClasses[tone])}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className={cn("mt-3 text-lg font-semibold leading-6", titleClasses[tone])}>{title}</p>
      <p className={cn("mt-2 text-sm leading-5", descriptionClasses[tone])}>{description}</p>
      {typeof progressValue === "number" ? (
        <div className="mt-3 space-y-2">
          <Progress value={progressValue} className="h-2 bg-white/30 [&>div]:bg-white" />
        </div>
      ) : null}
      {actionLabel ? (
        <span className="mt-3 inline-flex rounded-full bg-slate-900/80 px-3 py-1.5 text-xs font-semibold text-white">
          {actionLabel}
        </span>
      ) : null}
    </button>
  );
};

const MetricCard = ({
  title,
  value,
  description,
  icon: Icon,
  tone,
  onClick,
}: {
  title: string;
  value: number;
  description: string;
  icon: typeof CheckCircle2;
  tone: "sky" | "indigo" | "sand" | "coral" | "mint";
  onClick?: () => void;
}) => {
  const toneClasses = {
    sky: {
      card: "border-cyan-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(239,250,255,0.94))] text-slate-950",
      icon: "bg-cyan-100 text-cyan-700",
      title: "text-cyan-700",
      description: "text-slate-600",
    },
    indigo: {
      card: "border-indigo-400/40 bg-[linear-gradient(180deg,rgba(77,89,184,0.98),rgba(60,70,159,0.96))] text-white",
      icon: "bg-white/16 text-white",
      title: "text-white/88",
      description: "text-white/72",
    },
    sand: {
      card: "border-amber-200/90 bg-[linear-gradient(180deg,rgba(255,249,232,0.98),rgba(251,236,188,0.94))] text-slate-950",
      icon: "bg-white/70 text-amber-700",
      title: "text-amber-800",
      description: "text-slate-700/75",
    },
    coral: {
      card: "border-rose-300/80 bg-[linear-gradient(180deg,rgba(229,95,95,0.98),rgba(211,67,67,0.95))] text-white",
      icon: "bg-white/16 text-white",
      title: "text-white/88",
      description: "text-white/72",
    },
    mint: {
      card: "border-emerald-200/90 bg-[linear-gradient(180deg,rgba(240,253,247,0.98),rgba(213,250,228,0.94))] text-slate-950",
      icon: "bg-emerald-100 text-emerald-700",
      title: "text-emerald-800",
      description: "text-slate-700/75",
    },
  } as const;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "rounded-[18px] border p-4 text-left shadow-[0_14px_30px_-26px_rgba(15,23,42,0.28)]",
        toneClasses[tone].card,
        onClick ? "cursor-pointer transition hover:-translate-y-0.5 hover:shadow-[0_22px_40px_-28px_rgba(15,23,42,0.32)]" : "cursor-default",
      )}
    >
      <div className="flex items-center justify-between">
        <p className={cn("text-[11px] font-semibold uppercase tracking-[0.18em]", toneClasses[tone].title)}>{title}</p>
        <span className={cn("flex h-9 w-9 items-center justify-center rounded-2xl", toneClasses[tone].icon)}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-3xl font-bold">{value}</p>
      <p className={cn("mt-1 text-xs leading-5", toneClasses[tone].description)}>{description}</p>
    </button>
  );
};

const TrailMetric = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-[18px] bg-white px-3 py-2 shadow-sm ring-1 ring-orange-100">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="mt-1 font-semibold text-foreground">{value}</p>
  </div>
);

const QuickRow = ({ label, value }: { label: string; value: number }) => (
  <div className="flex items-center justify-between rounded-[18px] bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
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
  <div className="flex items-center gap-2 rounded-[18px] bg-white px-3 py-2 text-sm text-muted-foreground shadow-sm ring-1 ring-emerald-100">
    <Icon className="h-4 w-4 text-emerald-700" />
    <span>{label}</span>
  </div>
);

const TrailStep = ({
  lesson,
  isNext,
}: {
  lesson: LessonHistoryLesson;
  isNext: boolean;
}) => {
  const completed = isCompletedLesson(lesson);
  const archived = isArchivedLesson(lesson);
  const upcoming = isUpcomingLesson(lesson);

  return (
    <div
      className={cn(
        "rounded-[24px] border px-4 py-3 shadow-sm",
        completed
          ? "border-emerald-200 bg-emerald-50/80"
          : archived
            ? "border-slate-200 bg-slate-50"
            : isNext
              ? "border-sky-200 bg-sky-50/85"
              : "border-slate-200 bg-white",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
            completed
              ? "bg-emerald-500 text-white"
              : archived
                ? "bg-slate-200 text-slate-600"
                : isNext
                  ? "bg-sky-600 text-white"
                  : "bg-slate-100 text-slate-600",
          )}
        >
          {completed ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : archived ? (
            <CircleDashed className="h-4 w-4" />
          ) : upcoming ? (
            <CalendarClock className="h-4 w-4" />
          ) : (
            <Flag className="h-4 w-4" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {typeof lesson.order === "number" && lesson.order > 0 && (
              <span className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground ring-1 ring-black/5">
                Aula {lesson.order}
              </span>
            )}
            <span className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-muted-foreground ring-1 ring-black/5">
              {formatStatusLabel(lesson.status)}
            </span>
            {isNext && (
              <span className="rounded-full bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white">
                Proxima
              </span>
            )}
          </div>

          <p className="mt-2 font-semibold text-foreground">{lesson.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatLessonDate(lesson.date, { weekday: undefined })}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {lesson.level ? `Nivel ${lesson.level}` : "Nivel nao informado"}
            {lesson.date ? ` - ${formatLessonDateShort(lesson.date)}` : ""}
          </p>
        </div>
      </div>
    </div>
  );
};

export default MinhasAulas;
