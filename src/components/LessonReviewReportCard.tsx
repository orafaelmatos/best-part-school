import { CheckCircle2, ChevronDown, Clock3, Target, XCircle } from "lucide-react";
import { Card, ProgressBar, StudyBlock } from "@/components/student/ui";
import { iconStroke } from "@/design-system/tokens";
import type { LessonReviewReport } from "@/lib/aiStudy";

export default function LessonReviewReportCard({ report }: { report: LessonReviewReport }) {
  const total = report.correct_count + report.incorrect_count;
  const duration = `${Math.floor(report.duration_seconds / 60)}min ${report.duration_seconds % 60}s`;
  return (
    <Card as="section" className="min-w-0 space-y-5 break-words" aria-label="Relatório da revisão">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-h4 text-ink">Relatório da revisão</h3>
          <p className="mt-0.5 text-body text-ink-secondary">{report.lesson_title}</p>
        </div>
        <time className="text-caption text-ink-muted" dateTime={report.completed_at}>
          {new Date(report.completed_at).toLocaleString("pt-BR")}
        </time>
      </div>
      <div className="space-y-3">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Acertos", value: report.correct_count, icon: CheckCircle2, color: "text-success" },
            { label: "Erros", value: report.incorrect_count, icon: XCircle, color: "text-danger" },
            { label: "Aproveitamento", value: total ? `${Math.round(report.correct_count / total * 100)}%` : "—", icon: Target, color: "text-primary" },
            { label: "Tempo de prática", value: duration, icon: Clock3, color: "text-ink-secondary" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-lg bg-surface-muted p-3">
              <dt className="flex items-center gap-1.5 text-caption text-ink">
                <Icon size={16} strokeWidth={iconStroke} aria-hidden="true" className={`shrink-0 ${color}`} />{label}
              </dt>
              <dd className="mt-1 text-h3 text-ink">{value}</dd>
            </div>
          ))}
        </dl>
        {total ? <ProgressBar value={report.correct_count} max={total} tone="success"
          label={`Aproveitamento: ${report.correct_count} de ${total} respostas corretas`} /> : null}
        <p className="text-caption text-ink-secondary">O tempo considera a prática ativa. Atividades sem resposta não contam como erro.</p>
      </div>
      <div>
        <h4 className="text-body font-semibold text-ink">Principais dificuldades</h4>
        {report.difficulties.length ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-body-lg text-ink marker:text-ink-muted">
            {report.difficulties.map(({ topic, count }) => <li key={topic}>{topic} · {count} {count === 1 ? "ocorrência" : "ocorrências"}</li>)}
          </ul>
        ) : <p className="mt-1 text-body text-ink-secondary">{total ? "Nenhuma dificuldade registrada nas respostas avaliadas." : "Nenhuma resposta avaliada nesta revisão."}</p>}
      </div>
      {report.attempts.length > 0 && (
        <details className="group/attempts border-t border-line pt-2">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-md text-body font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">Ver respostas e correções ({total})
            <ChevronDown size={16} aria-hidden="true" className="shrink-0 transition-transform duration-200 ease-standard group-open/attempts:rotate-180" />
          </summary>
          <ol className="mt-2 divide-y divide-line">
            {report.attempts.map((attempt, index) => (
              <li key={attempt.exercise_id} className="space-y-2 py-4 first:pt-2">
                <p className="text-body-lg font-medium text-ink">{index + 1}. {attempt.question}</p>
                <p className="text-body-lg text-ink">Resposta: {attempt.answer}</p>
                <p className="flex items-center gap-1.5 text-body font-semibold text-ink">
                  {attempt.is_correct
                    ? <CheckCircle2 size={20} strokeWidth={iconStroke} aria-hidden="true" className="shrink-0 text-success" />
                    : <XCircle size={20} strokeWidth={iconStroke} aria-hidden="true" className="shrink-0 text-danger" />}
                  {attempt.is_correct ? "Correta" : "Precisa de revisão"}
                </p>
                {attempt.error && !attempt.is_correct && <StudyBlock kind="correction" title="O que ajustar">{attempt.error}</StudyBlock>}
                <p className="text-body text-ink-secondary">{attempt.explanation}</p>
                {!attempt.is_correct && (
                  <div className="rounded-lg bg-success-soft px-4 py-3">
                    <p className="flex items-center gap-1.5 text-label text-success">
                      <CheckCircle2 size={16} strokeWidth={iconStroke} aria-hidden="true" className="shrink-0" />Forma correta
                    </p>
                    <p className="mt-1 text-body-lg text-ink">{attempt.correct_answer}</p>
                  </div>
                )}
                {attempt.pronunciation_feedback && <StudyBlock kind="tip" title="Pronúncia e fluência"><p className="whitespace-pre-line">{attempt.pronunciation_feedback}</p></StudyBlock>}
              </li>
            ))}
          </ol>
        </details>
      )}
    </Card>
  );
}
