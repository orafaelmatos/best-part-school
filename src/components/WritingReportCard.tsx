import { AlertTriangle, CheckCircle2, ChevronDown, ListChecks, PenLine, XCircle, type LucideIcon } from "lucide-react";
import type { WritingReport } from "@/lib/writing";
import { writingReportStatus } from "@/lib/writing";
import { Badge } from "@/components/student/ui";
import { iconStroke } from "@/design-system/tokens";

const Items = ({ title, items }: { title: string; items: string[] }) => <div>
  <h4 className="text-body font-semibold text-ink">{title}</h4>
  {items.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-body-lg text-ink marker:text-ink-muted">{items.map((item, index) => <li key={index}>{item}</li>)}</ul>
    : <p className="mt-1 text-body text-ink-secondary">Ainda não há registros.</p>}
</div>;

const stats: Array<{ label: string; key: "activities_completed" | "attempts" | "correct" | "needs_work"; icon: LucideIcon; iconClass: string }> = [
  { label: "Atividades respondidas", key: "activities_completed", icon: ListChecks, iconClass: "text-primary" },
  { label: "Respostas avaliadas", key: "attempts", icon: PenLine, iconClass: "text-primary" },
  { label: "Acertos", key: "correct", icon: CheckCircle2, iconClass: "text-success" },
  { label: "Respostas com ajustes", key: "needs_work", icon: AlertTriangle, iconClass: "text-warning" },
];

const WritingReportCard = ({ report }: { report: WritingReport }) => <section aria-label="Resumo de Writing" className="min-w-0 space-y-6 break-words">
  <div className="space-y-3">
    <div className="flex flex-wrap gap-2"><Badge tone="primary">{report.level}</Badge><Badge>{writingReportStatus[report.status]}</Badge></div>
    <div>
      <h3 className="text-h4 text-ink">Sua aula de Writing · {report.scenario}</h3>
      <p className="mt-0.5 text-body text-ink-secondary">{report.practice_mode}</p>
    </div>
  </div>
  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
    {stats.map(({ label, key, icon: Icon, iconClass }) => <div key={label} className="rounded-lg bg-surface-muted p-3">
      <dt className="flex items-start gap-1.5 text-caption text-ink">
        <Icon size={16} strokeWidth={iconStroke} aria-hidden="true" className={`mt-px shrink-0 ${iconClass}`} />{label}
      </dt>
      <dd className="mt-1 text-h3 text-ink">{report[key]}</dd>
    </div>)}
  </dl>
  <Items title="Estruturas trabalhadas" items={report.structures} />
  <Items title="Vocabulário utilizado nas suas respostas" items={report.vocabulary} />
  <Items title="Principais dificuldades" items={report.difficulties} />
  <Items title="Para a próxima revisão" items={report.recommendations} />
  {report.responses.length ? <details className="group/responses border-t border-line pt-2">
    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-md text-body font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">Rever respostas e correções ({report.responses.length})
      <ChevronDown size={16} aria-hidden="true" className="shrink-0 transition-transform duration-200 ease-standard group-open/responses:rotate-180" />
    </summary>
    <ol className="mt-2 divide-y divide-line">{report.responses.map((response, index) => <li key={index} className="space-y-2 py-4 first:pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-body font-medium text-ink">{response.activity}</p>
        {response.outcome === "correct"
          ? <Badge tone="success" icon={<CheckCircle2 aria-hidden="true" />}>Correta</Badge>
          : <Badge tone="warning" icon={<AlertTriangle aria-hidden="true" />}>Com ajustes</Badge>}
      </div>
      <p className="text-body text-ink-secondary">{response.instruction}</p>
      <div>
        <p className="flex items-center gap-1.5 text-label text-ink-secondary">
          {response.outcome === "needs_work"
            ? <XCircle size={16} strokeWidth={iconStroke} aria-hidden="true" className="shrink-0 text-danger" />
            : <CheckCircle2 size={16} strokeWidth={iconStroke} aria-hidden="true" className="shrink-0 text-success" />}
          Resposta
        </p>
        <p lang="en" className="mt-0.5 text-body-lg text-ink">{response.original}</p>
      </div>
      {response.outcome === "needs_work" ? <div>
        <p className="flex items-center gap-1.5 text-label text-ink-secondary">
          <CheckCircle2 size={16} strokeWidth={iconStroke} aria-hidden="true" className="shrink-0 text-success" />Forma correta
        </p>
        <p lang="en" className="mt-0.5 text-body-lg font-medium text-ink">{response.corrected}</p>
      </div> : null}
      <p className="text-body text-ink-secondary">{response.feedback}</p>
      {response.errors.map((error, errorIndex) => <p key={errorIndex} className="text-body text-ink-secondary">{error.explanation}</p>)}
    </li>)}</ol>
  </details> : null}
</section>;

export default WritingReportCard;
