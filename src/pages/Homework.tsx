import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import HomeworkQuestionMedia from "@/components/HomeworkQuestionMedia";
import PageHeader from "@/components/PageHeader";
import VocabularyDashboard from "@/components/VocabularyDashboard";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Clock,
  RotateCcw,
  Search,
  Send,
  Shuffle,
  Star,
  Tag,
  Volume2,
} from "lucide-react";

type QuestionType = "open_text" | "multiple_choice";
type ApiHomeworkStatus = "draft" | "pending" | "sent" | "corrected";
type UiHomeworkStatus = "pending" | "sent" | "late" | "corrected";

type HomeworkQuestion = {
  id: string;
  type: QuestionType;
  prompt: string;
  image_url?: string | null;
  audio_url?: string | null;
  audio_transcript?: string;
  options: string[];
  order: number;
};

type HomeworkAnswer = {
  id?: string;
  question: string;
  answer_text?: string;
  selected_option_index?: number | null;
  teacher_feedback?: string;
};

type HomeworkItem = {
  id: string;
  title: string;
  description?: string;
  classification?: string;
  status: ApiHomeworkStatus;
  due_date?: string | null;
  teacher_feedback?: string;
  teacher_name?: string;
  lesson_title?: string;
  questions: HomeworkQuestion[];
  answers?: HomeworkAnswer[];
};

type LessonWord = {
  id: string;
  word: string;
  meaning: string;
  status?: "hard" | "medium" | "easy" | null;
  category?: string;
  tags?: string[] | string;
  explanation?: string;
  example?: string;
  audio_url?: string;
};

type VocabularyCard = LessonWord & {
  lessonTitle?: string;
  teacherName?: string;
};

const statusCopy: Record<UiHomeworkStatus, string> = {
  pending: "Pendente",
  sent: "Enviada",
  late: "Atrasada",
  corrected: "Corrigida",
};

const statusStyles: Record<UiHomeworkStatus, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  sent: "bg-blue-50 text-blue-700 border-blue-200",
  late: "bg-red-50 text-red-700 border-red-200",
  corrected: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const defaultCategories = ["gramática", "vocabulário", "phrasal verbs", "expressões", "pronúncia"];

const normalizeList = (data: any) => Array.isArray(data) ? data : (data?.results || []);

const getHomeworkStatus = (homework: HomeworkItem): UiHomeworkStatus => {
  if (homework.status === "corrected") return "corrected";
  if (homework.status === "sent") return "sent";
  if (homework.due_date && new Date(homework.due_date).getTime() < Date.now()) return "late";
  return "pending";
};

const formatDate = (value?: string | null) => {
  if (!value) return "Sem prazo";
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
};

const isDueSoon = (value?: string | null) => {
  if (!value) return false;
  const diff = new Date(value).getTime() - Date.now();
  return diff > 0 && diff <= 1000 * 60 * 60 * 48;
};

const tagsFromCard = (card: VocabularyCard) => {
  if (Array.isArray(card.tags)) return card.tags;
  if (typeof card.tags === "string" && card.tags.trim()) return card.tags.split(",").map((tag) => tag.trim());
  return card.lessonTitle ? [card.lessonTitle] : [];
};

const Homework = () => {
  const [tab, setTab] = useState<"lessons" | "words">("lessons");

  return (
    <DashboardLayout>
      <PageHeader title="Homework" description="Lições de casa, palavras aprendidas e acompanhamento de estudos." />

      <div className="mb-6 flex flex-wrap gap-2 border-b border-border">
        <button
          onClick={() => setTab("lessons")}
          className={`px-4 py-3 text-sm font-medium border-b-2 sidebar-transition ${tab === "lessons" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Lições de Casa
        </button>
        <button
          onClick={() => setTab("words")}
          className={`px-4 py-3 text-sm font-medium border-b-2 sidebar-transition ${tab === "words" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Palavras Aprendidas
        </button>
      </div>

      {tab === "lessons" ? <HomeworkLessons /> : <VocabularyDashboard />}
    </DashboardLayout>
  );
};

const HomeworkLessons = () => {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"all" | UiHomeworkStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedHomework, setSelectedHomework] = useState<HomeworkItem | null>(null);
  const [answers, setAnswers] = useState<Record<string, HomeworkAnswer>>({});

  const { data: homeworkItems = [], isLoading } = useQuery({
    queryKey: ["student-homework"],
    queryFn: async () => {
      const res = await api.get("/homework/?ordering=due_date");
      return normalizeList(res.data) as HomeworkItem[];
    },
  });

  const categories = useMemo(() => {
    const values = homeworkItems.map((item) => item.classification).filter(Boolean) as string[];
    return Array.from(new Set(values));
  }, [homeworkItems]);

  const pendingCount = homeworkItems.filter((item) => getHomeworkStatus(item) === "pending").length;

  const filteredHomework = useMemo(() => {
    return homeworkItems
      .filter((item) => statusFilter === "all" || getHomeworkStatus(item) === statusFilter)
      .filter((item) => categoryFilter === "all" || item.classification === categoryFilter)
      .sort((a, b) => {
        const aDate = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER;
        const bDate = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER;
        return aDate - bDate;
      });
  }, [categoryFilter, homeworkItems, statusFilter]);

  const submitMutation = useMutation({
    mutationFn: async (homework: HomeworkItem) => {
      const payload = homework.questions.map((question) => ({
        question: question.id,
        answer_text: answers[question.id]?.answer_text || "",
        selected_option_index: answers[question.id]?.selected_option_index ?? null,
      }));
      return api.post(`/homework/${homework.id}/submit_answers/`, { answers: payload });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-homework"] });
      setSelectedHomework(null);
      setAnswers({});
    },
  });

  const openHomework = (homework: HomeworkItem) => {
    const currentAnswers: Record<string, HomeworkAnswer> = {};
    homework.answers?.forEach((answer) => {
      currentAnswers[answer.question] = answer;
    });
    setAnswers(currentAnswers);
    setSelectedHomework(homework);
  };

  if (selectedHomework) {
    const uiStatus = getHomeworkStatus(selectedHomework);
    const canAnswer = uiStatus === "pending" || uiStatus === "late" || uiStatus === "sent";

    return (
      <div className="space-y-5">
        <button onClick={() => setSelectedHomework(null)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={16} /> Voltar para lições
        </button>

        <section className="border border-border rounded-xl bg-card p-5 space-y-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className={`rounded-md border px-2 py-1 text-xs font-medium ${statusStyles[uiStatus]}`}>{statusCopy[uiStatus]}</span>
                {selectedHomework.classification && <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{selectedHomework.classification}</span>}
              </div>
              <h2 className="text-xl font-semibold">{selectedHomework.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedHomework.teacher_name || "Professor"} · entrega {formatDate(selectedHomework.due_date)}
              </p>
              {selectedHomework.description && <p className="mt-4 text-sm leading-6 whitespace-pre-wrap">{selectedHomework.description}</p>}
            </div>
          </div>

          <div className="space-y-4">
            {selectedHomework.questions.map((question, index) => (
              <div key={question.id} className="rounded-lg border border-border bg-background p-4">
                <p className="mb-3 whitespace-pre-wrap text-sm font-semibold leading-6">{index + 1}. {question.prompt}</p>
                <HomeworkQuestionMedia
                  className="mb-3"
                  imageUrl={question.image_url}
                  audioUrl={question.audio_url}
                />
                {canAnswer ? (
                  question.type === "open_text" ? (
                    <Textarea
                      value={answers[question.id]?.answer_text || ""}
                      onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: { ...current[question.id], question: question.id, answer_text: event.target.value } }))}
                      placeholder="Digite sua resposta..."
                    />
                  ) : (
                    <div className="space-y-2">
                      {question.options.map((option, optionIndex) => (
                        <label key={optionIndex} className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/50">
                          <input
                            type="radio"
                            name={`answer-${question.id}`}
                            checked={answers[question.id]?.selected_option_index === optionIndex}
                            onChange={() => setAnswers((current) => ({ ...current, [question.id]: { ...current[question.id], question: question.id, selected_option_index: optionIndex } }))}
                          />
                          <span className="whitespace-pre-wrap leading-6">{option}</span>
                        </label>
                      ))}
                    </div>
                  )
                ) : (
                  <AnswerPreview question={question} answer={answers[question.id]} />
                )}
                {uiStatus === "corrected" && answers[question.id]?.teacher_feedback && (
                  <p className="mt-3 rounded-lg bg-muted p-3 text-sm text-muted-foreground">Feedback: {answers[question.id].teacher_feedback}</p>
                )}
              </div>
            ))}
          </div>

          {uiStatus === "sent" && (
            <p className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              Você pode editar e reenviar este homework. O professor verá sempre a versão mais atual.
            </p>
          )}

          {uiStatus === "corrected" && selectedHomework.teacher_feedback && (
            <div className="rounded-lg border border-border bg-muted/50 p-4">
              <p className="text-sm font-semibold">Feedback geral do professor</p>
              <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{selectedHomework.teacher_feedback}</p>
            </div>
          )}

          {canAnswer && (
            <Button onClick={() => submitMutation.mutate(selectedHomework)} disabled={submitMutation.isPending}>
              <Send className="mr-2 h-4 w-4" /> {submitMutation.isPending ? "Enviando..." : uiStatus === "sent" ? "Atualizar atividade" : "Enviar atividade"}
            </Button>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile label="Pendentes" value={pendingCount} icon={Clock} />
        <SummaryTile label="Atrasadas" value={homeworkItems.filter((item) => getHomeworkStatus(item) === "late").length} icon={CalendarClock} />
        <SummaryTile label="Corrigidas" value={homeworkItems.filter((item) => getHomeworkStatus(item) === "corrected").length} icon={CheckCircle2} />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {(["all", "pending", "late", "corrected"] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`rounded-lg px-3 py-2 text-sm font-medium sidebar-transition ${statusFilter === status ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
            >
              {status === "all" ? "Todas" : statusCopy[status]}
            </button>
          ))}
        </div>
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
          <option value="all">Todas as categorias</option>
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando lições...</p>
      ) : filteredHomework.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Nenhuma lição encontrada com esses filtros.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredHomework.map((homework) => {
            const uiStatus = getHomeworkStatus(homework);
            return (
              <button key={homework.id} onClick={() => openHomework(homework)} className="text-left rounded-xl border border-border bg-card p-5 shadow-sm sidebar-transition hover:shadow-md">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="mb-2 flex flex-wrap gap-2">
                      <span className={`rounded-md border px-2 py-1 text-xs font-medium ${statusStyles[uiStatus]}`}>{statusCopy[uiStatus]}</span>
                      {isDueSoon(homework.due_date) && <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">Vence em breve</span>}
                    </div>
                    <h3 className="font-semibold">{homework.title}</h3>
                  </div>
                  <BookOpen className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">{homework.description || "Sem descrição."}</p>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                  <span>{homework.teacher_name || "Professor"}</span>
                  <span>{formatDate(homework.due_date)}</span>
                  {homework.classification && <span className="inline-flex items-center gap-1"><Tag size={13} /> {homework.classification}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const VocabularyReview = () => {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [tag, setTag] = useState("all");
  const [reviewFilter, setReviewFilter] = useState<"all" | "favorite" | "reviewed" | "unreviewed">("all");
  const [favorites, setFavorites] = useState<string[]>(() => JSON.parse(localStorage.getItem("vocabulary:favorites") || "[]"));
  const [reviewed, setReviewed] = useState<string[]>(() => JSON.parse(localStorage.getItem("vocabulary:reviewed") || "[]"));
  const [studyMode, setStudyMode] = useState(false);
  const [studyIndex, setStudyIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const { data: lessons = [], isLoading } = useQuery({
    queryKey: ["homework-vocabulary-lessons"],
    queryFn: async () => {
      const res = await api.get("/lessons/?all=true");
      return normalizeList(res.data);
    },
  });

  const cards = useMemo(() => {
    return lessons.flatMap((lesson: any) => (lesson.new_words || []).map((word: LessonWord) => ({
      ...word,
      category: word.category || "vocabulário",
      lessonTitle: lesson.title,
      teacherName: lesson.teacher_name,
    }))) as VocabularyCard[];
  }, [lessons]);

  const categories = useMemo(() => Array.from(new Set([...defaultCategories, ...cards.map((card) => card.category || "vocabulário")])), [cards]);
  const tags = useMemo(() => Array.from(new Set(cards.flatMap(tagsFromCard))), [cards]);

  const filteredCards = useMemo(() => {
    const lowerQuery = query.toLowerCase();
    return cards.filter((card) => {
      const cardTags = tagsFromCard(card);
      const isReviewed = reviewed.includes(card.id) || Boolean(card.status);
      const matchesReview =
        reviewFilter === "all" ||
        (reviewFilter === "favorite" && favorites.includes(card.id)) ||
        (reviewFilter === "reviewed" && isReviewed) ||
        (reviewFilter === "unreviewed" && !isReviewed);

      return (
        matchesReview &&
        (category === "all" || card.category === category) &&
        (tag === "all" || cardTags.includes(tag)) &&
        (!lowerQuery || card.word.toLowerCase().includes(lowerQuery) || card.meaning.toLowerCase().includes(lowerQuery))
      );
    });
  }, [cards, category, favorites, query, reviewed, reviewFilter, tag]);

  const persistFavorites = (next: string[]) => {
    setFavorites(next);
    localStorage.setItem("vocabulary:favorites", JSON.stringify(next));
  };

  const persistReviewed = (next: string[]) => {
    setReviewed(next);
    localStorage.setItem("vocabulary:reviewed", JSON.stringify(next));
  };

  const markReviewed = (id: string) => {
    if (!reviewed.includes(id)) persistReviewed([...reviewed, id]);
  };

  const toggleFavorite = (id: string) => {
    persistFavorites(favorites.includes(id) ? favorites.filter((item) => item !== id) : [...favorites, id]);
  };

  const shuffleCards = () => {
    if (filteredCards.length < 2) return;
    setStudyIndex(Math.floor(Math.random() * filteredCards.length));
    setFlipped(false);
  };

  if (studyMode) {
    const activeCard = filteredCards[studyIndex] || filteredCards[0];
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" onClick={() => setStudyMode(false)}><ArrowLeft className="mr-2 h-4 w-4" /> Sair do estudo</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={shuffleCards}><Shuffle className="mr-2 h-4 w-4" /> Embaralhar</Button>
            <Button variant="outline" onClick={() => setFlipped(false)}><RotateCcw className="mr-2 h-4 w-4" /> Frente</Button>
          </div>
        </div>
        {activeCard ? (
          <section className="mx-auto flex min-h-[360px] max-w-3xl flex-col justify-between rounded-xl border border-border bg-card p-8 text-center shadow-sm" onClick={() => setFlipped((value) => !value)}>
            {!flipped ? (
              <div className="m-auto">
                <p className="text-sm uppercase tracking-wide text-muted-foreground">{activeCard.category}</p>
                <h2 className="mt-4 text-4xl font-bold">{activeCard.word}</h2>
              </div>
            ) : (
              <div className="m-auto max-w-2xl space-y-4">
                <h2 className="text-3xl font-bold">{activeCard.meaning}</h2>
                {activeCard.explanation && <p className="text-sm text-muted-foreground">{activeCard.explanation}</p>}
                {activeCard.example && <p className="rounded-lg bg-muted p-4 text-sm italic">{activeCard.example}</p>}
              </div>
            )}
            <div className="mt-8 flex items-center justify-between gap-3">
              <Button variant="outline" onClick={(event) => { event.stopPropagation(); setStudyIndex((index) => Math.max(0, index - 1)); setFlipped(false); }} disabled={studyIndex === 0}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Anterior
              </Button>
              <Button onClick={(event) => { event.stopPropagation(); markReviewed(activeCard.id); }}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Revisado
              </Button>
              <Button variant="outline" onClick={(event) => { event.stopPropagation(); setStudyIndex((index) => Math.min(filteredCards.length - 1, index + 1)); setFlipped(false); }} disabled={studyIndex >= filteredCards.length - 1}>
                Próximo <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </section>
        ) : (
          <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Nenhum card disponível para estudar.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar palavra ou expressão..." className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
          <option value="all">Todas as categorias</option>
          {categories.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={tag} onChange={(event) => setTag(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
          <option value="all">Todas as tags</option>
          {tags.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <Button onClick={() => { setStudyMode(true); setStudyIndex(0); setFlipped(false); }} disabled={filteredCards.length === 0}>Modo flashcard</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "favorite", "reviewed", "unreviewed"] as const).map((filter) => (
          <button key={filter} onClick={() => setReviewFilter(filter)} className={`rounded-lg px-3 py-2 text-sm font-medium sidebar-transition ${reviewFilter === filter ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
            {filter === "all" ? "Todos" : filter === "favorite" ? "Favoritos" : filter === "reviewed" ? "Revisados" : "Não revisados"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando palavras...</p>
      ) : filteredCards.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Nenhum card encontrado com esses filtros.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredCards.map((card) => {
            const cardTags = tagsFromCard(card);
            const isReviewed = reviewed.includes(card.id) || Boolean(card.status);
            return (
              <article key={card.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{card.category || "vocabulário"}</p>
                    <h3 className="mt-1 text-lg font-semibold">{card.word}</h3>
                  </div>
                  <button onClick={() => toggleFavorite(card.id)} className={`rounded-lg p-2 sidebar-transition ${favorites.includes(card.id) ? "bg-amber-100 text-amber-700" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`} title="Favoritar">
                    <Star className="h-4 w-4" fill={favorites.includes(card.id) ? "currentColor" : "none"} />
                  </button>
                </div>
                <p className="text-sm font-medium">{card.meaning}</p>
                {card.explanation && <p className="mt-2 text-sm text-muted-foreground">{card.explanation}</p>}
                {card.example && <p className="mt-3 rounded-lg bg-muted p-3 text-sm italic">{card.example}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  {card.audio_url && <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"><Volume2 size={13} /> áudio</span>}
                  {cardTags.map((item) => <span key={item} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{item}</span>)}
                  {isReviewed && <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-700">revisado</span>}
                </div>
                <Button className="mt-4 w-full" variant={isReviewed ? "outline" : "default"} onClick={() => markReviewed(card.id)}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Marcar como revisado
                </Button>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

const SummaryTile = ({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Clock }) => (
  <div className="rounded-xl border border-border bg-card p-4">
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">{label}</p>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </div>
    <p className="mt-2 text-2xl font-bold">{value}</p>
  </div>
);

const AnswerPreview = ({ question, answer }: { question: HomeworkQuestion; answer?: HomeworkAnswer }) => {
  if (!answer) return <p className="text-sm text-muted-foreground">Sem resposta enviada.</p>;
  if (question.type === "multiple_choice") {
    const selected = answer.selected_option_index;
    return <p className="whitespace-pre-wrap text-sm leading-6">{selected === null || selected === undefined ? "Sem opção selecionada." : question.options[selected] || "Opção não encontrada."}</p>;
  }
  return <p className="whitespace-pre-wrap text-sm leading-6">{answer.answer_text || "Sem resposta enviada."}</p>;
};

export default Homework;
