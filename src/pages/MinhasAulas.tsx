import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
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
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
                Agora a pagina separa com mais clareza o que vem a seguir, o que ja foi feito e como sua trilha esta avancando.
              </p>

              <div className="mt-6 grid gap-4 lg:grid-cols-3">
                <HeroSnapshot
                  eyebrow="Proxima aula"
                  title={nextLesson ? nextLesson.title : "Nenhuma aula agendada"}
                  description={nextLesson ? formatLessonDate(nextLesson.date) : "Quando uma nova aula for marcada, ela aparecera aqui."}
                  icon={CalendarDays}
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
                />
              </div>

              <div className="mt-4 rounded-[24px] border border-sky-100 bg-sky-50/80 px-4 py-3 text-sm text-sky-900">
                Se precisar mudar um horario, fale com seu professor. O reagendamento e feito apenas pelo professor.
              </div>

              <div className="mt-6 rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-sm backdrop-blur">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Resumo do ciclo atual</p>
                    <p className="mt-2 text-xl font-semibold text-foreground">
                      {visibleLessons.length ? `${completedCount} de ${visibleLessons.length} aulas concluidas` : "Ainda sem aulas visiveis"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Use a trilha ao lado para entender rapidamente o que ja passou e o que vem depois.
                    </p>
                  </div>

                  <div className="min-w-[220px]">
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Progresso do ciclo atual</span>
                      <span className="font-semibold text-foreground">{progressPercent}%</span>
                    </div>
                    <Progress value={progressPercent} className="h-3 bg-slate-200" />
                    <p className="mt-2 text-xs text-muted-foreground">
                      {remainingLessonsCount} proxima{remainingLessonsCount === 1 ? "" : "s"} etapa{remainingLessonsCount === 1 ? "" : "s"} pela frente
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

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
          <div className="space-y-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">Proximas aulas</h2>
              <p className="text-sm text-muted-foreground">
                Aqui ficam somente as aulas que ainda vao acontecer, para voce bater o olho e saber o que vem primeiro.
              </p>
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
                  />
                ))}
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-[28px] border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2 text-primary">
                <Target className="h-4 w-4" />
                <h3 className="font-semibold text-card-foreground">Andamento da trilha</h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                A trilha abaixo mostra a ordem das aulas e deixa claro o que ja foi concluido e o que ainda esta por vir.
              </p>

              <div className="mt-4 rounded-[22px] bg-muted/40 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Progresso</span>
                  <span className="font-semibold text-foreground">{progressPercent}%</span>
                </div>
                <Progress value={progressPercent} className="mt-3 h-3 bg-slate-200" />
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
          </aside>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">Aulas feitas</h2>
              <p className="text-sm text-muted-foreground">
                Aqui ficam as aulas concluidas, com os resumos, palavras e tarefas que ajudam a revisar o que ja passou.
              </p>
            </div>

            {completedLessons.length === 0 ? (
              <div className="rounded-[26px] border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
                Suas aulas concluidas vao aparecer aqui conforme voce finalizar a trilha.
              </div>
            ) : (
              <div className="relative pl-6 before:absolute before:bottom-4 before:left-2 before:top-4 before:w-px before:bg-slate-200">
                <div className="space-y-6">
                  {completedLessons.map((lesson) => (
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
                <QuickRow label="Resumos gerados" value={summaries.length} />
                <QuickRow label="Aulas arquivadas" value={archivedCount} />
                <QuickRow label="Cards dificeis" value={vocabularyStats?.difficult || 0} />
                <QuickRow label="Revisoes nos ultimos 30 dias" value={vocabularyStats?.reviewed_30_days || 0} />
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

            {archivedLessons.length > 0 && (
              <div className="rounded-[28px] border border-amber-200 bg-amber-50/70 p-5 shadow-sm">
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
        </section>
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
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: typeof CalendarDays;
}) => (
  <div className="rounded-[24px] border border-white/70 bg-white/85 p-4 shadow-sm backdrop-blur">
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{eyebrow}</p>
      <Icon className="h-4 w-4 text-sky-700" />
    </div>
    <p className="mt-3 text-lg font-semibold tracking-tight text-foreground">{title}</p>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
  </div>
);

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

const TrailMetric = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-2xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-100">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="mt-1 font-semibold text-foreground">{value}</p>
  </div>
);

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
      className={[
        "rounded-[22px] border px-4 py-3 shadow-sm",
        completed
          ? "border-emerald-200 bg-emerald-50/70"
          : archived
            ? "border-slate-200 bg-slate-50"
            : isNext
              ? "border-sky-200 bg-sky-50/80"
              : "border-border bg-background",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div
          className={[
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            completed
              ? "bg-emerald-500 text-white"
              : archived
                ? "bg-slate-200 text-slate-600"
                : isNext
                  ? "bg-sky-600 text-white"
                  : "bg-slate-100 text-slate-600",
          ].join(" ")}
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
              <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Aula {lesson.order}
              </span>
            )}
            <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {formatStatusLabel(lesson.status)}
            </span>
            {isNext && (
              <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[11px] font-semibold text-white">
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
