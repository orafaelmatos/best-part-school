import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";

type QuickAddVocabularyCardDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFront?: string;
  initialBack?: string;
  lessonId?: string | null;
  sourceTag?: string;
  onCreated?: () => void;
};

type CardFormState = {
  word: string;
  translation: string;
};

const QuickAddVocabularyCardDialog = ({
  open,
  onOpenChange,
  initialFront = "",
  initialBack = "",
  lessonId,
  sourceTag,
  onCreated,
}: QuickAddVocabularyCardDialogProps) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<CardFormState>({
    word: initialFront,
    translation: initialBack,
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      word: initialFront,
      translation: initialBack,
    });
  }, [initialBack, initialFront, open]);

  const createMutation = useMutation({
    mutationFn: async () =>
      api.post("/vocabulary-cards/", {
        word: form.word.trim(),
        translation: form.translation.trim(),
        lesson: lessonId || null,
        tags: sourceTag ? [sourceTag] : [],
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["vocabulary-cards"] }),
        queryClient.invalidateQueries({ queryKey: ["vocabulary-dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["sidebar-badges"] }),
      ]);
      toast({
        title: "Card salvo",
        description: "A palavra ja apareceu em Palavras Aprendidas para voce revisar depois.",
      });
      onOpenChange(false);
      onCreated?.();
    },
    onError: () => {
      toast({
        title: "Nao foi possivel salvar o card",
        description: "Tente novamente em instantes.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!form.word.trim() || !form.translation.trim() || createMutation.isPending) return;
    createMutation.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (createMutation.isPending) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Card: adicionar nova palavra</DialogTitle>
          <DialogDescription>
            Registre a frente e o verso sem sair do estudo com a IA.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="quick-card-front" className="text-sm font-medium text-foreground">
              Frente do card
            </label>
            <Input
              id="quick-card-front"
              autoFocus
              value={form.word}
              onChange={(event) => setForm((current) => ({ ...current, word: event.target.value }))}
              placeholder="Ex: dining out"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="quick-card-back" className="text-sm font-medium text-foreground">
              Verso do card
            </label>
            <Input
              id="quick-card-back"
              value={form.translation}
              onChange={(event) => setForm((current) => ({ ...current, translation: event.target.value }))}
              placeholder="Ex: comer fora"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!form.word.trim() || !form.translation.trim() || createMutation.isPending}>
            {createMutation.isPending ? "Salvando..." : "Salvar card"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default QuickAddVocabularyCardDialog;
