import { normalizeList } from "@/lib/schoolTypes";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Alert, Button, SkeletonCard } from "@/components/student/ui";
import FlashcardReview, { ReviewRating, VocabularyCard } from "@/components/FlashcardReview";

type Props = {
  onBack: () => void;
};

const ReviewQueue = ({ onBack }: Props) => {
  const queryClient = useQueryClient();
  const [reviewedIds, setReviewedIds] = useState<string[]>([]);

  const { data: queue = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["vocabulary-review-queue"],
    queryFn: async () => {
      const res = await api.get("/vocabulary-cards/queue/?limit=60");
      return normalizeList(res.data) as VocabularyCard[];
    },
    refetchInterval: 60_000,
  });

  const visibleQueue = useMemo(() => queue.filter((card) => !reviewedIds.includes(card.id)), [queue, reviewedIds]);

  const reviewMutation = useMutation({
    mutationFn: async ({ card, rating }: { card: VocabularyCard; rating: ReviewRating }) => {
      const res = await api.post(`/vocabulary-cards/${card.id}/review/`, { rating });
      return res.data;
    },
    onSuccess: (_, variables) => {
      setReviewedIds((current) => [...current, variables.card.id]);
      queryClient.invalidateQueries({ queryKey: ["vocabulary-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["vocabulary-cards"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-badges"] });
    },
  });

  if (isLoading) {
    return <SkeletonCard label="Preparando sua fila de revisão" lines={3} />;
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <Alert
          tone="danger"
          role="alert"
          title="Não carregamos sua fila de revisão."
          action={<Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>Tentar novamente</Button>}
        >
          Suas palavras continuam salvas. Tente novamente.
        </Alert>
        <Button type="button" variant="ghost" onClick={onBack}>Voltar ao painel</Button>
      </div>
    );
  }

  return (
    <FlashcardReview
      cards={visibleQueue}
      reviewedCount={reviewedIds.length}
      onBack={onBack}
      onReview={(card, rating) => reviewMutation.mutate({ card, rating })}
      isReviewing={reviewMutation.isPending}
    />
  );
};

export default ReviewQueue;
