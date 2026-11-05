import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GuidedState, SpeakingPhase } from "@/lib/aiStudy";

const phases: Array<[SpeakingPhase, string]> = [["LEARN", "Aprender"], ["PRACTICE", "Praticar"], ["SIMULATE", "Simular"], ["FEEDBACK", "Feedback"]];

const SpeakingSessionOverview = ({ state }: { state: GuidedState }) => {
  const engine = state.speaking;
  if (!engine || state.stage !== "active") return null;
  const situation = engine.plan?.situations.find((item) => item.id === engine.situation_id);
  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center gap-2"><Badge variant="secondary">{state.level}</Badge><span className="text-xs text-muted-foreground">Aula de conversação</span></div>
      <nav aria-label="Etapas da prática" className="grid grid-cols-4 gap-1 sm:gap-2">
        {phases.map(([phase, label], index) => (
          <span key={phase} aria-current={engine.phase === phase ? "step" : undefined}
            className={cn("rounded-xl border px-1 py-2 text-center text-[11px] font-medium sm:px-3 sm:text-xs", engine.phase === phase ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
            {index + 1}. {label}
          </span>
        ))}
      </nav>
      {situation ? <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Sobre a situação: {situation.label}</summary>
        <div className="mt-2 space-y-1 rounded-xl bg-muted/40 p-3">
          <p>{situation.context}</p><p>IA: {situation.ai_role} · Você: {situation.student_role}</p>
          <p className="text-muted-foreground">Vamos {situation.objective}</p>
        </div>
      </details> : null}
    </div>
  );
};

export default SpeakingSessionOverview;
