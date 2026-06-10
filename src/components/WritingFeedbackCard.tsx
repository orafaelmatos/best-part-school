import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export type WritingFeedback = {
  id: string;
  text_type: "free" | "essay" | "email" | "self_intro" | "storytelling";
  original_text: string;
  corrected_text: string;
  estimated_level: string;
  writing_score: number;
  sub_scores?: Record<string, number>;
  general_feedback: string;
  level_progress_feedback: string;
  strengths: string[];
  error_explanations: Array<{
    excerpt?: string;
    corrected?: string;
    explanation?: string;
    category?: string;
  }>;
  improvement_tips: string[];
  rewrites?: Record<string, string>;
  exercises: string[];
  grammar_breakdown: string[];
  vocabulary_flashcards: Array<{
    term?: string;
    meaning?: string;
    example?: string;
  }>;
};

const WRITING_LEVELS = ["B1", "B2", "C1", "C2"] as const;

const ScorePill = ({ label, value }: { label: string; value?: number }) => (
  <div className="rounded-2xl border border-border/70 bg-background/90 px-3 py-2.5">
    <div className="flex items-center justify-between gap-3 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{Math.max(0, Math.min(100, Number(value) || 0))}/100</span>
    </div>
  </div>
);

const labelByType: Record<WritingFeedback["text_type"], string> = {
  free: "Livre",
  essay: "Redação",
  email: "Email",
  self_intro: "Apresentação pessoal",
  storytelling: "Storytelling",
};

const WritingFeedbackCard = ({ feedback }: { feedback: WritingFeedback }) => {
  const availableLevels = useMemo(
    () => WRITING_LEVELS.filter((level) => (feedback.rewrites?.[level] || "").trim()),
    [feedback.rewrites],
  );
  const [selectedRewriteLevel, setSelectedRewriteLevel] = useState<string>(availableLevels[0] || "B1");

  return (
    <div className="space-y-4 rounded-[28px] border border-border/70 bg-card/95 p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Análise de writing</p>
          <p className="text-xs text-muted-foreground">
            {labelByType[feedback.text_type]} · nível estimado {feedback.estimated_level || "A2"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-slate-900 px-3 py-1 font-semibold text-white">
              Writing Score {feedback.writing_score}/100
            </span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
              CEFR {feedback.estimated_level || "A2"}
            </span>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <ScorePill label="Gramática" value={feedback.sub_scores?.grammar} />
          <ScorePill label="Vocabulário" value={feedback.sub_scores?.vocabulary} />
          <ScorePill label="Naturalidade" value={feedback.sub_scores?.naturality} />
          <ScorePill label="Coerência" value={feedback.sub_scores?.coherence} />
          <ScorePill label="Complexidade" value={feedback.sub_scores?.complexity} />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Resumo</p>
          <p className="mt-2 text-sm leading-6 text-foreground">{feedback.general_feedback}</p>
        </div>
        <div className="rounded-2xl border border-amber-200/70 bg-amber-50/70 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">Evolução de nível</p>
          <p className="mt-2 text-sm leading-6 text-amber-950">{feedback.level_progress_feedback}</p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl bg-muted/60 p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Texto original</p>
          <p className="mt-2 whitespace-pre-line text-sm leading-6">{feedback.original_text}</p>
        </div>
        <div className="rounded-2xl bg-emerald-50/70 p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Texto corrigido</p>
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-emerald-950">{feedback.corrected_text}</p>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pontos fortes</p>
          <ul className="space-y-2 text-sm">
            {(feedback.strengths || []).map((item) => (
              <li key={item} className="rounded-xl bg-muted px-3 py-2">
                {item}
              </li>
            ))}
            {!feedback.strengths?.length && <li className="text-muted-foreground">Sem destaques registrados.</li>}
          </ul>
        </div>
        <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Como subir de nível</p>
          <ul className="space-y-2 text-sm">
            {(feedback.improvement_tips || []).map((item) => (
              <li key={item} className="rounded-xl bg-muted px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Explicações gramaticais</p>
          <ul className="space-y-2 text-sm">
            {(feedback.grammar_breakdown || []).map((item) => (
              <li key={item} className="rounded-xl bg-muted px-3 py-2">
                {item}
              </li>
            ))}
            {!feedback.grammar_breakdown?.length && <li className="text-muted-foreground">Sem observações extras.</li>}
          </ul>
        </div>
      </div>

      <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Erros explicados</p>
        <div className="grid gap-3 xl:grid-cols-2">
          {(feedback.error_explanations || []).map((item, index) => (
            <div key={`${item.excerpt || "error"}-${index}`} className="rounded-2xl bg-muted/70 p-3">
              <p className="text-xs font-semibold text-foreground">{item.category || "Correção"}</p>
              <p className="mt-2 text-sm text-muted-foreground">{item.excerpt || "Trecho original não informado."}</p>
              <p className="mt-1 text-sm font-medium text-foreground">{item.corrected || "Correção não informada."}</p>
              <p className="mt-2 text-sm leading-6">{item.explanation || "Sem explicação adicional."}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Reescritas automáticas</p>
            <p className="mt-1 text-sm text-muted-foreground">Compare seu texto com versões mais avançadas.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {availableLevels.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setSelectedRewriteLevel(level)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                  selectedRewriteLevel === level
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-border bg-white text-muted-foreground hover:text-foreground",
                )}
              >
                Reescrever em {level}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 rounded-2xl bg-muted/60 p-4">
          <p className="whitespace-pre-line text-sm leading-6">{feedback.rewrites?.[selectedRewriteLevel] || "Sem reescrita disponível."}</p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Criar exercícios com meus erros</p>
          <ul className="space-y-2 text-sm">
            {(feedback.exercises || []).map((item) => (
              <li key={item} className="rounded-xl bg-muted px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Explicar erros gramaticais</p>
          <ul className="space-y-2 text-sm">
            {(feedback.error_explanations || []).map((item, index) => (
              <li key={`${item.category || "grammar"}-${index}`} className="rounded-xl bg-muted px-3 py-2">
                {item.category || "Correção"}: {item.explanation || "Sem detalhe."}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Gerar flashcards do novo vocabulário</p>
          <ul className="space-y-2 text-sm">
            {(feedback.vocabulary_flashcards || []).map((item, index) => (
              <li key={`${item.term || "flashcard"}-${index}`} className="rounded-xl bg-muted px-3 py-2">
                <p className="font-medium">{item.term || "Termo"}</p>
                <p className="text-muted-foreground">{item.meaning || "Sem significado."}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.example || "Sem exemplo."}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default WritingFeedbackCard;
