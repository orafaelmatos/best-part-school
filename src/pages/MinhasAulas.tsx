import { Fragment, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Flag,
  Image as ImageIcon,
  MoreVertical,
  Play,
  Search,
  Video,
  type LucideIcon,
} from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import RichTextContent from "@/components/RichTextContent";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { fetchAllPages } from "@/lib/fetchAllPages";
import { APP_PATHS } from "@/lib/routes";
import { cn } from "@/lib/utils";
import {
  LessonHistoryLesson,
  LessonHistorySummary,
  formatLessonDateShort,
  getLessonDateValue,
  getSummaryPreview,
  isActiveTrailLesson,
  isArchivedLesson,
  isCompletedLesson,
  isUpcomingLesson,
  sortLessonsByDateAsc,
  sortLessonsByDateDesc,
  stripHtml,
} from "@/lib/studentLessonHistory";

type DesktopTab = "upcoming" | "completed" | "trail";
type LessonRowVariant = "upcoming" | "completed" | "trail";

const MinhasAulas = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [desktopTab, setDesktopTab] = useState<DesktopTab>("upcoming");
  const [searchTerm, setSearchTerm] = useState("");

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

  const lessons = useMemo(() => (lessonsQuery.data || []) as LessonHistoryLesson[], [lessonsQuery.data]);
  const summaries = useMemo(() => summariesQuery.data || [], [summariesQuery.data]);

  const summaryByLesson = useMemo(
    () => new Map(summaries.map((summary) => [summary.lesson, summary])),
    [summaries],
  );

  const nonPendingLessons = useMemo(
    () => lessons.filter((lesson) => lesson.status !== "pending"),
    [lessons],
  );

  const trailLessonsBase = useMemo(
    () => nonPendingLessons.filter((lesson) => isActiveTrailLesson(lesson)),
    [nonPendingLessons],
  );

  const upcomingLessons = useMemo(
    () => sortLessonsByDateAsc(trailLessonsBase.filter((lesson) => isUpcomingLesson(lesson))),
    [trailLessonsBase],
  );

  const completedLessons = useMemo(
    () => sortLessonsByDateDesc(trailLessonsBase.filter((lesson) => isCompletedLesson(lesson))),
    [trailLessonsBase],
  );

  const trailLessons = useMemo(
    () =>
      [...trailLessonsBase].sort((left, right) => {
        const leftOrder = typeof left.order === "number" && left.order > 0 ? left.order : Number.MAX_SAFE_INTEGER;
        const rightOrder = typeof right.order === "number" && right.order > 0 ? right.order : Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }
        return getLessonDateValue(left.date) - getLessonDateValue(right.date);
      }),
    [trailLessonsBase],
  );

  const completedCount = completedLessons.length;
  const progressPercent = trailLessonsBase.length
    ? Math.round((completedCount / trailLessonsBase.length) * 100)
    : 0;

  const nextLesson = upcomingLessons[0];
  const remainingLessonsCount = upcomingLessons.length;
  const isLoading = lessonsQuery.isLoading || summariesQuery.isLoading;
  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredUpcomingLessons = useMemo(
    () => filterLessonsForSearch(upcomingLessons, summaryByLesson, normalizedSearch),
    [normalizedSearch, summaryByLesson, upcomingLessons],
  );

  const filteredCompletedLessons = useMemo(
    () => filterLessonsForSearch(completedLessons, summaryByLesson, normalizedSearch),
    [completedLessons, normalizedSearch, summaryByLesson],
  );

  const filteredTrailLessons = useMemo(
    () => filterLessonsForSearch(trailLessons, summaryByLesson, normalizedSearch),
    [normalizedSearch, summaryByLesson, trailLessons],
  );

  if (user?.role !== "student") {
    return <Navigate to={APP_PATHS.students} replace />;
  }

  const clearExpandedLesson = () => setExpandedId(null);

  return (
    <DashboardLayout>
      <MobileLessonsView
        completedCount={completedCount}
        completedLessons={completedLessons}
        isLoading={lessonsQuery.isLoading}
        expandedId={expandedId}
        nextLessonId={nextLesson?.id}
        onToggleLesson={(lessonId) => setExpandedId((current) => (current === lessonId ? null : lessonId))}
        progressPercent={progressPercent}
        remainingLessonsCount={remainingLessonsCount}
        summaryByLesson={summaryByLesson}
        trailLessons={trailLessons}
      />

      <div className="hidden md:block">
        <div className="mx-auto max-w-[980px]">
          <Tabs
            value={desktopTab}
            onValueChange={(value) => {
              setDesktopTab(value as DesktopTab);
              clearExpandedLesson();
            }}
            className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/95 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.38)] backdrop-blur"
          >
            <header className="border-b border-slate-200/80 px-6 py-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950">Minhas Aulas</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Acompanhe seus encontros e acesse os materiais.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <label className="relative hidden lg:block">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Buscar aula"
                      className="h-11 w-52 rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => navigate(APP_PATHS.calendar)}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                    aria-label="Abrir agenda"
                  >
                    <CalendarDays className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-5 lg:hidden">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Buscar aula"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                  />
                </label>
              </div>

              <TabsList className="mt-5 h-auto min-h-0 w-full justify-start gap-7 overflow-visible rounded-none border-b border-slate-200 bg-transparent p-0">
                <DesktopTabTrigger value="upcoming" label="Próximas" count={upcomingLessons.length} />
                <DesktopTabTrigger value="completed" label="Concluídas" count={completedLessons.length} />
                <DesktopTabTrigger value="trail" label="Trilha de Aprendizado" count={trailLessons.length} />
              </TabsList>
            </header>

            <TabsContent value="upcoming" className="m-0">
              <DesktopLessonList
                emptyDescription="Quando uma nova aula for marcada, ela aparecera aqui."
                emptyTitle={normalizedSearch ? "Nenhuma aula encontrada" : "Nenhuma aula futura encontrada"}
                expandedId={expandedId}
                isLoading={isLoading}
                lessons={filteredUpcomingLessons}
                onToggleLesson={(lessonId) => setExpandedId((current) => (current === lessonId ? null : lessonId))}
                summaryByLesson={summaryByLesson}
                title="Próximas aulas"
                variant="upcoming"
              />

              <section className="border-t border-slate-200/80 bg-slate-50/70 px-6 py-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-950">Aulas concluídas</h2>
                    <p className="text-sm text-muted-foreground">Últimos encontros finalizados.</p>
                  </div>
                  {completedLessons.length > 3 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDesktopTab("completed");
                        clearExpandedLesson();
                      }}
                      className="text-sm font-semibold text-sky-700 transition hover:text-sky-900"
                    >
                      Ver todas
                    </button>
                  ) : null}
                </div>

                {isLoading ? (
                  <DesktopLoadingState />
                ) : filteredCompletedLessons.length === 0 ? (
                  <DesktopEmptyState
                    description={normalizedSearch ? "Tente buscar por outro titulo, professor ou nivel." : "Suas aulas finalizadas vao aparecer aqui."}
                    title={normalizedSearch ? "Nenhuma aula concluida encontrada" : "Ainda sem aulas concluidas"}
                  />
                ) : (
                  <div className="overflow-hidden rounded-[18px] border border-slate-200 bg-white">
                    <div className="divide-y divide-slate-100">
                      {filteredCompletedLessons.slice(0, 3).map((lesson) => (
                        <DesktopLessonRow
                          key={lesson.id}
                          expanded={expandedId === lesson.id}
                          lesson={lesson}
                          onToggle={() => setExpandedId((current) => (current === lesson.id ? null : lesson.id))}
                          summary={summaryByLesson.get(lesson.id)}
                          variant="completed"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </TabsContent>

            <TabsContent value="completed" className="m-0">
              <DesktopLessonList
                emptyDescription={normalizedSearch ? "Tente buscar por outro titulo, professor ou nivel." : "Suas aulas concluidas vao aparecer aqui conforme voce avanca."}
                emptyTitle={normalizedSearch ? "Nenhuma aula concluida encontrada" : "Ainda sem aulas concluidas"}
                expandedId={expandedId}
                isLoading={isLoading}
                lessons={filteredCompletedLessons}
                onToggleLesson={(lessonId) => setExpandedId((current) => (current === lessonId ? null : lessonId))}
                summaryByLesson={summaryByLesson}
                title="Aulas concluídas"
                variant="completed"
              />
            </TabsContent>

            <TabsContent value="trail" className="m-0">
              <section className="px-6 py-5">
                <div className="rounded-[18px] border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex items-start justify-between gap-6">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">Andamento da trilha</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {trailLessons.length
                          ? `${completedCount} de ${trailLessons.length} aulas concluidas`
                          : "Sua trilha aparecera quando as aulas estiverem disponiveis."}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-950 px-3 py-1 text-sm font-semibold text-white">
                      {progressPercent}%
                    </span>
                  </div>
                  <Progress value={progressPercent} className="mt-4 h-2.5 bg-slate-200" />
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <DesktopTrailMetric label="Feitas" value={completedCount} />
                    <DesktopTrailMetric label="Próximas" value={remainingLessonsCount} />
                    <DesktopTrailMetric label="Total" value={trailLessons.length} />
                  </div>
                </div>
              </section>

              <DesktopLessonList
                emptyDescription={normalizedSearch ? "Tente buscar por outro titulo, professor ou nivel." : "Sua trilha aparecera aqui quando as aulas estiverem disponiveis."}
                emptyTitle={normalizedSearch ? "Nenhuma aula encontrada" : "Trilha ainda nao disponivel"}
                expandedId={expandedId}
                isLoading={isLoading}
                lessons={filteredTrailLessons}
                onToggleLesson={(lessonId) => setExpandedId((current) => (current === lessonId ? null : lessonId))}
                summaryByLesson={summaryByLesson}
                title="Sequência do curso"
                variant="trail"
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
};

const filterLessonsForSearch = (
  lessons: LessonHistoryLesson[],
  summaryByLesson: Map<string, LessonHistorySummary>,
  searchTerm: string,
) => {
  if (!searchTerm) {
    return lessons;
  }

  return lessons.filter((lesson) => {
    const summary = summaryByLesson.get(lesson.id);
    const searchableText = [
      lesson.title,
      lesson.level,
      lesson.teacher_name,
      lesson.template_title,
      formatStatusLabel(lesson.status),
      getSummaryPreview(summary),
      stripHtml(lesson.notes),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchableText.includes(searchTerm);
  });
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

const getLessonOrderLabel = (lesson: LessonHistoryLesson) => {
  if (lesson.is_extra) return "Aula extra";
  if (typeof lesson.order === "number" && lesson.order > 0) return `Aula ${lesson.order}`;
  return "Aula";
};

const parseLessonDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatLessonTimeRange = (value?: string | null) => {
  const start = parseLessonDate(value);
  if (!start || !value?.includes("T")) {
    return "Horario a combinar";
  }

  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${formatter.format(start)} - ${formatter.format(end)}`;
};

const DesktopTabTrigger = ({
  value,
  label,
  count,
}: {
  value: DesktopTab;
  label: string;
  count: number;
}) => (
  <TabsTrigger
    value={value}
    className="relative min-h-0 rounded-none border-b-2 border-transparent bg-transparent px-0 pb-3 pt-0 text-sm font-semibold text-muted-foreground shadow-none transition data-[state=active]:border-sky-600 data-[state=active]:bg-transparent data-[state=active]:text-sky-700 data-[state=active]:shadow-none"
  >
    <span>{label}</span>
    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
      {count}
    </span>
  </TabsTrigger>
);

const DesktopLessonList = ({
  emptyDescription,
  emptyTitle,
  expandedId,
  isLoading,
  lessons,
  onToggleLesson,
  summaryByLesson,
  title,
  variant,
}: {
  emptyDescription: string;
  emptyTitle: string;
  expandedId: string | null;
  isLoading: boolean;
  lessons: LessonHistoryLesson[];
  onToggleLesson: (lessonId: string) => void;
  summaryByLesson: Map<string, LessonHistorySummary>;
  title: string;
  variant: LessonRowVariant;
}) => (
  <section className="px-6 py-5">
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
        {isLoading ? "Carregando..." : `${lessons.length} aula${lessons.length === 1 ? "" : "s"}`}
      </span>
    </div>

    {isLoading ? (
      <DesktopLoadingState />
    ) : lessons.length === 0 ? (
      <DesktopEmptyState description={emptyDescription} title={emptyTitle} />
    ) : (
      <div className="overflow-hidden rounded-[18px] border border-slate-200 bg-white">
        <div className="divide-y divide-slate-100">
          {lessons.map((lesson) => (
            <DesktopLessonRow
              key={lesson.id}
              expanded={expandedId === lesson.id}
              lesson={lesson}
              onToggle={() => onToggleLesson(lesson.id)}
              summary={summaryByLesson.get(lesson.id)}
              variant={variant}
            />
          ))}
        </div>
      </div>
    )}
  </section>
);

const DesktopLessonRow = ({
  expanded,
  lesson,
  onToggle,
  summary,
  variant,
}: {
  expanded: boolean;
  lesson: LessonHistoryLesson;
  onToggle: () => void;
  summary?: LessonHistorySummary;
  variant: LessonRowVariant;
}) => {
  const completed = isCompletedLesson(lesson);
  const upcoming = isUpcomingLesson(lesson);
  const archived = isArchivedLesson(lesson);
  const summaryPreview = getSummaryPreview(summary);
  const notesPreview = stripHtml(lesson.notes);
  const previewText =
    summaryPreview ||
    notesPreview ||
    (upcoming ? "Encontro agendado para continuidade da sua trilha." : "Materiais da aula disponiveis quando registrados pelo professor.");
  const primaryLabel = variant === "completed" ? "Ver materiais" : lesson.meeting_url && upcoming ? "Entrar" : "Ver detalhes";
  const primaryIcon = lesson.meeting_url && upcoming ? Video : BookOpen;

  return (
    <Fragment>
      <article
        className={cn(
          "grid grid-cols-[72px_minmax(0,1fr)_auto_40px] items-center gap-4 px-4 py-4 transition",
          expanded ? "bg-sky-50/50" : "bg-white hover:bg-slate-50/80",
        )}
      >
        <LessonDateBadge date={lesson.date} />

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-950">{lesson.title}</span>
            {lesson.is_extra ? (
              <LessonPill tone="sky">Extra</LessonPill>
            ) : null}
            {variant === "trail" ? (
              <LessonPill tone={completed ? "emerald" : archived ? "slate" : "sky"}>
                {formatStatusLabel(lesson.status)}
              </LessonPill>
            ) : null}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3.5 w-3.5" />
              {formatLessonTimeRange(lesson.date)}
            </span>
            {lesson.teacher_name ? <span>Professor: {lesson.teacher_name}</span> : null}
            {lesson.level ? <span>Nivel {lesson.level}</span> : null}
          </div>

          <p className="mt-1.5 line-clamp-1 text-sm text-muted-foreground">{previewText}</p>

          <div className="mt-2 flex flex-wrap gap-2">
            <LessonPill tone={completed ? "emerald" : upcoming ? "sky" : "slate"}>{getLessonOrderLabel(lesson)}</LessonPill>
            {lesson.template_title ? <LessonPill tone="slate">{lesson.template_title}</LessonPill> : null}
          </div>
        </div>

        {lesson.meeting_url && upcoming ? (
          <a
            href={lesson.meeting_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-sky-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-800"
          >
            <Video className="h-4 w-4" />
            {primaryLabel}
          </a>
        ) : (
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
          >
            {(() => {
              const Icon = primaryIcon;
              return <Icon className="h-4 w-4" />;
            })()}
            {expanded ? "Ocultar" : primaryLabel}
          </button>
        )}

        <button
          type="button"
          onClick={onToggle}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          aria-label={expanded ? "Ocultar detalhes da aula" : "Ver detalhes da aula"}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </article>

      {expanded ? (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-4">
          <DesktopLessonDetails lesson={lesson} summary={summary} />
        </div>
      ) : null}
    </Fragment>
  );
};

const LessonDateBadge = ({ date }: { date?: string | null }) => {
  const parsedDate = parseLessonDate(date);
  const month = parsedDate
    ? parsedDate.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "").toUpperCase()
    : "---";
  const day = parsedDate ? parsedDate.toLocaleDateString("pt-BR", { day: "2-digit" }) : "--";
  const weekday = parsedDate
    ? parsedDate.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")
    : "Sem data";

  return (
    <div className="flex h-[72px] w-[62px] flex-col items-center justify-center rounded-2xl bg-slate-50 text-center ring-1 ring-slate-200">
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-700">{month}</span>
      <span className="mt-1 text-xl font-bold leading-none text-slate-950">{day}</span>
      <span className="mt-1 text-[11px] font-semibold capitalize text-slate-500">{weekday}</span>
    </div>
  );
};

const LessonPill = ({
  children,
  tone,
}: {
  children: string;
  tone: "sky" | "emerald" | "slate";
}) => {
  const toneClasses = {
    sky: "bg-sky-50 text-sky-700 ring-sky-100",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    slate: "bg-slate-100 text-slate-600 ring-slate-200",
  } as const;

  return (
    <span className={cn("inline-flex rounded-md px-2.5 py-1 text-xs font-semibold ring-1", toneClasses[tone])}>
      {children}
    </span>
  );
};

const DesktopLessonDetails = ({
  lesson,
  summary,
}: {
  lesson: LessonHistoryLesson;
  summary?: LessonHistorySummary;
}) => {
  const richDetail = summary?.summary || lesson.notes || "";
  const attachments = lesson.attachments || [];
  const hasLinks = Boolean(lesson.meeting_url || lesson.recording_url || attachments.length);
  const summaryWords = summary?.words || [];
  const lessonWords = lesson.new_words || [];
  const hasVocabulary = Boolean(
    summaryWords.length ||
    lessonWords.length ||
    summary?.mistakes?.length ||
    summary?.next_topics?.length ||
    summary?.flashcards?.length
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="rounded-[16px] border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 text-slate-950">
          <FileText className="h-4 w-4 text-sky-700" />
          <h3 className="text-sm font-semibold">Resumo da aula</h3>
        </div>
        <RichTextContent
          value={richDetail}
          fallback="O professor ainda nao adicionou resumo ou materiais para esta aula."
          className="mt-2 text-sm leading-6 text-muted-foreground"
        />
      </div>

      <div className="space-y-4">
        <div className="rounded-[16px] border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-slate-950">
            <BookOpen className="h-4 w-4 text-sky-700" />
            <h3 className="text-sm font-semibold">Materiais</h3>
          </div>

          {hasLinks ? (
            <div className="mt-3 space-y-2">
              {lesson.meeting_url ? (
                <MaterialLink href={lesson.meeting_url} icon={Video} label="Link da aula" />
              ) : null}
              {lesson.recording_url ? (
                <MaterialLink href={lesson.recording_url} icon={Play} label="Gravação" />
              ) : null}
              {attachments.map((attachment) => (
                attachment.is_image ? (
                  <ImageMaterialLink
                    key={attachment.id}
                    href={attachment.file_url}
                    label={attachment.file_name || "Imagem anexada"}
                  />
                ) : (
                  <MaterialLink
                    key={attachment.id}
                    href={attachment.file_url}
                    icon={FileText}
                    label={attachment.file_name || "Arquivo anexado"}
                  />
                )
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Nenhum material anexado ainda.</p>
          )}
        </div>

        {hasVocabulary ? (
          <div className="rounded-[16px] border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-slate-950">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-semibold">Palavras e revisão</h3>
            </div>

            {summaryWords.length || lessonWords.length ? (
              <div className="mt-3 space-y-2">
                {summaryWords.map((word) => (
                  <VocabularyRow key={word.id} word={word.word} meaning={word.meaning} />
                ))}
                {!summaryWords.length ? lessonWords.map((word) => (
                  <VocabularyRow key={word.id} word={word.word} meaning={word.meaning} />
                )) : null}
              </div>
            ) : null}

            {summary?.mistakes?.length ? (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="text-xs font-semibold uppercase text-slate-500">Pontos para revisar</p>
                <div className="mt-2 space-y-2">
                  {summary.mistakes.slice(0, 3).map((mistake) => (
                    <p key={mistake.id} className="text-sm leading-5 text-slate-600">
                      {mistake.mistake}{mistake.correction ? ` -> ${mistake.correction}` : ""}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

const VocabularyRow = ({ word, meaning }: { word: string; meaning: string }) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
    <p className="text-sm font-semibold text-slate-900">{word}</p>
    {meaning ? <p className="mt-0.5 text-xs leading-5 text-slate-600">{meaning}</p> : null}
  </div>
);

const ImageMaterialLink = ({ href, label }: { href: string; label: string }) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className="block overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
  >
    <img src={href} alt={label} className="h-32 w-full object-cover" />
    <span className="flex min-h-10 items-center gap-2 px-3 py-2">
      <ImageIcon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 truncate">{label}</span>
    </span>
  </a>
);

const MaterialLink = ({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
}) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
  >
    <Icon className="h-4 w-4 shrink-0" />
    <span className="min-w-0 truncate">{label}</span>
  </a>
);

const DesktopTrailMetric = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-center">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="mt-1 text-base font-bold text-slate-950">{value}</p>
  </div>
);

const DesktopLoadingState = () => (
  <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm text-muted-foreground">
    Carregando suas aulas...
  </div>
);

const DesktopEmptyState = ({
  description,
  title,
}: {
  description: string;
  title: string;
}) => (
  <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
    <p className="font-semibold text-slate-950">{title}</p>
    <p className="mt-1 text-sm text-muted-foreground">{description}</p>
  </div>
);

const MobileLessonsView = ({
  completedCount,
  completedLessons,
  expandedId,
  isLoading,
  nextLessonId,
  onToggleLesson,
  progressPercent,
  remainingLessonsCount,
  summaryByLesson,
  trailLessons,
}: {
  completedCount: number;
  completedLessons: LessonHistoryLesson[];
  expandedId: string | null;
  isLoading: boolean;
  nextLessonId?: string;
  onToggleLesson: (lessonId: string) => void;
  progressPercent: number;
  remainingLessonsCount: number;
  summaryByLesson: Map<string, LessonHistorySummary>;
  trailLessons: LessonHistoryLesson[];
}) => (
  <div className="space-y-4 md:hidden">
    <section className="rounded-[24px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.28)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700">Minhas aulas</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Aulas e trilha</h1>
        </div>
        <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
          {progressPercent}%
        </span>
      </div>
      <Progress value={progressPercent} className="mt-4 h-2.5 bg-slate-200" />
      <div className="mt-3 grid grid-cols-2 gap-2 text-center">
        <MobileLessonMetric label="Feitas" value={completedCount} />
        <MobileLessonMetric label="Proximas" value={remainingLessonsCount} />
      </div>
    </section>

    <section className="rounded-[24px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.24)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-950">Aulas feitas</h2>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
          {isLoading ? "..." : completedLessons.length}
        </span>
      </div>

      <div className="mt-3 space-y-2.5">
        {isLoading ? (
          <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-muted-foreground">
            Carregando...
          </div>
        ) : completedLessons.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-muted-foreground">
            Nenhuma aula concluida ainda.
          </div>
        ) : (
          completedLessons.map((lesson) => (
            <MobileLessonCard
              key={lesson.id}
              expanded={expandedId === lesson.id}
              lesson={lesson}
              onToggle={() => onToggleLesson(lesson.id)}
              summary={summaryByLesson.get(lesson.id)}
            />
          ))
        )}
      </div>
    </section>

    <section className="rounded-[24px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.24)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-950">Trilha do curso</h2>
        <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">
          {trailLessons.length}
        </span>
      </div>

      <div className="mt-3 space-y-2.5">
        {trailLessons.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-muted-foreground">
            Trilha ainda nao disponivel.
          </div>
        ) : (
          trailLessons.map((lesson) => (
            <MobileTrailStep
              key={lesson.id}
              expanded={expandedId === lesson.id}
              lesson={lesson}
              isNext={lesson.id === nextLessonId}
              onToggle={() => onToggleLesson(lesson.id)}
              summary={summaryByLesson.get(lesson.id)}
            />
          ))
        )}
      </div>
    </section>
  </div>
);

const MobileLessonMetric = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-[16px] bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
    <p className="text-[11px] font-medium text-slate-500">{label}</p>
    <p className="mt-1 text-base font-bold text-slate-950">{value}</p>
  </div>
);

const MobileLessonCard = ({
  expanded,
  lesson,
  onToggle,
  summary,
}: {
  expanded: boolean;
  lesson: LessonHistoryLesson;
  onToggle: () => void;
  summary?: LessonHistorySummary;
}) => (
  <article className="rounded-[20px] border border-emerald-100 bg-emerald-50/70 px-4 py-3">
    <button type="button" onClick={onToggle} className="flex w-full items-start gap-3 text-left">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-white">
        <CheckCircle2 className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {!lesson.is_extra && typeof lesson.order === "number" && lesson.order > 0 ? (
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-100">
              Aula {lesson.order}
            </span>
          ) : null}
          <span className="text-xs font-medium text-emerald-800">
            {formatLessonDateShort(lesson.date)}
          </span>
        </div>
        <p className="mt-1 truncate font-semibold text-slate-950">{lesson.title}</p>
        <p className="mt-0.5 text-xs text-slate-600">{lesson.level ? `Nivel ${lesson.level}` : "Nivel nao informado"}</p>
      </div>
      <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-100">
        {expanded ? "Ocultar" : "Ver"}
      </span>
    </button>
    {expanded ? (
      <div className="mt-3 border-t border-emerald-100 pt-3">
        <DesktopLessonDetails lesson={lesson} summary={summary} />
      </div>
    ) : null}
  </article>
);

const MobileTrailStep = ({
  expanded,
  lesson,
  isNext,
  onToggle,
  summary,
}: {
  expanded: boolean;
  lesson: LessonHistoryLesson;
  isNext: boolean;
  onToggle: () => void;
  summary?: LessonHistorySummary;
}) => {
  const completed = isCompletedLesson(lesson);
  const upcoming = isUpcomingLesson(lesson);

  return (
    <article
      className={cn(
        "rounded-[20px] border px-4 py-3",
        completed
          ? "border-emerald-100 bg-emerald-50/70"
          : isNext
            ? "border-sky-200 bg-sky-50"
            : "border-slate-200 bg-slate-50/80",
      )}
    >
      <button type="button" onClick={onToggle} className="flex w-full items-start gap-3 text-left">
        <span
          className={cn(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl",
            completed
              ? "bg-emerald-500 text-white"
              : isNext
                ? "bg-sky-600 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200",
          )}
        >
          {completed ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : upcoming ? (
            <CalendarClock className="h-4 w-4" />
          ) : (
            <Flag className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {!lesson.is_extra && typeof lesson.order === "number" && lesson.order > 0 ? (
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                Aula {lesson.order}
              </span>
            ) : null}
            {isNext ? (
              <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                Proxima
              </span>
            ) : null}
          </div>
          <p className="mt-1 truncate font-semibold text-slate-950">{lesson.title}</p>
          <p className="mt-0.5 text-xs text-slate-600">
            {completed ? "Feita" : formatStatusLabel(lesson.status)}
            {lesson.date ? ` · ${formatLessonDateShort(lesson.date)}` : ""}
          </p>
        </div>
        <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
          {expanded ? "Ocultar" : "Ver"}
        </span>
      </button>
      {expanded ? (
        <div className={cn("mt-3 border-t pt-3", completed ? "border-emerald-100" : "border-slate-200")}>
          <DesktopLessonDetails lesson={lesson} summary={summary} />
        </div>
      ) : null}
    </article>
  );
};

export default MinhasAulas;
