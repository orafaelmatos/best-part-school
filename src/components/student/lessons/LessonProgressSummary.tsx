import { Video } from "lucide-react";

import { Button, Card, CircularProgress } from "@/components/student/ui";
import type { LessonHistoryLesson } from "@/lib/studentLessonHistory";

import { formatLessonLongDate, formatLessonTimeRange } from "./lessonDisplay";

/** Course progress and the next lesson, in one card. The shell header already names the screen. */
export function LessonProgressSummary({ completedCount, totalCount, upcomingCount, nextLesson }: {
  completedCount: number;
  totalCount: number;
  upcomingCount: number;
  nextLesson?: LessonHistoryLesson;
}) {
  const upcomingText =
    upcomingCount === 0 ? "Nenhuma aula agendada" : upcomingCount === 1 ? "1 próxima aula" : `${upcomingCount} próximas aulas`;

  return (
    <Card as="section" aria-labelledby="lessons-progress-title">
      <div className="flex items-center gap-4">
        <CircularProgress value={completedCount} max={totalCount} label="Aulas concluídas na trilha" size={72} />
        <div className="min-w-0">
          <h2 id="lessons-progress-title" className="text-h4 text-ink">Sua trilha</h2>
          <p className="mt-0.5 text-body text-ink-secondary">
            {completedCount} de {totalCount} {totalCount === 1 ? "aula concluída" : "aulas concluídas"}
          </p>
          <p className="text-body text-ink-secondary">{upcomingText}</p>
        </div>
      </div>

      {nextLesson ? (
        <div className="mt-5 border-t border-line pt-5">
          <p className="text-caption text-ink-muted">Próxima aula</p>
          <p className="mt-1 break-words text-h3 text-ink">{nextLesson.title}</p>
          <p className="mt-1 text-body text-ink-secondary">
            {formatLessonLongDate(nextLesson.date)}
            {nextLesson.date ? ` · ${formatLessonTimeRange(nextLesson.date)}` : ""}
          </p>
          {nextLesson.meeting_url ? (
            <Button asChild className="mt-4 w-full sm:w-auto">
              <a href={nextLesson.meeting_url} target="_blank" rel="noreferrer">
                <Video aria-hidden="true" />
                Entrar na aula
                <span className="sr-only"> (abre em nova aba)</span>
              </a>
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
