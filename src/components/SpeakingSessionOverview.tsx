import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/student/ui";
import { cn } from "@/lib/utils";
import type { GuidedState, SpeakingPhase } from "@/lib/aiStudy";

const phases: Array<[SpeakingPhase, string]> = [["LEARN", "Aprender"], ["PRACTICE", "Praticar"], ["SIMULATE", "Simular"], ["FEEDBACK", "Feedback"]];

const SpeakingSessionOverview = ({ state }: { state: GuidedState }) => {
  const engine = state.speaking;
  if (!engine || state.stage !== "active") return null;
  const situation = engine.plan?.situations.find((item) => item.id === engine.situation_id);
  return (
    <div className="mt-3 min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="primary">{state.level}</Badge>
        <span className="text-caption text-ink-secondary">Aula de conversação</span>
      </div>
      <nav aria-label="Etapas da prática" className="grid grid-cols-4 gap-1 sm:gap-2">
        {phases.map(([phase, label], index) => {
          const current = engine.phase === phase;
          return (
            <span key={phase} aria-current={current ? "step" : undefined}
              className={cn(
                "flex min-h-9 items-center justify-center break-words rounded-md border px-1 py-1.5 text-center text-label sm:px-3",
                current ? "border-primary bg-primary-light text-primary-dark" : "border-line bg-surface text-ink-secondary",
              )}>
              {index + 1}. {label}
            </span>
          );
        })}
      </nav>
      {situation ? <details className="group/situation">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-md text-body font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">Sobre a situação: {situation.label}</span>
          <ChevronDown size={16} aria-hidden="true" className="shrink-0 transition-transform duration-200 ease-standard group-open/situation:rotate-180" />
        </summary>
        <div className="mt-1 space-y-1 rounded-lg bg-surface-muted px-4 py-3 text-body text-ink">
          <p>{situation.context}</p>
          <p>IA: {situation.ai_role} · Você: {situation.student_role}</p>
          <p>Vamos {situation.objective}</p>
        </div>
      </details> : null}
    </div>
  );
};

export default SpeakingSessionOverview;
