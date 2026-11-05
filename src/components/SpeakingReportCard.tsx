import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { SpeakingReport } from "@/lib/aiStudy";
import { speakingCount, speakingReportStatus } from "@/lib/aiStudy";

const ReportSection = ({ title, count, children }: { title: string; count: number; children: ReactNode }) => (
  <details className="rounded-xl border border-border bg-card p-3">
    <summary className="cursor-pointer text-sm font-medium">{title} <span className="text-muted-foreground">({count})</span></summary>
    <div className="mt-3 space-y-3 text-sm">{count ? children : <p className="text-muted-foreground">Nenhum registro nesta seção.</p>}</div>
  </details>
);

const SpeakingReportCard = ({ report }: { report: SpeakingReport }) => (
  <section aria-label="Resumo de Speaking" data-speaking-focus className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center gap-2"><Badge>{report.level}</Badge><Badge variant="secondary">{speakingReportStatus[report.status]}</Badge></div>
    <h3 className="text-lg font-semibold">Resumo da prática · {report.scenario}</h3>
    <p className="text-sm text-muted-foreground">{speakingCount(report.progress.evaluated_responses, "resposta avaliada", "respostas avaliadas")} · {speakingCount(report.progress.activities_completed, "atividade concluída", "atividades concluídas")} · {speakingCount(report.progress.situations_completed, "situação concluída", "situações concluídas")}</p>
    {report.limitations.map((item) => <p key={item} className="text-xs text-muted-foreground">{item}</p>)}
    <ReportSection title="Frases utilizadas" count={report.phrases_used.length}>
      {report.phrases_used.map((phrase, index) => <div key={index} className="break-words border-l-2 border-primary/30 pl-3">
        <p lang="en">{phrase.answer}</p><p className="mt-1 text-xs text-muted-foreground">{phrase.source === "transcript" ? "Transcrição do áudio" : phrase.source === "text" ? "Resposta escrita" : "Registro anterior da conversa"}</p>
      </div>)}
    </ReportSection>
    <ReportSection title="Vocabulário praticado" count={report.vocabulary.length}>
      {report.vocabulary.map((word) => <div key={word.expression}><p><span lang="en" className="font-medium">{word.expression}</span> — {word.translation}</p>
        <p className="text-xs text-muted-foreground">{speakingCount(word.attempts, "uso observado", "usos observados")} · {word.successful_uses} em respostas adequadas</p>
      </div>)}
    </ReportSection>
    <ReportSection title="Dificuldades observadas" count={report.difficulties.length}>
      {report.difficulties.map((issue, index) => <div key={index}><p>{issue.detail}</p><p className="text-xs text-muted-foreground">{speakingCount(issue.occurrences, "ocorrência", "ocorrências")} · Evidência: “{issue.evidence[0]}”</p></div>)}
    </ReportSection>
    <ReportSection title="Pontos recorrentes para revisar" count={report.recurring_errors.length}>
      {report.recurring_errors.map((issue, index) => <p key={index}>{issue.detail} · {issue.occurrences} ocorrências</p>)}
    </ReportSection>
    <ReportSection title="Pontos positivos" count={report.strengths.length}>
      {report.strengths.map((item, index) => <div key={index}><p>{item.text}</p><p className="text-muted-foreground">“{item.evidence}”</p></div>)}
    </ReportSection>
    <ReportSection title="Recomendações de revisão" count={report.recommendations.length}>
      {report.recommendations.map((item, index) => <p key={index}>{item.text}</p>)}
    </ReportSection>
    <ReportSection title="Progresso nas situações" count={report.progress.situations.length}>
      {report.progress.situations.map((situation) => <div key={situation.id}><p className="font-medium">{situation.label} · {situation.completed ? "Concluída" : "Em prática"}</p>
        <p className="text-muted-foreground">{situation.completed_step_ids.length} de {situation.total_steps} acontecimentos praticados</p>
        <p className="text-xs text-muted-foreground">As ramificações podem concluir o objetivo sem percorrer todos os acontecimentos.</p>
      </div>)}
    </ReportSection>
  </section>
);

export default SpeakingReportCard;
