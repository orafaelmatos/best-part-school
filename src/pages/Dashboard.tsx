import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Headphones,
  MessageSquare,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { buildNewModePath } from "@/lib/aiStudy";
import { fetchAllPages } from "@/lib/fetchAllPages";
import { APP_PATHS } from "@/lib/routes";
import { cn } from "@/lib/utils";
import {
  formatLessonDate,
  getReviewPendingCount,
  isCompletedLesson,
  isUpcomingLesson,
  sortLessonsByDateAsc,
  sortLessonsByDateDesc,
  type LessonHistoryHomework,
  type LessonHistoryLesson,
  type LessonHistorySummary,
} from "@/lib/studentLessonHistory";

type VocabularyStats = {
  due_today: number;
  overdue: number;
  total_learned_words: number;
};

type StaffLesson = {
  status?: string;
};

const EMPTY_LESSONS: LessonHistoryLesson[] = [];
const EMPTY_SUMMARIES: LessonHistorySummary[] = [];
const EMPTY_HOMEWORK_ITEMS: LessonHistoryHomework[] = [];

const Dashboard = () => {
  const { user } = useAuth();

  if (user?.role === "student") {
    return <StudentDashboard />;
  }

  return <StaffDashboard />;
};

const StudentDashboard = () => {
  const { user } = useAuth();
  const studentId = user?.user_id || "";
  const name = user?.email?.split("@")[0] || "Aluno";

  const lessonsQuery = useQuery({
    queryKey: ["dashboard-student-lessons", studentId],
    queryFn: async () => {
      const response = await api.get("/lessons/", {
        params: {
          all: true,
          is_template: false,
        },
      });
      return (Array.isArray(response.data) ? response.data : response.data.results || []) as LessonHistoryLesson[];
    },
    enabled: !!studentId,
  });

  const summariesQuery = useQuery({
    queryKey: ["dashboard-student-summaries", studentId],
    queryFn: () => fetchAllPages<LessonHistorySummary>(`/students/${studentId}/lesson-summaries/`),
    enabled: !!studentId,
  });

  const homeworkQuery = useQuery({
    queryKey: ["dashboard-student-homework", studentId],
    queryFn: () =>
      fetchAllPages<LessonHistoryHomework>("/homework/", {
        student: studentId,
        ordering: "due_date",
      }),
    enabled: !!studentId,
  });

  const vocabularyStatsQuery = useQuery({
    queryKey: ["dashboard-student-vocabulary"],
    queryFn: async () => {
      const response = await api.get("/vocabulary-cards/dashboard/");
      return response.data as VocabularyStats;
    },
    enabled: user?.role === "student",
  });

  const lessons = lessonsQuery.data ?? EMPTY_LESSONS;
  const summaries = summariesQuery.data ?? EMPTY_SUMMARIES;
  const homeworkItems = homeworkQuery.data ?? EMPTY_HOMEWORK_ITEMS;
  const vocabularyStats = vocabularyStatsQuery.data;

  const summaryByLesson = useMemo(
    () => new Map(summaries.map((summary) => [summary.lesson, summary])),
    [summaries],
  );

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

  const nextLesson = upcomingLessons[0];
  const completedCount = completedLessons.length;
  const progressPercent = visibleLessons.length ? Math.round((completedCount / visibleLessons.length) * 100) : 0;
  const pendingHomeworkCount = homeworkItems.filter((item) => item.status !== "draft" && item.status !== "corrected").length;
  const dueReviewCount =
    (vocabularyStats?.due_today || 0) +
      (vocabularyStats?.overdue || 0) ||
    visibleLessons.reduce(
      (total, lesson) => total + getReviewPendingCount(lesson, summaryByLesson.get(lesson.id)),
      0,
    );

  const isLoading =
    lessonsQuery.isLoading ||
    summariesQuery.isLoading ||
    homeworkQuery.isLoading ||
    vocabularyStatsQuery.isLoading;

  return (
    <DashboardLayout>
      <PageHeader
        title="Meu Painel"
        description={`Bem-vindo de volta, ${name}. Entre direto no estudo com IA e acompanhe so o essencial.`}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
        <section className="relative overflow-hidden rounded-[32px] border border-sky-200/90 bg-[linear-gradient(135deg,rgba(240,249,255,0.96),rgba(236,253,245,0.96))] p-6 text-slate-900 shadow-[0_28px_70px_-45px_rgba(14,116,144,0.35)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.16),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.14),transparent_34%)]" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-800">
              <Sparkles className="h-3.5 w-3.5" />
              Estudo com IA
            </div>

            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
              Seu proximo estudo esta a um clique
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-700">
              {nextLesson
                ? `Use a IA para revisar antes de ${formatLessonDate(nextLesson.date)} ou treinar listening com situacoes reais.`
                : "Abra uma pratica guiada para revisar, conversar em ingles ou treinar listening com contexto real."}
            </p>

            <div className="mt-6 grid gap-3 lg:grid-cols-2">
              <StudyShortcutCard
                to={buildNewModePath()}
                title="Praticar com IA"
                description="Abra uma conversa guiada para revisar aula, speaking ou writing sem perder tempo."
                icon={MessageSquare}
                tone="sky"
              />
              <StudyShortcutCard
                to={APP_PATHS.interpreter}
                title="Interprete IA"
                description="Treine listening e resposta em ingles com audios, desafios e repeticao guiada."
                icon={Headphones}
                tone="emerald"
              />
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <QuickLink to={APP_PATHS.lessons} label="Ver minhas aulas" secondary />
              <QuickLink to={APP_PATHS.homework} label="Abrir homework" secondary />
            </div>
          </div>
        </section>

        <aside className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <ImportantCard
            icon={ClipboardList}
            title="Homework"
            value={pendingHomeworkCount}
            description={pendingHomeworkCount === 1 ? "atividade pendente" : "atividades pendentes"}
            tone="amber"
            href={APP_PATHS.homework}
          />
          <ImportantCard
            icon={BrainCircuit}
            title="Revisoes"
            value={dueReviewCount}
            description={dueReviewCount === 1 ? "revisao para fazer" : "revisoes para fazer"}
            tone="emerald"
            href={APP_PATHS.learnedWords}
          />
          <ImportantCard
            icon={Calendar}
            title="Aulas restantes"
            value={upcomingLessons.length}
            description={upcomingLessons.length === 1 ? "aula agendada" : "aulas agendadas"}
            tone="sky"
            href={APP_PATHS.lessons}
          />
        </aside>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="school-surface p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">Resumo rapido</p>
              <h2 className="mt-2 text-xl font-semibold text-foreground">O que olhar primeiro</h2>
            </div>
            <Link
              to={APP_PATHS.lessons}
              className="inline-flex items-center gap-2 rounded-full bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800"
            >
              Abrir trilha
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <SummaryBlock
              icon={CheckCircle2}
              label="Progresso"
              value={`${progressPercent}%`}
              note={`${completedCount} de ${visibleLessons.length || 0} aulas concluidas`}
            />
            <SummaryBlock
              icon={BookOpen}
              label="Palavras"
              value={vocabularyStats?.total_learned_words || 0}
              note="registradas no seu estudo"
            />
            <SummaryBlock
              icon={CalendarDays}
              label="Proxima aula"
              value={nextLesson ? "Agendada" : "Sem data"}
              note={nextLesson ? formatLessonDate(nextLesson.date) : "aguardando novo agendamento"}
            />
          </div>

          {isLoading ? (
            <div className="mt-5 rounded-[24px] border border-dashed border-border bg-slate-50 px-4 py-5 text-sm text-muted-foreground">
              Carregando informacoes do painel...
            </div>
          ) : null}
        </section>

        <section className="school-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">Atalhos</p>
          <div className="mt-4 space-y-3">
            <ActionLink
              to={buildNewModePath()}
              title="Praticar com IA"
              description="Entre em uma conversa guiada para revisar, speaking ou writing."
              icon={MessageSquare}
              featured
            />
            <ActionLink
              to={APP_PATHS.interpreter}
              title="Interprete IA"
              description="Treine listening com audios, contexto e respostas em ingles."
              icon={Headphones}
              featured
            />
            <ActionLink
              to={APP_PATHS.lessons}
              title="Minhas aulas"
              description="Veja sua sequencia, detalhes e proximas datas."
              icon={BookOpen}
            />
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
};

const StaffDashboard = () => {
  const { data: lessons = [] } = useQuery<StaffLesson[]>({
    queryKey: ["lessons"],
    queryFn: async () => {
      const res = await api.get("/lessons/");
      return (Array.isArray(res.data) ? res.data : res.data.results || []) as StaffLesson[];
    },
  });

  const completedCount = lessons.filter((lesson) => lesson.status === "completed").length;
  const scheduledCount = lessons.filter((lesson) => lesson.status === "scheduled" || lesson.status === "rescheduled").length;

  return (
    <DashboardLayout>
      <PageHeader
        title="Painel Geral"
        description="Acompanhe rapidamente o andamento das aulas."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <SummaryBlock
          icon={CheckCircle2}
          label="Aulas concluidas"
          value={completedCount}
          note="registradas no sistema"
        />
        <SummaryBlock
          icon={Calendar}
          label="Aulas agendadas"
          value={scheduledCount}
          note="previstas para os proximos dias"
        />
      </div>
    </DashboardLayout>
  );
};

const QuickLink = ({
  to,
  label,
  secondary,
}: {
  to: string;
  label: string;
  secondary?: boolean;
}) => (
  <Link
    to={to}
    className={cn(
      "inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold transition",
      secondary
        ? "bg-white/80 text-slate-700 ring-1 ring-sky-200 hover:bg-white"
        : "bg-sky-700 text-white shadow-sm hover:bg-sky-800",
    )}
  >
    {label}
  </Link>
);

const StudyShortcutCard = ({
  description,
  icon: Icon,
  title,
  to,
  tone,
}: {
  description: string;
  icon: LucideIcon;
  title: string;
  to: string;
  tone: "emerald" | "sky";
}) => {
  const toneClasses = {
    sky: {
      card: "border-sky-200 bg-white/78 hover:bg-white",
      icon: "bg-sky-100 text-sky-700 ring-sky-200/80",
    },
    emerald: {
      card: "border-emerald-200 bg-white/78 hover:bg-white",
      icon: "bg-emerald-100 text-emerald-700 ring-emerald-200/80",
    },
  } as const;

  return (
    <Link
      to={to}
      className={cn(
        "group rounded-[26px] border p-4 shadow-[0_20px_38px_-30px_rgba(15,23,42,0.2)] transition hover:-translate-y-0.5",
        toneClasses[tone].card,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-slate-950">{title}</p>
          <p className="mt-2 text-sm leading-6 text-slate-700">{description}</p>
        </div>
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] ring-1",
            toneClasses[tone].icon,
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>

      <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
        Comecar agora
        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
};

const ImportantCard = ({
  icon: Icon,
  title,
  value,
  description,
  href,
  tone,
}: {
  icon: typeof ClipboardList;
  title: string;
  value: number;
  description: string;
  href: string;
  tone: "amber" | "emerald" | "sky";
}) => {
  const toneClasses = {
    amber: {
      card: "border-amber-300 bg-amber-50/90 hover:bg-amber-50",
      icon: "bg-white text-amber-700 ring-amber-100",
    },
    emerald: {
      card: "border-emerald-300 bg-emerald-50/90 hover:bg-emerald-50",
      icon: "bg-white text-emerald-700 ring-emerald-100",
    },
    sky: {
      card: "border-sky-300 bg-sky-50/90 hover:bg-sky-50",
      icon: "bg-white text-sky-700 ring-sky-100",
    },
  } as const;

  return (
    <Link
      to={href}
      className={cn(
        "rounded-[26px] border p-5 shadow-[0_18px_36px_-28px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5",
        toneClasses[tone].card,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-700">{title}</span>
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-2xl ring-1",
            toneClasses[tone].icon,
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </div>
      </div>
      <p className="mt-3 text-3xl font-bold text-foreground">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </Link>
  );
};

const SummaryBlock = ({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: number | string;
  note: string;
}) => (
  <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_14px_30px_-28px_rgba(15,23,42,0.22)]">
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-slate-600">{label}</span>
      <Icon className="h-4 w-4 text-sky-700" />
    </div>
    <p className="mt-3 text-2xl font-bold text-foreground">{value}</p>
    <p className="mt-1 text-sm text-muted-foreground">{note}</p>
  </div>
);

const ActionLink = ({
  featured,
  icon: Icon,
  to,
  title,
  description,
}: {
  featured?: boolean;
  icon?: LucideIcon;
  to: string;
  title: string;
  description: string;
}) => (
  <Link
    to={to}
    className={cn(
      "group flex items-center justify-between gap-4 rounded-[22px] border px-4 py-3 shadow-[0_12px_28px_-28px_rgba(15,23,42,0.24)] transition",
      featured
        ? "border-sky-200/80 bg-[linear-gradient(135deg,rgba(240,249,255,0.98),rgba(236,253,245,0.98))] hover:-translate-y-0.5 hover:bg-white"
        : "border-slate-200 bg-white hover:bg-slate-50",
    )}
  >
    <div className="flex min-w-0 items-start gap-3">
      {Icon ? (
        <span
          className={cn(
            "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ring-1",
            featured ? "bg-sky-100 text-sky-700 ring-sky-200/70" : "bg-slate-100 text-slate-600 ring-slate-200",
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
      ) : null}
      <div className="min-w-0">
        <p className="font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
    <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5" />
  </Link>
);

export default Dashboard;
