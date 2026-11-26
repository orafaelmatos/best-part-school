import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, CalendarClock, CheckCircle2, Search } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { LessonList } from "@/components/student/lessons/LessonList";
import { LessonProgressSummary } from "@/components/student/lessons/LessonProgressSummary";
import {
  type LessonSegment,
  filterLessonsForSearch,
  formatLessonCount,
} from "@/components/student/lessons/lessonDisplay";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  SearchBar,
  SegmentedControl,
  SkeletonCard,
} from "@/components/student/ui";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { fetchAllPages } from "@/lib/fetchAllPages";
import { APP_PATHS } from "@/lib/routes";
import {
  LessonHistoryLesson,
  LessonHistorySummary,
  getLessonDateValue,
  isActiveTrailLesson,
  isCompletedLesson,
  isUpcomingLesson,
  sortLessonsByDateAsc,
  sortLessonsByDateDesc,
} from "@/lib/studentLessonHistory";

/** The search only helps when the list is long. */
const SEARCH_MIN_LESSONS = 6;

const segments: { value: LessonSegment; label: string }[] = [
  { value: "trail", label: "Trilha" },
  { value: "upcoming", label: "Próximas" },
  { value: "completed", label: "Concluídas" },
];

const segmentCopy = {
  trail: {
    title: "Trilha do curso",
    icon: BookOpen,
    emptyTitle: "Trilha ainda não disponível",
    emptyDescription: "Sua trilha aparecerá aqui quando as aulas estiverem disponíveis.",
  },
  upcoming: {
    title: "Próximas aulas",
    icon: CalendarClock,
    emptyTitle: "Nenhuma aula futura encontrada",
    emptyDescription: "Quando uma nova aula for marcada, ela aparecerá aqui.",
  },
  completed: {
    title: "Aulas concluídas",
    icon: CheckCircle2,
    emptyTitle: "Ainda sem aulas concluídas",
    emptyDescription: "Suas aulas concluídas vão aparecer aqui conforme você avança.",
  },
} as const;

const MinhasAulas = () => {
  const { user } = useAuth();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [segment, setSegment] = useState<LessonSegment>("trail");
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

  const segmentLessons = segment === "upcoming" ? upcomingLessons : segment === "completed" ? completedLessons : trailLessons;
  const showSearch = trailLessons.length >= SEARCH_MIN_LESSONS;
  const activeSearch = showSearch ? searchTerm.trim() : "";

  const visibleLessons = useMemo(
    () => filterLessonsForSearch(segmentLessons, summaryByLesson, activeSearch),
    [activeSearch, segmentLessons, summaryByLesson],
  );

  if (user?.role !== "student") {
    return <Navigate to={APP_PATHS.students} replace />;
  }

  const completedCount = completedLessons.length;
  const nextLesson = upcomingLessons[0];
  const copy = segmentCopy[segment];

  const changeSegment = (value: LessonSegment) => {
    setSegment(value);
    setExpandedId(null);
  };

  const renderList = () => {
    if (lessonsQuery.isLoading) {
      return <SkeletonCard label="Carregando suas aulas" lines={3} />;
    }
    if (visibleLessons.length === 0) {
      return (
        <Card padding="none">
          {activeSearch ? (
            <EmptyState
              compact
              icon={Search}
              title="Nenhuma aula encontrada"
              description="Tente buscar por outro título, professor ou nível."
              action={<Button variant="outline" size="sm" onClick={() => setSearchTerm("")}>Limpar busca</Button>}
            />
          ) : (
            <EmptyState compact icon={copy.icon} title={copy.emptyTitle} description={copy.emptyDescription} />
          )}
        </Card>
      );
    }
    return (
      <LessonList
        lessons={visibleLessons}
        expandedId={expandedId}
        nextLessonId={nextLesson?.id}
        onToggleLesson={(lessonId) => setExpandedId((current) => (current === lessonId ? null : lessonId))}
        summaryByLesson={summaryByLesson}
      />
    );
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-8 [&>*]:min-w-0">
        {/* The shell header shows "Minhas aulas" visually; this keeps one h1 for screen readers. */}
        <h1 className="sr-only">Minhas aulas</h1>

        {lessonsQuery.isError ? (
          <Alert
            tone="danger"
            role="alert"
            title="Não carregamos suas aulas."
            action={(
              <Button variant="outline" size="sm" onClick={() => lessonsQuery.refetch()} loading={lessonsQuery.isFetching} loadingLabel="Tentando…">
                Tentar novamente
              </Button>
            )}
          >
            Verifique sua conexão e tente novamente.
          </Alert>
        ) : (
          <>
            {lessonsQuery.isLoading ? (
              <SkeletonCard label="Carregando seu progresso" lines={2} />
            ) : trailLessons.length > 0 ? (
              <LessonProgressSummary
                completedCount={completedCount}
                totalCount={trailLessons.length}
                upcomingCount={upcomingLessons.length}
                nextLesson={nextLesson}
              />
            ) : null}

            <section aria-labelledby="lessons-list-title" className="space-y-4">
              <h2 id="lessons-list-title" className="sr-only">Suas aulas</h2>
              <SegmentedControl label="Mostrar aulas" items={segments} value={segment} onChange={changeSegment} />

              {showSearch ? (
                <SearchBar
                  label="Buscar aula"
                  placeholder="Buscar por título, professor ou nível"
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value);
                    setExpandedId(null);
                  }}
                />
              ) : null}

              {!lessonsQuery.isLoading ? (
                <p className="text-body text-ink-secondary" aria-live="polite">
                  {copy.title} · {formatLessonCount(visibleLessons.length)}
                </p>
              ) : null}

              {renderList()}
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default MinhasAulas;
