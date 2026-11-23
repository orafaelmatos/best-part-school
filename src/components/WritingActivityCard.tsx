import type { WritingActivity, WritingCorrection, WritingHelp } from "@/lib/writing";
import { Badge } from "@/components/ui/badge";

const Construction = ({ activity }: { activity: WritingActivity }) => <div className="space-y-3">
  <p className="whitespace-pre-line text-sm">{activity.explanation}</p>
  <ol className="space-y-2 border-l-2 border-emerald-200 pl-4">
    {activity.construction.map((step, index) => <li key={index}>
      <p lang="en" className="font-medium">{step.text}</p>
      <p className="text-sm text-muted-foreground">{step.translation}</p>
    </li>)}
  </ol>
</div>;

export const WritingActivityCard = ({ activity }: { activity: WritingActivity }) => <section aria-label="Atividade de Writing" className="min-w-0 space-y-5 break-words">
  <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">Atividade {activity.number}</Badge><Badge variant="outline">{activity.kind_label}</Badge></div>
  <div><h3 className="font-semibold">Sua situação</h3><p className="mt-1 whitespace-pre-line">{activity.situation}</p>
    <p className="mt-2 text-sm text-muted-foreground">Objetivo: {activity.objective}</p></div>
  <div className="rounded-2xl bg-slate-50 p-4">
    <p className="mb-3 font-semibold">Vamos construir · <span lang="en">{activity.structure}</span></p>
    {activity.support === "full" ? <Construction activity={activity} /> : <details>
      <summary className="cursor-pointer text-sm text-emerald-800">Rever a estrutura passo a passo</summary>
      <div className="mt-3"><Construction activity={activity} /></div>
    </details>}
  </div>
  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
    <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Exemplo resolvido</h3>
    <p lang="en" className="mt-2 whitespace-pre-line font-medium">{activity.example.text}</p>
    <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{activity.example.translation}</p>
  </div>
  {activity.support === "full" ? <div><h3 className="text-sm font-semibold">Palavras para esta atividade</h3>
    <dl className="mt-2 flex flex-wrap gap-2">{activity.vocabulary.map((word, index) => <div key={index} className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
      <dt lang="en" className="inline font-medium">{word.text}</dt><dd className="inline"> — {word.translation}</dd>
    </div>)}</dl>
  </div> : null}
  <div className="rounded-2xl border-2 border-emerald-300 p-4"><h3 className="font-semibold text-emerald-800">Agora é sua vez</h3>
    <p className="mt-2 whitespace-pre-line">{activity.instruction}</p>
    {activity.words.length ? <div aria-label="Palavras fornecidas" className="mt-3 flex flex-wrap gap-2">{activity.words.map((word, index) => <span key={index} lang="en" className="rounded-lg border bg-white px-3 py-1 font-medium">{word}</span>)}</div> : null}
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
    return unchanged || !part.trim() ? part : <mark key={index} className="rounded bg-emerald-100 px-0.5 font-semibold text-emerald-950">{part}</mark>;
  })}</>;
};

export const WritingCorrectionCard = ({ correction }: { correction: WritingCorrection }) => <section aria-label="Correção da sua resposta" className="space-y-3 rounded-2xl border border-border p-4">
  <h3 className="font-semibold">{correction.outcome === "correct" ? "Muito bem!" : "Vamos ajustar juntos"}</h3>
  <p className="whitespace-pre-line">{correction.feedback}</p>
  <div><p className="text-xs font-semibold text-muted-foreground">Sua resposta</p><p lang="en" className="mt-1 whitespace-pre-line">{correction.original}</p></div>
  {correction.outcome === "needs_work" ? <>
    <div><p className="text-xs font-semibold text-emerald-800">Forma correta</p><p lang="en" className="mt-1 whitespace-pre-line"><HighlightedCorrection correction={correction} /></p></div>
    {correction.errors.map((error, index) => <p key={index} className="whitespace-pre-line text-sm text-muted-foreground">{error.explanation}</p>)}
  </> : null}
</section>;

export const WritingHelpCard = ({ help }: { help: WritingHelp }) => <aside aria-label={help.label} className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
  <h3 className="font-semibold text-sky-900">{help.label}</h3><p className="mt-2 whitespace-pre-line">{help.text}</p>
</aside>;
