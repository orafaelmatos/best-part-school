import { AlertTriangle, CheckCircle2, ChevronDown, FileText, MinusCircle, RotateCcw, type LucideIcon } from "lucide-react";
import { Badge, Button, Card, IconTile, ProgressBar, StudyBlock } from "@/components/student/ui";
import type { InterpreterReport } from "@/lib/interpreter";
import { cn } from "@/lib/utils";

export const InterpreterMetrics = ({ value }: { value: Pick<InterpreterReport, "meaning_score" | "completeness_score" | "naturalness_score"> }) => <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
  {([["Fidelidade ao significado", value.meaning_score], ["Completude", value.completeness_score], ["Naturalidade", value.naturalness_score]] as const).map(([label, score]) => <div key={label} className="flex min-w-0 flex-wrap items-center justify-between gap-2">
    <dt className="text-body text-ink-secondary">{label}</dt>
    <dd><Badge tone={score === null ? "neutral" : "primary"} className="tabular-nums">{score === null ? "Sem avaliação" : `${score}/100`}</Badge></dd>
    {score !== null ? <dd className="w-full"><ProgressBar value={score} max={100} label={label} /></dd> : null}
  </div>)}
</dl>;

const categories: ReadonlyArray<{ key: "preserved" | "omitted" | "altered"; label: string; icon: LucideIcon; iconClass: string }> = [
  { key: "preserved", label: "Informações transmitidas corretamente", icon: CheckCircle2, iconClass: "text-success" },
  { key: "omitted", label: "Informações omitidas", icon: MinusCircle, iconClass: "text-warning" },
  { key: "altered", label: "Informações alteradas", icon: AlertTriangle, iconClass: "text-danger" },
];

const InterpreterReportCard = ({ report, onRetry, disabled }: { report: InterpreterReport; onRetry?: (id: string) => void; disabled?: boolean }) => <Card as="section" aria-label="Relatório de interpretação" className="min-w-0 space-y-6">
  <div className="flex items-start gap-3">
    <IconTile icon={FileText} tone="ai" />
    <div className="min-w-0">
      <h2 className="text-h3 text-ink">Relatório da interpretação</h2>
      <p className="mt-1 text-body text-ink-secondary">{report.interpreted_segments} {report.interpreted_segments === 1 ? "trecho avaliado" : "trechos avaliados"} · {report.oral_segments} por voz. A tentativa mais recente de cada trecho compõe o relatório.</p>
    </div>
  </div>
  <InterpreterMetrics value={report} />
  {report.simultaneous_segments ? <p className="text-body text-ink">{report.simultaneous_segments} {report.simultaneous_segments === 1 ? "trecho por interpretação simultânea" : "trechos por interpretação simultânea"}. Compare os dois áudios no histórico das interpretações.</p> : null}
  {!report.interpreted_segments ? <p className="text-body text-ink">Você encerrou sem responder. Nenhum desempenho foi atribuído.</p> : null}
  <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">
    {categories.map(({ key, label, icon: Icon, iconClass }) => {
      const items = report[key];
      return <details key={label} className="group">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 text-body font-medium text-ink transition-colors duration-150 ease-standard hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
          <Icon size={20} className={cn("shrink-0", iconClass)} aria-hidden="true" />
          <span className="min-w-0 flex-1">{label} ({items.length})</span>
          <ChevronDown size={20} className="shrink-0 text-ink-muted transition-transform duration-200 ease-standard group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="px-4 pb-4">
          {items.length ? <ul className="space-y-3 text-body">{items.map((item, index) => <li key={index} className="space-y-1">
            <p className="font-medium text-ink">{item.text}</p>
            {item.evidence ? <p className="text-ink-secondary">Na sua resposta: “{item.evidence}”</p> : null}
            <p className="text-ink-secondary">{item.explanation}</p>
          </li>)}</ul> : <p className="text-body text-ink-secondary">Nenhuma informação registrada nesta categoria.</p>}
        </div>
      </details>;
    })}
  </div>
  {report.difficult_vocabulary.length ? <div><h3 className="text-body font-semibold text-ink">Vocabulário para revisar</h3>
    <ul className="mt-2 flex flex-wrap gap-2">{report.difficult_vocabulary.map((word, index) => <li key={`${word}-${index}`}><Badge tone="neutral">{word}</Badge></li>)}</ul>
  </div> : null}
  {report.recommendations.length ? <StudyBlock kind="tip" title="Como melhorar">
    <ul className="list-disc space-y-1 pl-5 text-body-lg">{report.recommendations.map((item) => <li key={item}>{item}</li>)}</ul>
  </StudyBlock> : null}
  {onRetry && report.difficult_segments.length ? <div className="space-y-2"><h3 className="text-body font-semibold text-ink">Refazer trechos mais difíceis</h3>
    <div className="flex flex-wrap gap-2">{report.difficult_segments.map((item) => <Button key={item.challenge_id} size="sm" variant="outline" className="h-auto max-w-full whitespace-normal py-2 text-left" disabled={disabled} onClick={() => onRetry(item.challenge_id)}><RotateCcw aria-hidden="true" />{item.label}</Button>)}</div>
  </div> : null}
  <p className="text-caption text-ink-muted">Avaliação de significado baseada no texto ou na transcrição. Fluidez, pronúncia e clareza da fala não avaliadas. Respostas com alternativas avaliam reconhecimento de significado. O professor tem acesso a este mesmo relatório.</p>
</Card>;

export default InterpreterReportCard;
