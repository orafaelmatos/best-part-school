import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Info, Lightbulb } from "lucide-react";
import { Badge, ProgressBar } from "@/components/student/ui";
import { iconStroke } from "@/design-system/tokens";
import type { SpeakingReport } from "@/lib/aiStudy";
import { speakingCount, speakingReportStatus } from "@/lib/aiStudy";

const ReportSection = ({ title, count, children }: { title: string; count: number; children: ReactNode }) => (
  <details className="group/section">
    <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-md py-2 text-body-lg font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">{title}
      <Badge>{count}<span className="sr-only">{count === 1 ? " registro" : " registros"}</span></Badge>
      <ChevronDown size={20} strokeWidth={iconStroke} aria-hidden="true" className="ml-auto shrink-0 text-ink-muted transition-transform duration-200 ease-standard group-open/section:rotate-180" />
    </summary>
    <div className="space-y-4 pb-4 pt-1 text-body-lg text-ink">{count ? children : <p className="text-body text-ink-secondary">Nenhum registro nesta seção.</p>}</div>
  </details>
);

const SpeakingReportCard = ({ report }: { report: SpeakingReport }) => (
  <section aria-label="Resumo de Speaking" data-speaking-focus className="min-w-0 space-y-4 break-words">
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="primary">{report.level}</Badge>
      <Badge>{speakingReportStatus[report.status]}</Badge>
    </div>
    <div className="space-y-1">
      <h3 className="text-h4 text-ink">Resumo da prática · {report.scenario}</h3>
      <p className="text-body text-ink-secondary">{speakingCount(report.progress.evaluated_responses, "resposta avaliada", "respostas avaliadas")} · {speakingCount(report.progress.activities_completed, "atividade concluída", "atividades concluídas")} · {speakingCount(report.progress.situations_completed, "situação concluída", "situações concluídas")}</p>
    </div>
    {report.limitations.length ? <ul className="space-y-1">
      {report.limitations.map((item) => <li key={item} className="flex gap-2 text-caption text-ink-secondary">
        <Info size={16} strokeWidth={iconStroke} aria-hidden="true" className="mt-px shrink-0 text-ink-muted" /><span>{item}</span>
      </li>)}
    </ul> : null}
    <div className="divide-y divide-line border-y border-line">
      <ReportSection title="Frases utilizadas" count={report.phrases_used.length}>
        {report.phrases_used.map((phrase, index) => <div key={index} className="border-l-2 border-primary-light pl-3">
          <p lang="en">{phrase.answer}</p>
          <p className="mt-1 text-caption text-ink-secondary">{phrase.source === "transcript" ? "Transcrição do áudio" : phrase.source === "text" ? "Resposta escrita" : "Registro anterior da conversa"}</p>
        </div>)}
      </ReportSection>
      <ReportSection title="Vocabulário praticado" count={report.vocabulary.length}>
        {report.vocabulary.map((word) => <div key={word.expression}>
          <p><span lang="en" className="font-medium">{word.expression}</span> — {word.translation}</p>
          <p className="text-caption text-ink-secondary">{speakingCount(word.attempts, "uso observado", "usos observados")} · {word.successful_uses} em respostas adequadas</p>
        </div>)}
      </ReportSection>
      <ReportSection title="Dificuldades observadas" count={report.difficulties.length}>
        {report.difficulties.map((issue, index) => <div key={index}>
          <p>{issue.detail}</p>
          <p className="text-caption text-ink-secondary">{speakingCount(issue.occurrences, "ocorrência", "ocorrências")} · Evidência: “{issue.evidence[0]}”</p>
        </div>)}
      </ReportSection>
      <ReportSection title="Pontos recorrentes para revisar" count={report.recurring_errors.length}>
        {report.recurring_errors.map((issue, index) => <p key={index} className="flex gap-2">
          <AlertTriangle size={20} strokeWidth={iconStroke} aria-hidden="true" className="mt-0.5 shrink-0 text-warning" />
          <span>{issue.detail} · {issue.occurrences} ocorrências</span>
        </p>)}
      </ReportSection>
      <ReportSection title="Pontos positivos" count={report.strengths.length}>
        {report.strengths.map((item, index) => <div key={index} className="flex gap-2">
          <CheckCircle2 size={20} strokeWidth={iconStroke} aria-hidden="true" className="mt-0.5 shrink-0 text-success" />
          <div className="min-w-0"><p>{item.text}</p><p lang="en" className="text-body text-ink-secondary">“{item.evidence}”</p></div>
        </div>)}
      </ReportSection>
      <ReportSection title="Recomendações de revisão" count={report.recommendations.length}>
        {report.recommendations.map((item, index) => <p key={index} className="flex gap-2">
          <Lightbulb size={20} strokeWidth={iconStroke} aria-hidden="true" className="mt-0.5 shrink-0 text-ai" />
          <span>{item.text}</span>
        </p>)}
      </ReportSection>
      <ReportSection title="Progresso nas situações" count={report.progress.situations.length}>
        {report.progress.situations.map((situation) => <div key={situation.id} className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{situation.label}</p>
            {situation.completed
              ? <Badge tone="success" icon={<CheckCircle2 aria-hidden="true" />}>Concluída</Badge>
              : <Badge>Em prática</Badge>}
          </div>
          <ProgressBar value={situation.completed_step_ids.length} max={situation.total_steps}
            label={`${situation.label}: ${situation.completed_step_ids.length} de ${situation.total_steps} acontecimentos praticados`} />
          <p className="text-body text-ink-secondary">{situation.completed_step_ids.length} de {situation.total_steps} acontecimentos praticados</p>
          <p className="text-caption text-ink-secondary">As ramificações podem concluir o objetivo sem percorrer todos os acontecimentos.</p>
        </div>)}
      </ReportSection>
    </div>
  </section>
);

export default SpeakingReportCard;
