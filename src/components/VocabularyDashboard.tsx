import { FormEvent, useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Brain, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Alert, Button, Card, EmptyState, ProgressBar, Skeleton, inputClasses } from "@/components/student/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import ReviewQueue from "@/components/ReviewQueue";
import GenerateWordSentences from "@/components/GenerateWordSentences";

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

const tabClass = "min-h-11 whitespace-normal rounded-md px-2 text-center text-body font-medium text-ink data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-raised";
const textareaClass = cn(inputClasses, "py-3");

const normalizeList = <T,>(data: unknown): T[] => {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && "results" in data) {
    const results = (data as { results?: unknown }).results;
    if (Array.isArray(results)) return results as T[];
  }
  return [];
};

const VocabularyDashboard = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [reviewMode, setReviewMode] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [form, setForm] = useState<CardForm>(emptyForm);
  const [createMode, setCreateMode] = useState("manual");
  const formId = useId();

  const { data: stats, isLoading: statsLoading, isError: statsError, refetch: refetchStats } = useQuery({
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

  const totalWords = stats?.total_learned_words || 0;
  const dueToday = (stats?.due_today || 0) + (stats?.overdue || 0);
  const mastered = stats?.mastered || 0;
  const fieldClass = "space-y-1.5";
  const labelClass = "block text-body font-medium text-ink";

  return (
    <div className="space-y-6">
      <Card as="section" aria-labelledby={`${formId}-summary`}>
        <h2 id={`${formId}-summary`} className="sr-only">Resumo do vocabulário</h2>
        {statsLoading ? (
          <div role="status" aria-label="Carregando resumo" className="grid grid-cols-2 gap-4">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : statsError ? (
          <Alert
            tone="danger"
            role="alert"
            title="Não carregamos seu resumo."
            action={<Button type="button" variant="outline" size="sm" onClick={() => void refetchStats()}>Tentar novamente</Button>}
          >
            Suas palavras continuam salvas. Tente novamente.
          </Alert>
        ) : totalWords ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 divide-x divide-line">
              <div className="min-w-0 pr-4">
                <dt className="text-body text-ink-secondary">Palavras aprendidas</dt>
                <dd className="mt-1 text-h2 text-ink">{totalWords}</dd>
              </div>
              <div className="min-w-0 pl-4">
                <dt className="text-body text-ink-secondary">Para revisar hoje</dt>
                <dd className="mt-1 text-h2 text-ink">{dueToday}</dd>
              </div>
            </dl>
            <div className="space-y-2">
              <ProgressBar value={Math.min(mastered, totalWords)} max={totalWords} label="Palavras dominadas" tone="success" />
              <p className="text-caption text-ink-muted">{mastered} de {totalWords} dominadas</p>
            </div>
          </div>
        ) : (
          <EmptyState
            compact
            icon={BookOpen}
            title="Nenhuma palavra cadastrada ainda."
            description="Adicione uma palavra ou gere frases com IA para começar a revisar."
            className="pt-0"
          />
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Button type="button" size="lg" fullWidth onClick={() => setReviewMode(true)} disabled={!totalWords}>
            <Brain aria-hidden="true" />
            Revisar palavras agora
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            fullWidth
            onClick={() => { setCreateMode("manual"); setIsCreateDialogOpen(true); }}
          >
            <Plus aria-hidden="true" />
            Adicionar nova palavra
          </Button>
        </div>
        <p className="mt-3 text-caption text-ink-muted">
          As palavras e frases que você salvar ficam disponíveis na sua revisão.
        </p>
      </Card>

      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          setIsCreateDialogOpen(open);
          if (!open && !createMutation.isPending) {
            setForm(emptyForm);
            createMutation.reset();
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-h3 text-ink">Adicionar nova palavra</DialogTitle>
            <DialogDescription className="text-body text-ink-secondary">
              Cadastre uma palavra ou peça à IA frases com as palavras que você quer praticar.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={createMode} onValueChange={setCreateMode} className="min-w-0 space-y-4">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-lg bg-surface-muted p-1">
              <TabsTrigger value="manual" className={tabClass}>Cadastrar palavra</TabsTrigger>
              <TabsTrigger value="ai" className={tabClass}>Gerar frases com IA</TabsTrigger>
            </TabsList>
            <TabsContent value="manual">
              <form onSubmit={submitCard} className="grid gap-4 md:grid-cols-2">
                <div className={fieldClass}>
                  <label htmlFor={`${formId}-word`} className={labelClass}>Palavra em inglês</label>
                  <input id={`${formId}-word`} lang="en" required value={form.word} onChange={(event) => setForm({ ...form, word: event.target.value })} placeholder="Palavra ou expressão" className={inputClasses} />
                </div>
                <div className={fieldClass}>
                  <label htmlFor={`${formId}-translation`} className={labelClass}>Tradução em português</label>
                  <input id={`${formId}-translation`} required value={form.translation} onChange={(event) => setForm({ ...form, translation: event.target.value })} placeholder="Tradução" className={inputClasses} />
                </div>
                <div className={fieldClass}>
                  <label htmlFor={`${formId}-explanation`} className={labelClass}>Explicação</label>
                  <textarea id={`${formId}-explanation`} rows={3} value={form.explanation} onChange={(event) => setForm({ ...form, explanation: event.target.value })} placeholder="Quando e como usar" className={textareaClass} />
                </div>
                <div className={fieldClass}>
                  <label htmlFor={`${formId}-example`} className={labelClass}>Frase de exemplo</label>
                  <textarea id={`${formId}-example`} lang="en" rows={3} value={form.example_sentence} onChange={(event) => setForm({ ...form, example_sentence: event.target.value })} placeholder="Uma frase em inglês com a palavra" className={textareaClass} />
                </div>
                <div className={fieldClass}>
                  <label htmlFor={`${formId}-tags`} className={labelClass}>Tags</label>
                  <input id={`${formId}-tags`} value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="Tags separadas por vírgula" className={inputClasses} />
                </div>
                <div className={fieldClass}>
                  <label htmlFor={`${formId}-category`} className={labelClass}>Categoria</label>
                  <select id={`${formId}-category`} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className={inputClasses}>
                    <option value="">Categoria padrão</option>
                    {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </div>
                <div className={cn(fieldClass, "md:col-span-2")}>
                  <label htmlFor={`${formId}-custom-category`} className={labelClass}>Categoria personalizada</label>
                  <input id={`${formId}-custom-category`} value={form.custom_category} onChange={(event) => setForm({ ...form, custom_category: event.target.value })} placeholder="Opcional" className={inputClasses} />
                </div>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end md:col-span-2">
                  <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Criando..." : "Criar palavra"}
                  </Button>
                </div>
              </form>
            </TabsContent>
            <TabsContent value="ai">
              <GenerateWordSentences key={user?.user_id} vocabulary initiallyExpanded initialInput={form.word} />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VocabularyDashboard;
