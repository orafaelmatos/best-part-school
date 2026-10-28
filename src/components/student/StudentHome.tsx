import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowRight, BookOpen, CalendarDays, Check, ChevronRight, ClipboardList,
  CreditCard, Gamepad2, Headphones, MessageCircle, RefreshCw, ShoppingBag,
  Sparkles, type LucideIcon,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { buildNewModePath } from "@/lib/aiStudy";
import { fetchAllPages } from "@/lib/fetchAllPages";
import { APP_PATHS } from "@/lib/routes";
import {
  getLessonDateValue, getReviewPendingCount, isActiveTrailLesson,
  isCompletedLesson, isUpcomingLesson, sortLessonsByDateAsc,
  type LessonHistoryHomework, type LessonHistoryLesson, type LessonHistorySummary,
} from "@/lib/studentLessonHistory";

type VocabularyStats = { due_today: number; overdue: number; total_learned_words: number };
type StudentHomework = Omit<LessonHistoryHomework, "status"> & {
  status: LessonHistoryHomework["status"] | "in_progress";
};
const EMPTY_LESSONS: LessonHistoryLesson[] = [];
const EMPTY_HOMEWORK: StudentHomework[] = [];
const EMPTY_SUMMARIES: LessonHistorySummary[] = [];
const touchLink = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#137c78] focus-visible:ring-offset-2";
const surface = "rounded-3xl border border-slate-200/80 bg-white shadow-[0_4px_20px_-12px_rgba(20,36,58,0.16)]";

function validDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dueDateLabel(value?: string | null) {
  const date = validDate(value);
  return date ? `Entrega até ${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}` : "Atividade sem prazo definido";
}

const StudentHome = () => {
  const { user } = useAuth();
  const studentId = user?.user_id || "";
  const name = user?.name?.trim().split(/\s+/)[0] || user?.email?.split("@")[0] || "aluno";

  const lessonsQuery = useQuery({
    queryKey: ["dashboard-student-lessons", studentId],
    queryFn: async () => {
      const response = await api.get("/lessons/", { params: { all: true, is_template: false } });
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
    queryFn: () => fetchAllPages<StudentHomework>("/homework/", { student: studentId, ordering: "due_date" }),
    enabled: !!studentId,
  });
  const vocabularyQuery = useQuery({
    queryKey: ["dashboard-student-vocabulary", studentId],
    queryFn: async () => (await api.get("/vocabulary-cards/dashboard/")).data as VocabularyStats,
    enabled: !!studentId,
  });

  const lessons = lessonsQuery.data ?? EMPTY_LESSONS;
  const trailLessons = lessons.filter(isActiveTrailLesson);
  const completedCount = trailLessons.filter(isCompletedLesson).length;
  const upcomingLessons = sortLessonsByDateAsc(trailLessons.filter((lesson) =>
    isUpcomingLesson(lesson) && (lesson.status === "in_progress" || !validDate(lesson.date) || getLessonDateValue(lesson.date) >= Date.now()),
  ));
  const nextLesson = upcomingLessons.find((lesson) => lesson.status === "in_progress") || upcomingLessons[0];
  const pendingHomework = (homeworkQuery.data ?? EMPTY_HOMEWORK)
    .filter((item) => item.status === "pending" || item.status === "in_progress")
    .sort((left, right) => getLessonDateValue(left.due_date) - getLessonDateValue(right.due_date));
  const nextHomework = pendingHomework[0];
  const summaryByLesson = new Map((summariesQuery.data ?? EMPTY_SUMMARIES).map((summary) => [summary.lesson, summary]));
  const reviewCount = vocabularyQuery.data
    ? vocabularyQuery.data.due_today + vocabularyQuery.data.overdue
    : lessonsQuery.data && summariesQuery.data
      ? trailLessons.reduce((total, lesson) => total + getReviewPendingCount(lesson, summaryByLesson.get(lesson.id)), 0)
      : undefined;
  const progressPercent = trailLessons.length ? Math.round(completedCount / trailLessons.length * 100) : 0;
  const queries = [lessonsQuery, summariesQuery, homeworkQuery, vocabularyQuery];
  const hasError = queries.some((query) => query.isError);
  const isRetrying = queries.some((query) => query.isFetching);
  const isPriorityLoading = lessonsQuery.isLoading || homeworkQuery.isLoading;

  return (
    <div className="space-y-7 pb-2 text-[#14243a]">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#137c78]">Seu inglês, todo dia</p>
        <h1 className="mt-2 text-[1.875rem] font-bold leading-tight tracking-tight">Olá, {name}!</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Que bom ter você por aqui. Vamos continuar?</p>
      </header>

      {hasError && (
        <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-950">Algumas informações não carregaram.</p>
          <p className="mt-1 text-sm leading-5 text-amber-900">Você pode acessar suas áreas e tentar novamente.</p>
          <button
            type="button"
            disabled={isRetrying}
            onClick={() => { queries.filter((query) => query.isError).forEach((query) => { void query.refetch(); }); }}
            className={`mt-1 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-amber-950 disabled:opacity-60 ${touchLink}`}
          >
            <RefreshCw className={`h-4 w-4 ${isRetrying ? "animate-spin" : ""}`} aria-hidden="true" />
            {isRetrying ? "Atualizando…" : "Tentar novamente"}
          </button>
        </div>
      )}

      {isPriorityLoading ? <HomeLoading /> : (
        <section aria-labelledby="next-step-title" className="relative overflow-hidden rounded-3xl bg-[#14243a] p-5 text-white sm:p-6">
          <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-teal-200">
            <Sparkles className="h-4 w-4" aria-hidden="true" />Seu próximo passo
          </div>
          <h2 id="next-step-title" className="max-w-md text-2xl font-semibold leading-tight tracking-tight">
            {nextHomework ? "Seu homework espera por você" : nextLesson ? "Prepare-se para a próxima aula" : "Um pouco de prática faz a diferença"}
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-200">
            {nextHomework ? nextHomework.title : nextLesson ? nextLesson.title : "Converse em inglês com a IA e coloque o que você aprendeu em prática."}
          </p>
          {nextHomework && <p className="mt-1 text-xs leading-5 text-slate-300">{dueDateLabel(nextHomework.due_date)}</p>}
          <Link
            to={nextHomework ? APP_PATHS.homework : nextLesson ? APP_PATHS.lessons : buildNewModePath()}
            className={`mt-5 inline-flex min-h-12 items-center justify-center gap-3 rounded-2xl bg-[#b9eee1] px-5 py-3 text-sm font-bold text-[#14243a] transition hover:bg-[#d3f5ec] active:scale-[0.98] ${touchLink}`}
          >
            {nextHomework ? "Continuar homework" : nextLesson ? "Ver minha aula" : "Praticar com IA"}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          {pendingHomework.length > 1 && <p className="mt-3 text-xs text-slate-300">{pendingHomework.length} atividades para continuar</p>}
        </section>
      )}

      <section aria-labelledby="next-lesson-title">
        <SectionHeading id="next-lesson-title" title="Próxima aula" to={APP_PATHS.lessons} linkLabel="Ver todas" />
        {lessonsQuery.isLoading ? (
          <div className={`${surface} p-5 text-sm text-slate-500`} role="status">Buscando sua próxima aula…</div>
        ) : nextLesson ? <NextLessonCard lesson={nextLesson} /> : (
          <div className={`${surface} flex items-start gap-3 p-5`}>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f1f5f4] text-[#137c78]"><CalendarDays className="h-5 w-5" aria-hidden="true" /></span>
            <div>
              <p className="text-sm font-semibold">{lessonsQuery.isError ? "Sua agenda está indisponível" : "Sua próxima aula aparece aqui"}</p>
              <p className="mt-1 text-sm leading-5 text-slate-500">{lessonsQuery.isError ? "Tente atualizar para consultar suas aulas." : "Assim que uma aula for agendada, você verá os detalhes por aqui."}</p>
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="study-title">
        <SectionHeading id="study-title" title="Continue aprendendo" />
        <div className="grid grid-cols-2 gap-3">
          <StudyShortcut to={APP_PATHS.learnedWords} icon={BookOpen} title="Revisar palavras" description={reviewCount === undefined ? "Seu vocabulário" : reviewCount > 0 ? `${reviewCount} para revisar` : "Revisão em dia"} />
          <StudyShortcut to={buildNewModePath()} icon={MessageCircle} title="Conversar com IA" description="Pratique seu inglês" />
          <StudyShortcut to={APP_PATHS.homework} icon={ClipboardList} title="Homework" description={homeworkQuery.data ? pendingHomework.length > 0 ? `${pendingHomework.length} para continuar` : "Veja suas atividades" : "Suas atividades"} />
          <StudyShortcut to={APP_PATHS.interpreter} icon={Headphones} title="Listening" description="Ouça e compreenda" />
          <StudyShortcut to={APP_PATHS.vocabularyGame} icon={Gamepad2} title="Jogo de palavras" description="Aprenda jogando" />
          <StudyShortcut to={APP_PATHS.calendar} icon={CalendarDays} title="Minha agenda" description="Organize suas aulas" />
        </div>
      </section>

      <section aria-labelledby="progress-title">
        <SectionHeading id="progress-title" title="Sua jornada" />
        <div className={`${surface} p-5`}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500"><Check className="h-3.5 w-3.5 text-[#137c78]" aria-hidden="true" />Aulas concluídas</span>
              <p className="mt-2 text-3xl font-bold tracking-tight">{lessonsQuery.data ? completedCount : "—"}</p>
            </div>
            <div className="border-l border-slate-100 pl-4">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500"><BookOpen className="h-3.5 w-3.5 text-[#137c78]" aria-hidden="true" />Palavras aprendidas</span>
              <p className="mt-2 text-3xl font-bold tracking-tight">{vocabularyQuery.data ? vocabularyQuery.data.total_learned_words : "—"}</p>
            </div>
          </div>
          {lessonsQuery.data && trailLessons.length > 0 && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between gap-3 text-xs"><span className="text-slate-500">{completedCount} de {trailLessons.length} aulas da sua trilha</span><span className="font-semibold text-[#137c78]">{progressPercent}%</span></div>
              <div role="progressbar" aria-label="Aulas concluídas na trilha" aria-valuemin={0} aria-valuemax={trailLessons.length} aria-valuenow={completedCount} className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-[#137c78]" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 border-t border-slate-200/80 pt-3">
        <Link to={APP_PATHS.finance} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl text-sm font-medium text-slate-600 transition hover:bg-white ${touchLink}`}><CreditCard className="h-4 w-4" aria-hidden="true" />Financeiro</Link>
        <Link to={APP_PATHS.marketplace} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl text-sm font-medium text-slate-600 transition hover:bg-white ${touchLink}`}><ShoppingBag className="h-4 w-4" aria-hidden="true" />Loja de cursos</Link>
      </div>
    </div>
  );
};

const SectionHeading = ({ id, title, to, linkLabel }: { id: string; title: string; to?: string; linkLabel?: string }) => (
  <div className="mb-3 flex min-h-9 items-center justify-between gap-3">
    <h2 id={id} className="text-lg font-bold tracking-tight">{title}</h2>
    {to && <Link to={to} className={`inline-flex min-h-11 items-center gap-0.5 rounded-lg text-xs font-semibold text-[#137c78] ${touchLink}`}>{linkLabel}<ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>}
  </div>
);

const NextLessonCard = ({ lesson }: { lesson: LessonHistoryLesson }) => {
  const date = validDate(lesson.date);
  return (
    <Link to={APP_PATHS.lessons} className={`${surface} block p-5 transition hover:border-[#137c78]/40 active:bg-slate-50 ${touchLink}`}>
      <div className="flex items-start gap-4">
        <div className="flex h-[70px] w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-[#eef5f3] text-[#137c78]">
          {date ? <><span className="text-2xl font-bold leading-7">{date.getDate()}</span><span className="mt-0.5 text-xs font-semibold uppercase">{date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</span></> : <CalendarDays className="h-6 w-6" aria-hidden="true" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-medium text-[#137c78]">{lesson.status === "in_progress" ? "Aula em andamento" : date ? date.toLocaleDateString("pt-BR", { weekday: "long" }) : "Aguardando agendamento"}{date && ` · ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}</p>
          <h3 className="text-base font-semibold leading-6">{lesson.title}</h3>
          {lesson.teacher_name && <p className="mt-1 text-xs leading-5 text-slate-500">Com {lesson.teacher_name}</p>}
        </div>
      </div>
      <div className="mt-4 flex min-h-8 items-center justify-between border-t border-slate-100 pt-3 text-sm font-semibold text-[#137c78]">Ver aula e materiais<ArrowRight className="h-4 w-4" aria-hidden="true" /></div>
    </Link>
  );
};

const StudyShortcut = ({ to, icon: Icon, title, description }: { to: string; icon: LucideIcon; title: string; description: string }) => (
  <Link to={to} className={`${surface} min-h-32 p-4 transition hover:border-[#137c78]/40 active:bg-slate-50 ${touchLink}`}>
    <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef5f3] text-[#137c78]"><Icon className="h-5 w-5" aria-hidden="true" /></span>
    <h3 className="text-sm font-semibold leading-5">{title}</h3>
    <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
  </Link>
);

const HomeLoading = () => (
  <div role="status" aria-label="Carregando seu próximo passo" className={`${surface} space-y-4 p-6`}>
    <span className="sr-only">Carregando seu próximo passo…</span>
    <div className="h-3 w-32 rounded-full bg-slate-100 motion-safe:animate-pulse" />
    <div className="h-7 w-4/5 rounded-lg bg-slate-100 motion-safe:animate-pulse" />
    <div className="h-4 w-3/5 rounded-lg bg-slate-100 motion-safe:animate-pulse" />
    <div className="h-12 w-48 rounded-2xl bg-slate-100 motion-safe:animate-pulse" />
  </div>
);

export default StudentHome;
