import { CheckCircle2, Clock3, Target, XCircle } from "lucide-react";
import type { LessonReviewReport } from "@/lib/aiStudy";

export default function LessonReviewReportCard({ report }: { report: LessonReviewReport }) {
  const total = report.correct_count + report.incorrect_count;
  const duration = `${Math.floor(report.duration_seconds / 60)}min ${report.duration_seconds % 60}s`;
  return (
    <section className="rounded-3xl border border-sky-200 bg-sky-50/60 p-4 sm:p-6" aria-label="Relatório da revisão">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-900">Relatório da revisão</h3>
          <p className="mt-1 text-sm text-slate-700">{report.lesson_title}</p>
        </div>
        <time className="text-xs text-slate-500" dateTime={report.completed_at}>
          {new Date(report.completed_at).toLocaleString("pt-BR")}
        </time>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Acertos", value: report.correct_count, icon: CheckCircle2, color: "text-emerald-700" },
          { label: "Erros", value: report.incorrect_count, icon: XCircle, color: "text-rose-700" },
          { label: "Aproveitamento", value: total ? `${Math.round(report.correct_count / total * 100)}%` : "—", icon: Target, color: "text-sky-700" },
          { label: "Tempo de prática", value: duration, icon: Clock3, color: "text-slate-700" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-2xl bg-white p-3">
            <dt className="flex items-center gap-1.5 text-xs text-slate-600"><Icon className={`h-4 w-4 ${color}`} />{label}</dt>
            <dd className={`mt-2 text-xl font-semibold ${color}`}>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs text-slate-500">O tempo considera a prática ativa. Atividades sem resposta não contam como erro.</p>
      <h4 className="mt-5 text-sm font-semibold">Principais dificuldades</h4>
      {report.difficulties.length ? (
        <ul className="mt-2 space-y-1 text-sm text-slate-700">
          {report.difficulties.map(({ topic, count }) => <li key={topic}>{topic} · {count} {count === 1 ? "ocorrência" : "ocorrências"}</li>)}
        </ul>
      ) : <p className="mt-2 text-sm text-slate-600">{total ? "Nenhuma dificuldade registrada nas respostas avaliadas." : "Nenhuma resposta avaliada nesta revisão."}</p>}
      {report.attempts.length > 0 && (
        <details className="mt-5 rounded-2xl border border-sky-100 bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium">Ver respostas e correções ({total})</summary>
          <ol className="mt-4 space-y-4">
            {report.attempts.map((attempt, index) => (
              <li key={attempt.exercise_id} className="border-t border-slate-100 pt-3 text-sm">
                <p className="font-medium">{index + 1}. {attempt.question}</p>
                <p className="mt-2">Resposta: {attempt.answer}</p>
                <p className={`mt-1 font-medium ${attempt.is_correct ? "text-emerald-700" : "text-rose-700"}`}>{attempt.is_correct ? "Correta" : "Precisa de revisão"}</p>
                {attempt.error && !attempt.is_correct && <p className="mt-2">O que ajustar: {attempt.error}</p>}
                <p className="mt-2 text-slate-600">{attempt.explanation}</p>
                {!attempt.is_correct && <p className="mt-1">Forma correta: {attempt.correct_answer}</p>}
                {attempt.pronunciation_feedback && <p className="mt-2 whitespace-pre-line">Pronúncia e fluência: {attempt.pronunciation_feedback}</p>}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
