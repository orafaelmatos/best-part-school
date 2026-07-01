import { Link } from "react-router-dom";
import {
  BookOpenCheck,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Download,
  FileImage,
  FileText,
  Image as ImageIcon,
  NotebookPen,
  Play,
  Sparkles,
  Video,
} from "lucide-react";

import { FlashcardEditor } from "@/components/FlashcardEditor";
import { HomeworkPanel } from "@/components/HomeworkPanel";
import LessonSummarySection from "@/components/LessonSummarySection";
import PastLessonSummary from "@/components/PastLessonSummary";
import StatusBadge from "@/components/StatusBadge";
import { useAuth } from "@/contexts/AuthContext";
import { APP_PATHS } from "@/lib/routes";
import { cn } from "@/lib/utils";
import {
  LessonHistoryHomework,
  LessonHistoryLesson,
  LessonHistorySummary,
  formatLessonDate,
  formatLessonDateShort,
  getOpenHomeworkCount,
  getPendingHomeworkCount,
  getReviewPendingCount,
  getSummaryPreview,
  stripHtml,
} from "@/lib/studentLessonHistory";

type LessonExperienceCardProps = {
  lesson: LessonHistoryLesson;
  summary?: LessonHistorySummary | null;
  homeworkItems?: LessonHistoryHomework[];
  expanded: boolean;
  onToggle: () => void;
  onRefreshLessons: () => void;
  onRefreshHomework?: () => void;
  onRefreshSummaries?: () => void;
  onRequestReschedule?: (lesson: LessonHistoryLesson) => void;
  showStudentName?: boolean;
};

const surfaceByStatus: Record<string, string> = {
  completed: "border-emerald-200/70 bg-[linear-gradient(135deg,rgba(236,253,245,0.95),rgba(255,255,255,0.98))]",
  scheduled: "border-sky-200/70 bg-[linear-gradient(135deg,rgba(239,246,255,0.95),rgba(255,255,255,0.98))]",
  rescheduled: "border-amber-200/70 bg-[linear-gradient(135deg,rgba(255,251,235,0.95),rgba(255,255,255,0.98))]",
  in_progress: "border-blue-200/70 bg-[linear-gradient(135deg,rgba(239,246,255,0.95),rgba(219,234,254,0.7))]",
  canceled: "border-rose-200/70 bg-[linear-gradient(135deg,rgba(255,241,242,0.95),rgba(255,255,255,0.98))]",
  missed: "border-slate-200/70 bg-[linear-gradient(135deg,rgba(248,250,252,0.95),rgba(255,255,255,0.98))]",
};

const indicatorStyles: Record<string, string> = {
  words: "bg-emerald-50 text-emerald-700",
  homework: "bg-amber-50 text-amber-700",
  review: "bg-sky-50 text-sky-700",
  summary: "bg-violet-50 text-violet-700",
  attachments: "bg-slate-100 text-slate-700",
};

const LessonExperienceCard = ({
  lesson,
  summary,
  homeworkItems = [],
  expanded,
  onToggle,
  onRefreshLessons,
  onRefreshHomework,
  onRefreshSummaries,
  onRequestReschedule,
  showStudentName,
}: LessonExperienceCardProps) => {
  const { user } = useAuth();
  const isTeacher = user?.role === "teacher" || user?.role === "admin";

  const wordsCount = lesson.new_words?.length || summary?.words.length || 0;
  const attachmentsCount = lesson.attachments?.length || 0;
  const openHomeworkCount = getOpenHomeworkCount(homeworkItems);
  const pendingHomeworkCount = getPendingHomeworkCount(homeworkItems);
  const reviewPendingCount = getReviewPendingCount(lesson, summary);
  const summaryPreview = getSummaryPreview(summary);
  const notesPreview = stripHtml(lesson.notes);
  const canReschedule =
    isTeacher &&
    !!onRequestReschedule &&
    ["scheduled", "rescheduled"].includes(lesson.status) &&
    !!lesson.date &&
    new Date(lesson.date).getTime() > Date.now();

  const indicators = [
    wordsCount > 0 ? { key: "words", label: `+${wordsCount} palavra${wordsCount > 1 ? "s" : ""}` } : null,
    openHomeworkCount > 0 ? { key: "homework", label: `${openHomeworkCount} tarefa${openHomeworkCount > 1 ? "s" : ""}` } : null,
    reviewPendingCount > 0 ? { key: "review", label: `${reviewPendingCount} revisa${reviewPendingCount > 1 ? "oes" : "o"}` } : null,
    summaryPreview ? { key: "summary", label: "Resumo pronto" } : null,
    attachmentsCount > 0 ? { key: "attachments", label: `${attachmentsCount} anexo${attachmentsCount > 1 ? "s" : ""}` } : null,
  ].filter(Boolean) as { key: keyof typeof indicatorStyles; label: string }[];

  return (
    <article className={cn("overflow-hidden rounded-[26px] border shadow-[0_16px_50px_-30px_rgba(15,23,42,0.35)]", surfaceByStatus[lesson.status] || "border-border bg-card")}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-5 py-5 text-left sm:px-6"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-4">
            <div className="flex h-16 w-16 flex-shrink-0 flex-col items-center justify-center rounded-2xl bg-background/80 text-center shadow-sm ring-1 ring-black/5">
              <span className="text-lg font-semibold text-foreground">
                {lesson.date ? new Date(lesson.date).toLocaleDateString("pt-BR", { day: "2-digit" }) : "--"}
              </span>
              <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {formatLessonDateShort(lesson.date).replace(/^\d{2}\s/, "")}
              </span>
            </div>

            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {typeof lesson.order === "number" && lesson.order > 0 && (
                  <span className="rounded-full bg-background/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Aula {lesson.order}
                  </span>
                )}
                <StatusBadge status={lesson.status as any} />
                {pendingHomeworkCount > 0 && (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800">
                    Homework pendente
                  </span>
                )}
              </div>

              <div>
                <h3 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">{lesson.title}</h3>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                  <span>{formatLessonDate(lesson.date)}</span>
                  {lesson.level && <span>Nível {lesson.level}</span>}
                  {showStudentName && lesson.student_name && <span>{lesson.student_name}</span>}
                  {!showStudentName && lesson.teacher_name && user?.role === "student" && <span>{lesson.teacher_name}</span>}
                </div>
              </div>

              {indicators.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {indicators.map((indicator) => (
                    <span
                      key={`${lesson.id}-${indicator.key}`}
                      className={cn("rounded-full px-3 py-1 text-xs font-medium", indicatorStyles[indicator.key])}
                    >
                      {indicator.label}
                    </span>
                  ))}
                </div>
              )}

              <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
                {summaryPreview || notesPreview || "Esta aula ainda não possui resumo ou anotações registradas."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="hidden sm:inline">{expanded ? "Recolher" : "Expandir"}</span>
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/70 bg-background/70 px-5 py-5 sm:px-6">
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              {isTeacher && lesson.student && <PastLessonSummary currentLesson={lesson as any} compact buttonVariant="ghost" />}
              {lesson.meeting_url && (
                <a
                  href={lesson.meeting_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-100 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-200"
                >
                  <Video size={16} /> Entrar na aula
                </a>
              )}
              {lesson.recording_url && (
                <a
                  href={lesson.recording_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
                >
                  <Play size={16} /> Ver gravação
                </a>
              )}
              {canReschedule && (
                <button
                  type="button"
                  onClick={() => onRequestReschedule?.(lesson)}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/20"
                >
                  <CalendarClock size={16} /> Reagendar
                </button>
              )}
              {isTeacher && (
                <Link
                  to={APP_PATHS.annotateLesson(lesson.id)}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent"
                >
                  <NotebookPen size={16} /> Abrir editor completo
                </Link>
              )}
            </div>

            <LessonSummarySection
              lesson={lesson}
              notes={lesson.notes || ""}
              onUpdated={onRefreshSummaries}
            />

            {lesson.notes && (
              <section className="rounded-2xl border border-border bg-card p-5">
                <div className="mb-3 flex items-center gap-2">
                  <BookOpenCheck className="h-4 w-4 text-primary" />
                  <h4 className="font-semibold text-card-foreground">Anotações da aula</h4>
                </div>
                <div
                  className="prose prose-sm max-w-none text-card-foreground"
                  dangerouslySetInnerHTML={{ __html: lesson.notes }}
                />
              </section>
            )}

            <FlashcardEditor lesson={lesson} refetch={onRefreshLessons} />

            {lesson.attachments && lesson.attachments.length > 0 && (
              <section className="rounded-2xl border border-border bg-card p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h4 className="font-semibold text-card-foreground">Materiais e anexos</h4>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {lesson.attachments.map((attachment) => (
                    <a
                      key={attachment.id}
                      href={attachment.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="overflow-hidden rounded-2xl border border-border bg-background transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      {attachment.is_image ? (
                        <>
                          <img
                            src={attachment.file_url}
                            alt={attachment.file_name || "Imagem anexada"}
                            className="h-40 w-full object-cover"
                          />
                          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">{attachment.file_name || "Imagem da aula"}</p>
                              <p className="text-xs text-muted-foreground">Imagem de apoio</p>
                            </div>
                            <ImageIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                          </div>
                        </>
                      ) : (
                        <div className="flex h-full min-h-[112px] items-center gap-3 px-4 py-4">
                          <div className="rounded-2xl bg-muted p-3">
                            {attachment.mime_type?.startsWith("image/") ? <FileImage className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">{attachment.file_name || "Arquivo anexado"}</p>
                            <p className="text-xs text-muted-foreground">Abrir ou baixar material</p>
                          </div>
                          <Download className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        </div>
                      )}
                    </a>
                  ))}
                </div>
              </section>
            )}

            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4 flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" />
                <h4 className="font-semibold text-card-foreground">Homework e tarefas</h4>
              </div>
              <HomeworkPanel lesson={lesson} onUpdated={onRefreshHomework} />
            </section>
          </div>
        </div>
      )}
    </article>
  );
};

export default LessonExperienceCard;
