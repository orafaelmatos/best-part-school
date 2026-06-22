import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Flame, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import VocabularyAudioButton from "@/components/VocabularyAudioButton";

export type ReviewRating = "very_hard" | "hard" | "easy";

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

const ratingCopy: Record<ReviewRating, string> = {
  very_hard: "Muito Difícil",
  hard: "Difícil",
  easy: "Fácil",
};

const ratingStyles: Record<ReviewRating, string> = {
  very_hard: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
  hard: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
  easy: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
};

const FlashcardReview = ({ cards, reviewedCount, onBack, onReview, isReviewing }: Props) => {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const activeCard = cards[index];
  const remaining = cards.length;
  const total = reviewedCount + remaining;
  const progress = total ? Math.round((reviewedCount / total) * 100) : 0;

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
      if (event.key === "3") onReview(activeCard, "easy");
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
      <div className="mx-auto flex min-h-[420px] max-w-2xl flex-col items-center justify-center rounded-lg border border-border bg-card p-8 text-center">
        <CheckCircle2 className="mb-4 h-10 w-10 text-emerald-600" />
        <h2 className="text-2xl font-semibold">Fila concluída</h2>
        <p className="mt-2 text-sm text-muted-foreground">As próximas revisões aparecem quando o algoritmo agendar novos cards.</p>
        <Button className="mt-6" onClick={onBack}>Voltar ao painel</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Sair
        </Button>
        <div className="flex min-w-[220px] items-center gap-3 text-sm text-muted-foreground">
          <span>{reviewedCount}/{total}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      <section className="perspective-1000">
        <div
          className={`relative min-h-[430px] rounded-lg border border-border bg-card p-5 shadow-sm transition-transform duration-500 sm:p-8 ${revealed ? "scale-[1.01]" : ""}`}
        >
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="rounded-md bg-muted px-2 py-1">{activeCard.category_name || activeCard.custom_category || "Vocabulary"}</span>
            <span className="inline-flex items-center gap-1"><Flame className="h-3.5 w-3.5" /> confiança {activeCard.confidence_level}%</span>
          </div>

          <div className="flex min-h-[260px] flex-col items-center justify-center text-center">
            <p className="text-xs uppercase text-muted-foreground">Frente</p>
            <h2 className="mt-4 max-w-full break-words text-4xl font-bold sm:text-5xl">{activeCard.word}</h2>
            <VocabularyAudioButton
              audioUrl={activeCard.audio_url}
              audioFileUrl={activeCard.audio_file_url}
              text={activeCard.word}
              className="mt-4"
            />
          </div>

          {!revealed ? (
            <div className="flex justify-center">
              <Button size="lg" onClick={() => setRevealed(true)}>Revelar resposta</Button>
            </div>
          ) : (
            <div className="space-y-5 border-t border-border pt-5">
              <div className="mx-auto max-w-2xl space-y-3 text-center">
                <h3 className="text-2xl font-semibold">{activeCard.translation}</h3>
                {activeCard.explanation && <p className="text-sm leading-6 text-muted-foreground">{activeCard.explanation}</p>}
                {activeCard.example_sentence && <p className="rounded-lg bg-muted p-3 text-sm italic">{activeCard.example_sentence}</p>}
                <div className="flex justify-center">
                  <VocabularyAudioButton
                    audioUrl={activeCard.audio_url}
                    audioFileUrl={activeCard.audio_file_url}
                    text={activeCard.word}
                  />
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {(Object.keys(ratingCopy) as ReviewRating[]).map((rating) => (
                  <Button
                    key={rating}
                    variant="outline"
                    disabled={isReviewing}
                    className={ratingStyles[rating]}
                    onClick={() => submitReview(rating)}
                  >
                    {ratingCopy[rating]}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <RotateCcw className="h-3.5 w-3.5" />
        Espaço revela. Depois use 1, 2 ou 3 para responder.
      </div>
    </div>
  );
};

export default FlashcardReview;
