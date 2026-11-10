import { Button } from "@/components/ui/button";
import type { InterpreterReport } from "@/lib/interpreter";

export const InterpreterMetrics = ({ value }: { value: Pick<InterpreterReport, "meaning_score" | "completeness_score" | "naturalness_score"> }) => <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
  {([["Fidelidade ao significado", value.meaning_score], ["Completude", value.completeness_score], ["Naturalidade", value.naturalness_score]] as const).map(([label, score]) => <div key={label} className="rounded-2xl border border-border bg-background p-3">
    <p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{score === null ? "Sem avaliação" : `${score}/100`}</p>
  </div>)}
</div>;

const InterpreterReportCard = ({ report, onRetry, disabled }: { report: InterpreterReport; onRetry?: (id: string) => void; disabled?: boolean }) => <section aria-label="Relatório de interpretação" className="space-y-5 rounded-3xl border border-amber-200 bg-amber-50/40 p-4 sm:p-6">
  <div><h2 className="text-xl font-semibold">Relatório da interpretação</h2><p className="mt-1 text-sm text-muted-foreground">{report.interpreted_segments} {report.interpreted_segments === 1 ? "trecho avaliado" : "trechos avaliados"} · {report.oral_segments} por voz. A tentativa mais recente de cada trecho compõe o relatório.</p></div>
  <InterpreterMetrics value={report} />
  {report.simultaneous_segments ? <p className="text-sm">{report.simultaneous_segments} {report.simultaneous_segments === 1 ? "trecho por interpretação simultânea" : "trechos por interpretação simultânea"}. Compare os dois áudios no histórico das interpretações.</p> : null}
  {!report.interpreted_segments ? <p className="text-sm">Você encerrou sem responder. Nenhum desempenho foi atribuído.</p> : null}
  <div className="space-y-3">
    {([["Informações transmitidas corretamente", report.preserved], ["Informações omitidas", report.omitted], ["Informações alteradas", report.altered]] as const).map(([label, items]) => <details key={label} className="rounded-2xl border border-border bg-background p-4">
      <summary className="cursor-pointer text-sm font-medium">{label} ({items.length})</summary>
      {items.length ? <ul className="mt-3 space-y-3 text-sm">{items.map((item, index) => <li key={index}><p className="font-medium">{item.text}</p>{item.evidence ? <p className="mt-1 text-muted-foreground">Na sua resposta: “{item.evidence}”</p> : null}<p className="text-muted-foreground">{item.explanation}</p></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">Nenhuma informação registrada nesta categoria.</p>}
    </details>)}
  </div>
  {report.difficult_vocabulary.length ? <div><h3 className="text-sm font-semibold">Vocabulário para revisar</h3><p className="mt-2 text-sm">{report.difficult_vocabulary.join(" · ")}</p></div> : null}
  {report.recommendations.length ? <div><h3 className="text-sm font-semibold">Como melhorar</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{report.recommendations.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
  {onRetry && report.difficult_segments.length ? <div className="space-y-2"><h3 className="text-sm font-semibold">Refazer trechos mais difíceis</h3><div className="flex flex-wrap gap-2">{report.difficult_segments.map((item) => <Button key={item.challenge_id} variant="outline" disabled={disabled} onClick={() => onRetry(item.challenge_id)}>{item.label}</Button>)}</div></div> : null}
  <p className="text-xs text-muted-foreground">Avaliação de significado baseada no texto ou na transcrição. Fluidez, pronúncia e clareza da fala não avaliadas. Respostas com alternativas avaliam reconhecimento de significado. O professor tem acesso a este mesmo relatório.</p>
</section>;

export default InterpreterReportCard;
