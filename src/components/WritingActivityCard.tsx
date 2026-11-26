import type { ReactNode } from "react";
import { CheckCircle2, ChevronDown, PenLine, Target, XCircle } from "lucide-react";
import type { WritingActivity, WritingCorrection, WritingHelp } from "@/lib/writing";
import { Badge, StudyBlock } from "@/components/student/ui";
import { iconStroke } from "@/design-system/tokens";
import { cn } from "@/lib/utils";

const Construction = ({ activity }: { activity: WritingActivity }) => <div className="space-y-3">
  <p className="whitespace-pre-line text-body-lg text-ink">{activity.explanation}</p>
  <ol className="space-y-3 border-l-2 border-primary-light pl-4">
    {activity.construction.map((step, index) => <li key={index}>
      <p lang="en" className="text-body-lg font-medium text-ink">{step.text}</p>
      <p className="text-body text-ink">{step.translation}</p>
    </li>)}
  </ol>
</div>;

export const WritingActivityCard = ({ activity }: { activity: WritingActivity }) => <section aria-label="Atividade de Writing" className="min-w-0 space-y-6 break-words">
  <div className="flex flex-wrap items-center gap-2"><Badge tone="primary">Atividade {activity.number}</Badge><Badge>{activity.kind_label}</Badge></div>
  <div>
    <h3 className="text-h4 text-ink">Sua situação</h3>
    <p className="mt-1 whitespace-pre-line text-body-lg text-ink">{activity.situation}</p>
    <p className="mt-2 flex gap-2 text-body text-ink-secondary">
      <Target size={16} strokeWidth={iconStroke} aria-hidden="true" className="mt-0.5 shrink-0 text-primary" />
      <span>Objetivo: {activity.objective}</span>
    </p>
  </div>
  <div className="rounded-lg bg-surface-muted p-4">
    <p className="mb-3 text-body-lg font-semibold text-ink">Vamos construir · <span lang="en">{activity.structure}</span></p>
    {activity.support === "full" ? <Construction activity={activity} /> : <details className="group/construction">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-md text-body font-medium text-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">Rever a estrutura passo a passo
        <ChevronDown size={16} aria-hidden="true" className="shrink-0 transition-transform duration-200 ease-standard group-open/construction:rotate-180" />
      </summary>
      <div className="mt-2"><Construction activity={activity} /></div>
    </details>}
  </div>
  <StudyBlock kind="example" title="Exemplo resolvido">
    <p lang="en" className="whitespace-pre-line font-medium">{activity.example.text}</p>
    <p className="mt-1 whitespace-pre-line text-body text-ink">{activity.example.translation}</p>
  </StudyBlock>
  {activity.support === "full" ? <div>
    <h3 className="text-body font-semibold text-ink">Palavras para esta atividade</h3>
    <dl className="mt-2 flex flex-wrap gap-2">{activity.vocabulary.map((word, index) => <div key={index} className="rounded-md bg-surface-muted px-3 py-2 text-body text-ink">
      <dt lang="en" className="inline font-semibold">{word.text}</dt><dd className="inline"> — {word.translation}</dd>
    </div>)}</dl>
  </div> : null}
  <div className="rounded-lg border border-primary-light p-4">
    <h3 className="flex items-center gap-2 text-h4 text-ink">
      <PenLine size={20} strokeWidth={iconStroke} aria-hidden="true" className="shrink-0 text-primary" />Agora é sua vez
    </h3>
    <p className="mt-2 whitespace-pre-line text-body-lg text-ink">{activity.instruction}</p>
    {activity.words.length ? <div aria-label="Palavras fornecidas" className="mt-3 flex flex-wrap gap-2">{activity.words.map((word, index) => <span key={index} lang="en" className="rounded-sm border border-line bg-surface px-3 py-1 text-body font-medium text-ink">{word}</span>)}</div> : null}
  </div>
</section>;

const HighlightedCorrection = ({ correction }: { correction: WritingCorrection }) => {
  const before = correction.original.split(/(\s+)/).filter(Boolean);
  const after = correction.corrected_text.split(/(\s+)/).filter(Boolean);
  if (before.length * after.length > 1_000_000) return <>{correction.corrected_text}</>;
  const common = Array.from({ length: before.length + 1 }, () => new Uint16Array(after.length + 1));
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      common[i][j] = before[i] === after[j] ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1]);
    }
  }
  let originalIndex = 0;
  return <>{after.map((part, index) => {
    while (originalIndex < before.length && before[originalIndex] !== part && common[originalIndex + 1][index] >= common[originalIndex][index + 1]) originalIndex++;
    const unchanged = before[originalIndex] === part;
    if (unchanged) originalIndex++;
    return unchanged || !part.trim() ? part : <mark key={index} className="rounded-xs bg-surface px-0.5 font-semibold text-ink underline decoration-success decoration-2 underline-offset-2">{part}</mark>;
  })}</>;
};

const AnswerBlock = ({ label, correct, children }: { label: string; correct: boolean; children: ReactNode }) => {
  const Icon = correct ? CheckCircle2 : XCircle;
  return <div className={cn("rounded-lg px-4 py-3", correct ? "bg-success-soft" : "bg-danger-soft")}>
    <p className={cn("flex items-center gap-1.5 text-label", correct ? "text-success" : "text-ink")}>
      <Icon size={16} strokeWidth={iconStroke} aria-hidden="true" className={cn("shrink-0", correct ? "text-success" : "text-danger")} />{label}
    </p>
    <p lang="en" className="mt-1 whitespace-pre-line text-body-lg text-ink">{children}</p>
  </div>;
};

export const WritingCorrectionCard = ({ correction }: { correction: WritingCorrection }) => {
  const correct = correction.outcome === "correct";
  return <section aria-label="Correção da sua resposta" className="min-w-0 space-y-3 break-words">
    <h3 className="flex items-center gap-2 text-h4 text-ink">
      {correct
        ? <CheckCircle2 size={20} strokeWidth={iconStroke} aria-hidden="true" className="shrink-0 text-success" />
        : <PenLine size={20} strokeWidth={iconStroke} aria-hidden="true" className="shrink-0 text-warning" />}
      {correct ? "Muito bem!" : "Vamos ajustar juntos"}
    </h3>
    <p className="whitespace-pre-line text-body-lg text-ink">{correction.feedback}</p>
    <div className={cn("grid gap-3", !correct && "sm:grid-cols-2")}>
      <AnswerBlock label="Sua resposta" correct={correct}>{correction.original}</AnswerBlock>
      {correction.outcome === "needs_work" ? <AnswerBlock label="Forma correta" correct><HighlightedCorrection correction={correction} /></AnswerBlock> : null}
    </div>
    {correction.outcome === "needs_work" && correction.errors.length ? <StudyBlock kind="correction" title="O que ajustar">
      <div className="space-y-2">
        {correction.errors.map((error, index) => <p key={index} className="whitespace-pre-line">{error.explanation}</p>)}
      </div>
    </StudyBlock> : null}
  </section>;
};

export const WritingHelpCard = ({ help }: { help: WritingHelp }) => <aside aria-label={help.label} className="min-w-0 break-words">
  <StudyBlock kind="tip" title={help.label}><p className="whitespace-pre-line">{help.text}</p></StudyBlock>
</aside>;
