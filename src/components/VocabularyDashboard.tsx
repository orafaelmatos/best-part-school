import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Brain, CalendarClock, Flame, Plus, Search, Star, Target, Trophy } from "lucide-react";
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
import { VocabularyCard } from "@/components/FlashcardReview";
import VocabularyAudioButton from "@/components/VocabularyAudioButton";

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

const emptyForm: CardForm = {
  word: "",
  translation: "",
  explanation: "",
  example_sentence: "",
  tags: "",
  category: "",
  custom_category: "",
};

const normalizeList = (data: any) => Array.isArray(data) ? data : (data?.results || []);

const filters = [
  { value: "active", label: "Ativos" },
  { value: "due", label: "Para revisar" },
  { value: "difficult", label: "Difíceis" },
  { value: "mastered", label: "Dominados" },
  { value: "favorite", label: "Favoritos" },
  { value: "archived", label: "Arquivados" },
] as const;

const VocabularyDashboard = () => {
  const queryClient = useQueryClient();
  const [reviewMode, setReviewMode] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof filters)[number]["value"]>("active");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [revealedCardIds, setRevealedCardIds] = useState<string[]>([]);
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
      return normalizeList(res.data) as Category[];
    },
  });

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ["vocabulary-cards"],
    queryFn: async () => {
      const res = await api.get("/vocabulary-cards/?ordering=next_review_at");
      return normalizeList(res.data) as VocabularyCard[];
    },
    refetchInterval: 60_000,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => api.post("/vocabulary-cards/", payload),
    onSuccess: () => {
      setForm(emptyForm);
      setIsCreateDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["vocabulary-cards"] });
      queryClient.invalidateQueries({ queryKey: ["vocabulary-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-badges"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ card, payload }: { card: VocabularyCard; payload: Partial<VocabularyCard> }) => api.patch(`/vocabulary-cards/${card.id}/`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vocabulary-cards"] });
      queryClient.invalidateQueries({ queryKey: ["vocabulary-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-badges"] });
    },
  });

  const filteredCards = useMemo(() => {
    const now = Date.now();
    const search = query.trim().toLowerCase();
    return cards.filter((card) => {
      const categoryName = card.category_name || card.custom_category || "";
      const matchesSearch = !search || [card.word, card.translation, card.explanation, card.example_sentence, categoryName, ...(card.tags || [])].some((value) => String(value || "").toLowerCase().includes(search));
      const matchesCategory = categoryFilter === "all" || categoryName === categoryFilter;
      const matchesFilter =
        filter === "active" ? !card.archived :
        filter === "archived" ? card.archived :
        filter === "favorite" ? card.favorite && !card.archived :
        filter === "mastered" ? card.mastered && !card.archived :
        filter === "difficult" ? !card.archived && (card.difficulty_level === "weak" || card.confidence_level < 45) :
        !card.archived && new Date(card.next_review_at).getTime() <= now;
      return matchesSearch && matchesCategory && matchesFilter;
    });
  }, [cards, categoryFilter, filter, query]);

  const categoryNames = useMemo(() => {
    const cardCategories = cards.map((card) => card.category_name || card.custom_category).filter(Boolean) as string[];
    return Array.from(new Set([...categories.map((item) => item.name), ...cardCategories]));
  }, [cards, categories]);

  const submitCard = (event: FormEvent) => {
    event.preventDefault();
    createMutation.mutate({
      ...form,
      tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      category: form.category || null,
    });
  };

  const toggleReveal = (cardId: string) => {
    setRevealedCardIds((current) =>
      current.includes(cardId) ? current.filter((item) => item !== cardId) : [...current, cardId],
    );
  };

  if (reviewMode) return <ReviewQueue onBack={() => setReviewMode(false)} />;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Para hoje" value={(stats?.due_today || 0) + (stats?.overdue || 0)} icon={CalendarClock} tone={stats?.overdue ? "danger" : "default"} />
        <StatTile label="Difíceis" value={stats?.difficult || 0} icon={Flame} tone="warning" />
        <StatTile label="Dominados" value={stats?.mastered || 0} icon={Trophy} tone="success" />
        <StatTile label="Sequência" value={`${stats?.study_streak || 0}d`} icon={Target} />
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar palavra, tradução, tag..." className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
          <option value="all">Todas as categorias</option>
          {categoryNames.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <Button onClick={() => setReviewMode(true)} disabled={!((stats?.due_today || 0) + (stats?.overdue || 0))}>
          <Brain className="mr-2 h-4 w-4" /> Revisar agora
        </Button>
        <Button variant="outline" onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Novo card
        </Button>
      </div>

      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          setIsCreateDialogOpen(open);
          if (!open && !createMutation.isPending) setForm(emptyForm);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Novo card</DialogTitle>
            <DialogDescription>
              Cadastre a frente e a resposta do card. O áudio de pronúncia é gerado automaticamente na revisão.
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
                {createMutation.isPending ? "Criando..." : "Criar card"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap gap-2">
        {filters.map((item) => (
          <button key={item.value} onClick={() => setFilter(item.value)} className={`rounded-lg px-3 py-2 text-sm font-medium sidebar-transition ${filter === item.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
            {item.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando cards...</p>
      ) : filteredCards.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">Nenhum card encontrado com esses filtros.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredCards.map((card) => {
            const isRevealed = revealedCardIds.includes(card.id);

            return (
            <article key={card.id} className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">{card.category_name || card.custom_category || "Vocabulary"}</p>
                  <h3 className="mt-1 break-words text-lg font-semibold">{card.word}</h3>
                </div>
                <button onClick={() => updateMutation.mutate({ card, payload: { favorite: !card.favorite } })} className={`rounded-lg p-2 sidebar-transition ${card.favorite ? "bg-amber-100 text-amber-700" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`} title="Favoritar">
                  <Star className="h-4 w-4" fill={card.favorite ? "currentColor" : "none"} />
                </button>
              </div>
              {isRevealed ? (
                <div className="space-y-3 rounded-lg border border-border bg-muted/40 px-3 py-4">
                  <p className="text-sm font-medium text-foreground">{card.translation}</p>
                  {card.explanation && <p className="text-sm text-muted-foreground">{card.explanation}</p>}
                  {card.example_sentence && <p className="rounded-lg bg-background px-3 py-2 text-sm italic text-muted-foreground">{card.example_sentence}</p>}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-4 text-sm text-muted-foreground">
                  Resposta escondida até você revelar o card.
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="rounded-md bg-muted px-2 py-1">{card.difficulty_level}</span>
                <span className="rounded-md bg-muted px-2 py-1">{card.interval_days}d</span>
                <span className="rounded-md bg-muted px-2 py-1">{card.confidence_level}%</span>
                {(card.tags || []).map((tag) => <span key={tag} className="rounded-md bg-muted px-2 py-1">{tag}</span>)}
              </div>
              <div className="mt-4 flex gap-2">
                <VocabularyAudioButton
                  audioUrl={card.audio_url}
                  audioFileUrl={card.audio_file_url}
                  text={card.word}
                  className="flex-1 justify-center"
                  label="Ouvir"
                />
                {/* <Button className="flex-1" variant="outline" onClick={() => toggleReveal(card.id)}>
                  {isRevealed ? "Esconder" : "Revelar"}
                </Button> */}
                <Button variant="ghost" onClick={() => updateMutation.mutate({ card, payload: { archived: !card.archived } })}>
                  <Archive className="h-4 w-4" />
                </Button>
              </div>
            </article>
          )})}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{stats?.total_learned_words || 0}</span> cards ativos · precisão recente <span className="font-medium text-foreground">{stats?.review_accuracy || 0}%</span> · {stats?.reviewed_30_days || 0} revisões em 30 dias
      </div>
    </div>
  );
};

const StatTile = ({ label, value, icon: Icon, tone = "default" }: { label: string; value: number | string; icon: typeof Brain; tone?: "default" | "danger" | "warning" | "success" }) => {
  const toneClass = tone === "danger" ? "text-red-600" : tone === "warning" ? "text-amber-600" : tone === "success" ? "text-emerald-600" : "text-muted-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className={`h-4 w-4 ${toneClass}`} />
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
};

export default VocabularyDashboard;
