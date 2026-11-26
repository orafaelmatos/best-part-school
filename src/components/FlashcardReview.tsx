import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Keyboard } from "lucide-react";
import { Badge, Button, Card, EmptyState, ProgressBar, StudyBlock, cardVariants } from "@/components/student/ui";
import VocabularyAudioButton from "@/components/VocabularyAudioButton";
import { cn } from "@/lib/utils";

export type ReviewRating = "very_hard" | "hard" | "good" | "easy";

export type VocabularyCard = {
  id: string;
  word: string;
  translation: string;
  explanation?: string;
  example_sentence?: string;
  pronunciation?: string;
  tags?: string[];
  category_name?: string;
  custom_category?: string;
  audio_url?: string;
  audio_file_url?: string;
  favorite?: boolean;
  archived?: boolean;
  mastered?: boolean;
  easiness_factor: number;
  interval_days: number;
  repetition_count: number;
  failure_count: number;
  confidence_level: number;
  difficulty_level: "new" | "weak" | "learning" | "stable" | "mastered";
  next_review_at: string;
  last_reviewed_at?: string | null;
};

type Props = {
  cards: VocabularyCard[];
  reviewedCount: number;
  onBack: () => void;
  onReview: (card: VocabularyCard, rating: ReviewRating) => void;
  isReviewing?: boolean;
};

const ratingOptions: Array<{
  rating: ReviewRating;
  label: string;
  description: string;
  schedule: string;
}> = [
  { rating: "very_hard", label: "Errei", description: "Ainda não lembrei.", schedule: "Volta em 10 minutos" },
  { rating: "hard", label: "Difícil", description: "Lembrei com esforço.", schedule: "Volta em 1 dia" },
  { rating: "good", label: "Boa", description: "Lembrei bem.", schedule: "Volta em 3 dias" },
  { rating: "easy", label: "Fácil", description: "Lembrei na hora.", schedule: "Volta em 7 dias" },
];

// Small color cue next to the label; the words carry the meaning.
const ratingDot: Record<ReviewRating, string> = {
  very_hard: "bg-danger",
  hard: "bg-warning",
  good: "bg-primary",
  easy: "bg-success",
};

const FlashcardReview = ({ cards, reviewedCount, onBack, onReview, isReviewing }: Props) => {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const activeCard = cards[index];
  const remaining = cards.length;
  const total = reviewedCount + remaining;

  useEffect(() => {
    setRevealed(false);
    if (index >= cards.length) setIndex(Math.max(0, cards.length - 1));
  }, [cards.length, index]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!activeCard) return;
      if (event.code === "Space" || event.key === "Enter") {
        event.preventDefault();
        setRevealed(true);
      }
      if (!revealed) return;
      if (event.key === "1") onReview(activeCard, "very_hard");
      if (event.key === "2") onReview(activeCard, "hard");
      if (event.key === "3") onReview(activeCard, "good");
      if (event.key === "4") onReview(activeCard, "easy");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeCard, onReview, revealed]);

  const submitReview = (rating: ReviewRating) => {
    if (!activeCard) return;
    onReview(activeCard, rating);
    setRevealed(false);
    setIndex((current) => Math.min(current, Math.max(0, cards.length - 2)));
  };

  if (!activeCard) {
    return (
      <Card className="mx-auto max-w-2xl">
        <EmptyState
          icon={CheckCircle2}
          title="Fila concluída"
          description="As próximas revisões aparecem quando o algoritmo agendar novas palavras."
          action={<Button type="button" onClick={onBack}>Voltar ao painel</Button>}
        />
      </Card>
    );
  }

  const wordSize = activeCard.word.length > 40 ? "text-h3" : activeCard.word.length > 18 ? "text-h2" : "text-display";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" size="sm" className="-ml-2 shrink-0" onClick={onBack}>
          <ArrowLeft aria-hidden="true" /> Sair
        </Button>
        <ProgressBar value={reviewedCount} max={total} label="Progresso da revisão" className="min-w-0 flex-1" />
        <span className="shrink-0 text-body text-ink-secondary">{reviewedCount} de {total}</span>
      </div>

      <Card as="section" aria-label="Card de revisão" className="sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge>{activeCard.category_name || activeCard.custom_category || "Vocabulário"}</Badge>
          <span className="text-caption text-ink-muted">Confiança {activeCard.confidence_level}%</span>
        </div>

        <div className="flex min-h-56 flex-col items-center justify-center py-8 text-center">
          <p className="text-label text-ink-muted">Frente</p>
          <h2 lang="en" className={cn("mt-3 max-w-full break-words text-ink", wordSize)}>{activeCard.word}</h2>
          <div className="mt-5 flex flex-col items-center gap-2">
            <VocabularyAudioButton
              cardId={activeCard.id}
              audioUrl={activeCard.audio_url}
              audioFileUrl={activeCard.audio_file_url}
              text={activeCard.word}
              iconOnly
            />
          </div>
        </div>

        {!revealed ? (
          <Button type="button" size="lg" fullWidth className="sm:mx-auto sm:flex sm:w-auto" onClick={() => setRevealed(true)}>
            Revelar resposta
          </Button>
        ) : (
          <div className="space-y-6 border-t border-line pt-6">
            <div className="space-y-3 text-center">
              <p className="text-label text-ink-muted">Verso</p>
              <h3 className="break-words text-h3 text-ink">{activeCard.translation}</h3>
              {activeCard.explanation && <p className="text-body-lg text-ink-secondary">{activeCard.explanation}</p>}
            </div>
            {activeCard.example_sentence && (
              <StudyBlock kind="example" title="Exemplo">
                <span lang="en">{activeCard.example_sentence}</span>
              </StudyBlock>
            )}
            <div role="group" aria-label="Como foi lembrar desta palavra?" className="space-y-3">
              <p className="text-body font-medium text-ink">Como foi lembrar?</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {ratingOptions.map((option) => (
                  <button
                    key={option.rating}
                    type="button"
                    disabled={isReviewing}
                    className={cn(
                      cardVariants({ interactive: true, padding: "none" }),
                      "flex min-h-24 w-full flex-col items-start gap-1 rounded-lg p-3 text-left disabled:pointer-events-none disabled:opacity-50",
                    )}
                    onClick={() => submitReview(option.rating)}
                  >
                    <span className="flex items-center gap-1.5 text-body font-semibold text-ink">
                      <span className={cn("size-2 shrink-0 rounded-full", ratingDot[option.rating])} aria-hidden="true" />
                      {option.label}
                    </span>
                    <span className="text-caption text-ink-secondary">{option.description}</span>
                    <span className="text-caption text-ink-muted">{option.schedule}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>

      <p className="hidden items-center justify-center gap-2 text-caption text-ink-secondary sm:flex">
        <Keyboard size={16} aria-hidden="true" />
        Espaço revela. Depois use 1, 2, 3 ou 4 para responder.
      </p>
    </div>
  );
};

export default FlashcardReview;
