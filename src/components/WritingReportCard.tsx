import type { WritingReport } from "@/lib/writing";
import { writingReportStatus } from "@/lib/writing";
import { Badge } from "@/components/ui/badge";

const Items = ({ title, items }: { title: string; items: string[] }) => <div>
  <h4 className="text-sm font-semibold">{title}</h4>
  {items.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{items.map((item, index) => <li key={index}>{item}</li>)}</ul>
    : <p className="mt-1 text-sm text-muted-foreground">Ainda não há registros.</p>}
</div>;

const WritingReportCard = ({ report }: { report: WritingReport }) => <section aria-label="Resumo de Writing" className="min-w-0 space-y-5 break-words">
  <div className="flex flex-wrap gap-2"><Badge>{report.level}</Badge><Badge variant="secondary">{writingReportStatus[report.status]}</Badge></div>
  <div><h3 className="text-lg font-semibold">Sua aula de Writing · {report.scenario}</h3><p className="text-sm text-muted-foreground">{report.practice_mode}</p></div>
  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
    {[['Atividades respondidas', report.activities_completed], ['Respostas avaliadas', report.attempts], ['Acertos', report.correct], ['Respostas com ajustes', report.needs_work]].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-xl font-semibold">{value}</dd>
    </div>)}
  </dl>
  <Items title="Estruturas trabalhadas" items={report.structures} />
  <Items title="Vocabulário utilizado nas suas respostas" items={report.vocabulary} />
  <Items title="Principais dificuldades" items={report.difficulties} />
  <Items title="Para a próxima revisão" items={report.recommendations} />
  {report.responses.length ? <details className="rounded-xl border border-border p-3">
    <summary className="cursor-pointer text-sm font-medium">Rever respostas e correções ({report.responses.length})</summary>
    <div className="mt-3 space-y-4">{report.responses.map((response, index) => <div key={index} className="space-y-1 border-l-2 border-emerald-200 pl-3 text-sm">
      <p className="font-medium">{response.activity} · {response.outcome === "correct" ? "Correta" : "Com ajustes"}</p>
      <p className="text-muted-foreground">{response.instruction}</p><p lang="en">{response.original}</p>
      {response.outcome === "needs_work" ? <p lang="en" className="font-medium text-emerald-800">{response.corrected}</p> : null}
      <p className="text-muted-foreground">{response.feedback}</p>
      {response.errors.map((error, errorIndex) => <p key={errorIndex} className="text-muted-foreground">{error.explanation}</p>)}
    </div>)}</div>
  </details> : null}
</section>;

export default WritingReportCard;
