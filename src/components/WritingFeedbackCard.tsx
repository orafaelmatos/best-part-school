import { useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, FileText, Lightbulb, Sparkles, XCircle } from "lucide-react";
import { Badge, Card, Chip, CircularProgress, IconTile, ProgressBar, StudyBlock } from "@/components/student/ui";
import { iconStroke } from "@/design-system/tokens";

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

const ScoreRow = ({ label, value }: { label: string; value?: number }) => {
  const score = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-body">
        <span className="text-ink-secondary">{label}</span>
        <span className="font-semibold text-ink">{score}/100</span>
      </div>
      <ProgressBar value={score} max={100} label={`${label}: ${score} de 100`} />
    </div>
  );
};

const labelByType: Record<WritingFeedback["text_type"], string> = {
  free: "Livre",
  essay: "Redação",
  email: "Email",
  self_intro: "Apresentação pessoal",
  storytelling: "Storytelling",
};

const Section = ({ title, description, children }: { title: string; description?: string; children: ReactNode }) => (
  <section className="space-y-3 border-t border-line pt-5">
    <div>
      <h4 className="text-body-lg font-semibold text-ink">{title}</h4>
      {description ? <p className="mt-0.5 text-body text-ink-secondary">{description}</p> : null}
    </div>
    {children}
  </section>
);

const itemListClass = "divide-y divide-line text-body-lg text-ink [&>li]:py-2 [&>li:first-child]:pt-0 [&>li:last-child]:pb-0";

const WritingFeedbackCard = ({ feedback }: { feedback: WritingFeedback }) => {
  const availableLevels = useMemo(
    () => WRITING_LEVELS.filter((level) => (feedback.rewrites?.[level] || "").trim()),
    [feedback.rewrites],
  );
  const [selectedRewriteLevel, setSelectedRewriteLevel] = useState<string>(availableLevels[0] || "B1");
  const level = feedback.estimated_level || "A2";
  const rewrite = feedback.rewrites?.[selectedRewriteLevel];

  return (
    <Card className="min-w-0 space-y-5 break-words">
      <div className="flex items-start gap-3">
        <IconTile icon={Sparkles} tone="ai" size="sm" />
        <div className="min-w-0">
          <h3 className="text-h4 text-ink">Análise de writing</h3>
          <p className="text-caption text-ink-muted">
            {labelByType[feedback.text_type]} · nível estimado {level}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="flex items-center gap-4">
          <CircularProgress value={Math.max(0, Math.min(100, feedback.writing_score))} max={100} size={72}
            label={`Writing Score: ${feedback.writing_score} de 100`}>
            <span className="text-h4">{feedback.writing_score}</span>
          </CircularProgress>
          <div className="space-y-1.5">
            <p className="text-body font-semibold text-ink">Writing Score {feedback.writing_score}/100</p>
            <Badge tone="primary">CEFR {level}</Badge>
          </div>
        </div>
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
          <ScoreRow label="Gramática" value={feedback.sub_scores?.grammar} />
          <ScoreRow label="Vocabulário" value={feedback.sub_scores?.vocabulary} />
          <ScoreRow label="Naturalidade" value={feedback.sub_scores?.naturality} />
          <ScoreRow label="Coerência" value={feedback.sub_scores?.coherence} />
          <ScoreRow label="Complexidade" value={feedback.sub_scores?.complexity} />
        </div>
      </div>

      <Section title="Resumo">
        <p className="text-body-lg leading-7 text-ink">{feedback.general_feedback}</p>
        <StudyBlock kind="tip" title="Evolução de nível">
          <p className="leading-7">{feedback.level_progress_feedback}</p>
        </StudyBlock>
      </Section>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-surface-muted px-4 py-3">
          <p className="flex items-center gap-1.5 text-label text-ink">
            <FileText size={16} strokeWidth={iconStroke} aria-hidden="true" className="shrink-0" />Texto original
          </p>
          <p className="mt-1 whitespace-pre-line text-body-lg leading-7 text-ink">{feedback.original_text}</p>
        </div>
        <div className="rounded-lg bg-success-soft px-4 py-3">
          <p className="flex items-center gap-1.5 text-label text-success">
            <CheckCircle2 size={16} strokeWidth={iconStroke} aria-hidden="true" className="shrink-0" />Texto corrigido
          </p>
          <p className="mt-1 whitespace-pre-line text-body-lg leading-7 text-ink">{feedback.corrected_text}</p>
        </div>
      </div>

      <Section title="Pontos fortes">
        <ul className="space-y-2 text-body-lg text-ink">
          {(feedback.strengths || []).map((item) => (
            <li key={item} className="flex gap-2">
              <CheckCircle2 size={20} strokeWidth={iconStroke} aria-hidden="true" className="mt-0.5 shrink-0 text-success" />
              <span className="min-w-0">{item}</span>
            </li>
          ))}
          {!feedback.strengths?.length && <li className="text-body text-ink-secondary">Sem destaques registrados.</li>}
        </ul>
      </Section>

      {feedback.improvement_tips?.length ? (
        <Section title="Como subir de nível">
          <ul className="space-y-2 text-body-lg text-ink">
            {feedback.improvement_tips.map((item) => (
              <li key={item} className="flex gap-2">
                <Lightbulb size={20} strokeWidth={iconStroke} aria-hidden="true" className="mt-0.5 shrink-0 text-ai" />
                <span className="min-w-0">{item}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Explicações gramaticais">
        <ul className={itemListClass}>
          {(feedback.grammar_breakdown || []).map((item) => <li key={item}>{item}</li>)}
          {!feedback.grammar_breakdown?.length && <li className="text-body text-ink-secondary">Sem observações extras.</li>}
        </ul>
      </Section>

      {feedback.error_explanations?.length ? (
        <Section title="Erros explicados">
          <ul className="space-y-5">
            {feedback.error_explanations.map((item, index) => (
              <li key={`${item.excerpt || "error"}-${index}`} className="space-y-2">
                <Badge>{item.category || "Correção"}</Badge>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg bg-danger-soft px-4 py-3">
                    <p className="flex items-center gap-1.5 text-label text-ink">
                      <XCircle size={16} strokeWidth={iconStroke} aria-hidden="true" className="shrink-0 text-danger" />Você escreveu
                    </p>
                    <p className="mt-1 text-body-lg text-ink">{item.excerpt || "Trecho original não informado."}</p>
                  </div>
                  <div className="rounded-lg bg-success-soft px-4 py-3">
                    <p className="flex items-center gap-1.5 text-label text-success">
                      <CheckCircle2 size={16} strokeWidth={iconStroke} aria-hidden="true" className="shrink-0" />Forma correta
                    </p>
                    <p className="mt-1 text-body-lg font-medium text-ink">{item.corrected || "Correção não informada."}</p>
                  </div>
                </div>
                <p className="text-body-lg leading-7 text-ink">{item.explanation || "Sem explicação adicional."}</p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Reescritas automáticas" description="Compare seu texto com versões mais avançadas.">
        {availableLevels.length ? (
          <div role="group" aria-label="Nível da reescrita" className="flex flex-wrap gap-2">
            {availableLevels.map((option) => (
              <Chip key={option} selected={selectedRewriteLevel === option} onClick={() => setSelectedRewriteLevel(option)}>
                Reescrever em {option}
              </Chip>
            ))}
          </div>
        ) : null}
        {rewrite ? (
          <StudyBlock kind="example" title={`Versão ${selectedRewriteLevel}`}>
            <p lang="en" className="whitespace-pre-line leading-7">{rewrite}</p>
          </StudyBlock>
        ) : <p className="text-body text-ink-secondary">Sem reescrita disponível.</p>}
      </Section>

      {feedback.exercises?.length ? (
        <Section title="Criar exercícios com meus erros">
          <ul className={itemListClass}>
            {feedback.exercises.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </Section>
      ) : null}

      {feedback.error_explanations?.length ? (
        <Section title="Explicar erros gramaticais">
          <ul className={itemListClass}>
            {feedback.error_explanations.map((item, index) => (
              <li key={`${item.category || "grammar"}-${index}`}>
                {item.category || "Correção"}: {item.explanation || "Sem detalhe."}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {feedback.vocabulary_flashcards?.length ? (
        <Section title="Gerar flashcards do novo vocabulário">
          <ul className={itemListClass}>
            {feedback.vocabulary_flashcards.map((item, index) => (
              <li key={`${item.term || "flashcard"}-${index}`}>
                <p lang="en" className="font-medium">{item.term || "Termo"}</p>
                <p className="text-body text-ink-secondary">{item.meaning || "Sem significado."}</p>
                <p className="mt-1 text-caption text-ink-muted">{item.example || "Sem exemplo."}</p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </Card>
  );
};

export default WritingFeedbackCard;
