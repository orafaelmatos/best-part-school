import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import ReviewQueue from "@/components/ReviewQueue";

type VocabularyStats = {
  due_today: number;
  overdue: number;
  mastered: number;
  difficult: number;
  study_streak: number;
  review_accuracy: number;
  total_learned_words: number;
  reviewed_30_days: number;
};

type Category = {
  id: string;
  name: string;
  slug: string;
  is_default: boolean;
};

type CardForm = {
  word: string;
  translation: string;
  explanation: string;
  example_sentence: string;
  tags: string;
  category: string;
  custom_category: string;
};

type CreateVocabularyCardPayload = Omit<CardForm, "tags" | "category"> & {
  tags: string[];
  category: string | null;
};

const emptyForm: CardForm = {
  word: "",
  translation: "",
  explanation: "",
  example_sentence: "",
  tags: "",
  category: "",
  custom_category: "",
};

const normalizeList = <T,>(data: unknown): T[] => {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && "results" in data) {
    const results = (data as { results?: unknown }).results;
    if (Array.isArray(results)) return results as T[];
  }
  return [];
};

const VocabularyDashboard = () => {
  const queryClient = useQueryClient();
  const [reviewMode, setReviewMode] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [form, setForm] = useState<CardForm>(emptyForm);

  const { data: stats } = useQuery({
    queryKey: ["vocabulary-dashboard"],
    queryFn: async () => {
      const res = await api.get("/vocabulary-cards/dashboard/");
      return res.data as VocabularyStats;
    },
    refetchInterval: 60_000,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["vocabulary-categories"],
    queryFn: async () => {
      const res = await api.get("/vocabulary-categories/");
      return normalizeList<Category>(res.data);
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: CreateVocabularyCardPayload) => api.post("/vocabulary-cards/", payload),
    onSuccess: () => {
      setForm(emptyForm);
      setIsCreateDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["vocabulary-cards"] });
      queryClient.invalidateQueries({ queryKey: ["vocabulary-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-badges"] });
    },
  });

  const submitCard = (event: FormEvent) => {
    event.preventDefault();
    createMutation.mutate({
      ...form,
      tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      category: form.category || null,
    });
  };

  if (reviewMode) return <ReviewQueue onBack={() => setReviewMode(false)} />;

  return (
    <div className="space-y-6">
      <section className="rounded-[26px] border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="grid gap-3 md:grid-cols-2">
          <Button
            size="lg"
            className="h-auto min-h-[88px] justify-start rounded-2xl px-5 py-5 text-left text-base shadow-sm"
            onClick={() => setReviewMode(true)}
            disabled={!stats?.total_learned_words}
          >
            <Brain className="mr-3 h-6 w-6 shrink-0" />
            <span>
              <span className="block text-lg font-semibold">Revisar palavras agora</span>
              <span className="mt-1 block text-sm font-normal opacity-85">
                {stats?.total_learned_words
                  ? `${(stats?.due_today || 0) + (stats?.overdue || 0)} para hoje`
                  : "Adicione uma palavra para começar"}
              </span>
            </span>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-auto min-h-[88px] justify-start rounded-2xl px-5 py-5 text-left text-base"
            onClick={() => setIsCreateDialogOpen(true)}
          >
            <Plus className="mr-3 h-6 w-6 shrink-0" />
            <span>
              <span className="block text-lg font-semibold">Adicionar nova palavra</span>
              <span className="mt-1 block text-sm font-normal text-muted-foreground">Crie uma palavra para estudar depois.</span>
            </span>
          </Button>
        </div>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          As palavras aparecem dentro da revisão. Fora dela, a tela fica focada no que o aluno precisa fazer agora.
        </p>
      </section>

      {!stats?.total_learned_words ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/25 p-6 text-sm text-muted-foreground">
          Nenhuma palavra cadastrada ainda.
        </div>
      ) : null}

      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          setIsCreateDialogOpen(open);
          if (!open && !createMutation.isPending) setForm(emptyForm);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Adicionar nova palavra</DialogTitle>
            <DialogDescription>
              Cadastre a palavra e a resposta. O áudio de pronúncia é gerado automaticamente na revisão.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submitCard} className="grid gap-4 md:grid-cols-2">
            <input required value={form.word} onChange={(event) => setForm({ ...form, word: event.target.value })} placeholder="Palavra ou expressão" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <input required value={form.translation} onChange={(event) => setForm({ ...form, translation: event.target.value })} placeholder="Tradução" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <Textarea value={form.explanation} onChange={(event) => setForm({ ...form, explanation: event.target.value })} placeholder="Explicação" />
            <Textarea value={form.example_sentence} onChange={(event) => setForm({ ...form, example_sentence: event.target.value })} placeholder="Frase de exemplo" />
            <input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="Tags separadas por vírgula" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">Categoria padrão</option>
              {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <input value={form.custom_category} onChange={(event) => setForm({ ...form, custom_category: event.target.value })} placeholder="Categoria customizada" className="rounded-lg border border-border bg-background px-3 py-2 text-sm md:col-span-2" />
            <DialogFooter className="md:col-span-2">
              <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Criando..." : "Criar palavra"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VocabularyDashboard;
