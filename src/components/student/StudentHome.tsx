import { APP_TARGET } from "@/apps/target";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowRight, BookOpen, CalendarDays, Check, ClipboardList, CreditCard, Gamepad2,
  Headphones, NotebookPen, RefreshCw, ShoppingBag, Sparkles,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { buildNewModePath } from "@/lib/aiStudy";
import { fetchAllPages } from "@/lib/fetchAllPages";
import { APP_PATHS } from "@/lib/routes";
import { cn } from "@/lib/utils";
import {
  getLessonDateValue, getReviewPendingCount, isActiveTrailLesson,
  isCompletedLesson, isUpcomingLesson, sortLessonsByDateAsc,
  type LessonHistoryHomework, type LessonHistoryLesson, type LessonHistorySummary,
} from "@/lib/studentLessonHistory";
import {
  Alert, Button, Card, EmptyState, IconTile, ListGroup, ListItem, ProgressBar,
  SectionHeader, Skeleton, cardVariants, type Tone,
} from "@/components/student/ui";
import type { LucideIcon } from "lucide-react";

type VocabularyStats = { due_today: number; overdue: number; total_learned_words: number };
type StudentHomework = Omit<LessonHistoryHomework, "status"> & {
  status: LessonHistoryHomework["status"] | "in_progress";
};
const EMPTY_LESSONS: LessonHistoryLesson[] = [];
const EMPTY_HOMEWORK: StudentHomework[] = [];
const EMPTY_SUMMARIES: LessonHistorySummary[] = [];
const DAY = 24 * 60 * 60 * 1000;

function validDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dueDateLabel(value?: string | null) {
  const date = validDate(value);
  return date ? `Entrega até ${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}` : "Atividade sem prazo definido";
}

function todayLabel() {
  const label = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  return label.charAt(0).toUpperCase() + label.slice(1);
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
  const queries = [lessonsQuery, summariesQuery, homeworkQuery, vocabularyQuery];
  const hasError = queries.some((query) => query.isError);
  const isRetrying = queries.some((query) => query.isFetching);
  const isPriorityLoading = lessonsQuery.isLoading || homeworkQuery.isLoading;

  const priorityTitle = nextHomework ? "Seu homework espera por você" : nextLesson ? "Prepare-se para a próxima aula" : "Um pouco de prática faz a diferença";

  return (
    <div className="space-y-8 pb-2">
      <header>
        <p className="text-body text-ink-secondary">{todayLabel()}</p>
        <h1 className="mt-1 text-h1 text-ink">Olá, {name}!</h1>
        <p className="mt-1 text-body-lg text-ink-secondary">Que bom ter você por aqui. Vamos continuar?</p>
      </header>

      {hasError && (
        <Alert
          role="alert"
          tone="warning"
          title="Algumas informações não carregaram."
          action={(
            <Button
              variant="outline"
              size="sm"
              loading={isRetrying}
              loadingLabel="Atualizando…"
              onClick={() => { queries.filter((query) => query.isError).forEach((query) => { void query.refetch(); }); }}
            >
              <RefreshCw aria-hidden="true" />Tentar novamente
            </Button>
          )}
        >
          Você pode acessar suas áreas e tentar novamente.
        </Alert>
      )}

      {isPriorityLoading ? <HomeLoading /> : (
        <section aria-labelledby="next-step-title" className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-deep to-primary-dark p-5 text-primary-foreground shadow-raised">
          <p className="flex items-center gap-2 text-label text-primary-soft">
            <Sparkles size={16} aria-hidden="true" />Seu próximo passo
            {user?.level && <span className="ml-auto rounded-full bg-surface/10 px-2.5 py-0.5 text-primary-foreground">Nível {user.level}</span>}
          </p>
          <h2 id="next-step-title" className="mt-3 max-w-md text-h3">{priorityTitle}</h2>
          <p className="mt-1 text-body-lg text-primary-light">
            {nextHomework ? nextHomework.title : nextLesson ? nextLesson.title : "Converse em inglês com a IA e coloque o que você aprendeu em prática."}
          </p>
          {nextHomework && <p className="mt-1 text-caption text-primary-soft">{dueDateLabel(nextHomework.due_date)}</p>}
          <Button asChild variant="onDark" className="mt-5">
            <Link to={nextHomework ? APP_PATHS.homework : nextLesson ? APP_PATHS.lessons : buildNewModePath()}>
              {nextHomework ? "Continuar homework" : nextLesson ? "Ver minha aula" : "Praticar com IA"}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          {pendingHomework.length > 1 && <p className="mt-3 text-caption text-primary-soft">{pendingHomework.length} atividades para continuar</p>}
        </section>
      )}

      <section aria-labelledby="shortcuts-title">
        <h2 id="shortcuts-title" className="sr-only">Acessos rápidos</h2>
        <div className="grid grid-cols-2 gap-3">
          <Shortcut to={APP_PATHS.lessons} icon={NotebookPen} title="Anotações" description="Revise suas aulas" />
          <Shortcut to={buildNewModePath()} icon={Sparkles} tone="ai" title="Praticar com IA" description="Converse e escreva" />
          <Shortcut to={APP_PATHS.learnedWords} icon={BookOpen} title="Vocabulário" description={reviewCount === undefined ? "Seu vocabulário" : reviewCount > 0 ? `${reviewCount} para revisar` : "Revisão em dia"} />
          <Shortcut to={APP_PATHS.homework} icon={ClipboardList} title="Atividades" description={homeworkQuery.data ? pendingHomework.length > 0 ? `${pendingHomework.length} para continuar` : "Tudo entregue" : "Suas tarefas"} />
        </div>
      </section>

      <section aria-labelledby="next-lesson-title">
        <SectionHeader id="next-lesson-title" title="Próxima aula" actionTo={APP_PATHS.lessons} actionLabel="Ver todas" />
        {lessonsQuery.isLoading ? (
          <Card role="status" aria-label="Buscando sua próxima aula" className="space-y-3">
            <Skeleton className="h-4 w-1/3" /><Skeleton className="h-5 w-3/4" />
          </Card>
        ) : nextLesson ? <NextLessonCard lesson={nextLesson} /> : (
          <Card padding="none">
            <EmptyState
              compact
              icon={CalendarDays}
              title={lessonsQuery.isError ? "Sua agenda está indisponível" : "Sua próxima aula aparece aqui"}
              description={lessonsQuery.isError ? "Tente atualizar para consultar suas aulas." : "Assim que uma aula for agendada, você verá os detalhes por aqui."}
            />
          </Card>
        )}
      </section>

      <section aria-labelledby="progress-title">
        <SectionHeader id="progress-title" title="Sua jornada" />
        <Card>
          <dl className="grid grid-cols-2 gap-4">
            <Stat icon={Check} label="Aulas concluídas" value={lessonsQuery.data ? completedCount : "—"} />
            <Stat icon={BookOpen} label="Palavras aprendidas" value={vocabularyQuery.data ? vocabularyQuery.data.total_learned_words : "—"} />
          </dl>
          {lessonsQuery.data && trailLessons.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <div className="mb-2 flex items-center justify-between gap-3 text-caption">
                <span className="text-ink-secondary">{completedCount} de {trailLessons.length} aulas da sua trilha</span>
                <span className="font-semibold text-primary">{Math.round(completedCount / trailLessons.length * 100)}%</span>
              </div>
              <ProgressBar value={completedCount} max={trailLessons.length} label="Aulas concluídas na trilha" />
            </div>
          )}
        </Card>
      </section>

      <section aria-labelledby="continue-title">
        <SectionHeader id="continue-title" title="Continue estudando" />
        <ListGroup>
          {pendingHomework.slice(0, 3).map((item) => (
            <ListItem
              key={item.id}
              to={APP_PATHS.homework}
              leading={<IconTile icon={ClipboardList} tone={isDueSoon(item.due_date) ? "warning" : "primary"} />}
              meta="Atividade"
              title={item.title}
              description={dueDateLabel(item.due_date)}
            />
          ))}
          <ListItem to={APP_PATHS.interpreter} leading={<IconTile icon={Headphones} tone="ai" />} title="Listening" description="Ouça e compreenda situações reais" />
          <ListItem to={APP_PATHS.vocabularyGame} leading={<IconTile icon={Gamepad2} />} title="Jogo de palavras" description="Pratique o vocabulário das aulas" />
          <ListItem to={APP_PATHS.calendar} leading={<IconTile icon={CalendarDays} />} title="Minha agenda" description="Veja todas as suas aulas" />
        </ListGroup>
      </section>

      {APP_TARGET !== "student" && (
        <div className="grid grid-cols-2 gap-3">
          <Button asChild variant="ghost"><Link to={APP_PATHS.finance}><CreditCard aria-hidden="true" />Financeiro</Link></Button>
          <Button asChild variant="ghost"><Link to={APP_PATHS.marketplace}><ShoppingBag aria-hidden="true" />Loja de cursos</Link></Button>
        </div>
      )}
    </div>
  );
};

function isDueSoon(value?: string | null) {
  const date = validDate(value);
  return Boolean(date && date.getTime() - Date.now() < 2 * DAY);
}

const Shortcut = ({ to, icon, title, description, tone = "primary" }: { to: string; icon: LucideIcon; title: string; description: string; tone?: Tone }) => (
  <Link to={to} className={cn(cardVariants({ interactive: true, padding: "md" }), "min-h-28")}>
    <IconTile icon={icon} tone={tone} />
    <h3 className="mt-3 text-body font-semibold text-ink">{title}</h3>
    <p className="mt-0.5 text-caption text-ink-secondary">{description}</p>
  </Link>
);

const Stat = ({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number | string }) => (
  <div>
    <dt className="flex items-center gap-1.5 text-caption text-ink-secondary"><Icon size={16} className="text-primary" aria-hidden="true" />{label}</dt>
    <dd className="mt-1 text-h2 text-ink">{value}</dd>
  </div>
);

const NextLessonCard = ({ lesson }: { lesson: LessonHistoryLesson }) => {
  const date = validDate(lesson.date);
  return (
    <Link to={APP_PATHS.lessons} className={cardVariants({ interactive: true })}>
      <div className="flex items-start gap-4">
        <div className="flex h-16 w-14 shrink-0 flex-col items-center justify-center rounded-md bg-primary-subtle text-primary-dark">
          {date ? (
            <>
              <span className="text-h3 leading-none">{date.getDate()}</span>
              <span className="mt-1 text-label uppercase">{date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</span>
            </>
          ) : <CalendarDays size={24} aria-hidden="true" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-caption font-medium text-primary">
            {lesson.status === "in_progress" ? "Aula em andamento" : date ? date.toLocaleDateString("pt-BR", { weekday: "long" }) : "Aguardando agendamento"}
            {date && ` · ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
          </p>
          <h3 className="mt-0.5 text-h4 text-ink">{lesson.title}</h3>
          {lesson.teacher_name && <p className="mt-0.5 text-body text-ink-secondary">Com {lesson.teacher_name}</p>}
        </div>
      </div>
      <div className="mt-4 flex min-h-8 items-center justify-between border-t border-line pt-3 text-body font-semibold text-primary">
        Ver aula e materiais<ArrowRight size={20} aria-hidden="true" />
      </div>
    </Link>
  );
};

const HomeLoading = () => (
  <div role="status" aria-label="Carregando seu próximo passo" className="space-y-4 rounded-xl border border-line bg-surface p-5">
    <span className="sr-only">Carregando seu próximo passo…</span>
    <Skeleton className="h-3 w-32" />
    <Skeleton className="h-7 w-4/5" />
    <Skeleton className="h-4 w-3/5" />
    <Skeleton className="h-12 w-48 rounded-lg" />
  </div>
);

export default StudentHome;
