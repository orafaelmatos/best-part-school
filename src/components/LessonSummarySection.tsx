import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Brain, Loader2, Save, Sparkles } from "lucide-react";

type SummaryWord = { id?: string; word: string; meaning: string };
type SummaryMistake = { id?: string; mistake: string; correction: string };
type SummaryTopic = { id?: string; topic: string };
type SummaryCard = { id: string; word: string; translation: string; difficulty_level?: string };

export type LessonSummary = {
  id: string;
  lesson: string;
  summary: string;
  homework: string;
  observations: string;
  words: SummaryWord[];
  mistakes: SummaryMistake[];
  next_topics: SummaryTopic[];
  flashcards: SummaryCard[];
};

const emptySummary: LessonSummary = {
  id: "",
  lesson: "",
  summary: "",
  homework: "",
  observations: "",
  words: [],
  mistakes: [],
  next_topics: [],
  flashcards: [],
};

const normalizeList = (data: any) => (Array.isArray(data) ? data : data?.results || []);

const LessonSummarySection = ({ lesson, notes }: { lesson: any; notes: string }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<LessonSummary>(emptySummary);
  const isTeacher = user?.role === "teacher" || user?.role === "admin";

  const { data: currentSummary, isLoading } = useQuery({
    queryKey: ["lesson-summary", lesson.id],
    queryFn: async () => {
      const res = await api.get(`/lesson-summaries/?lesson=${lesson.id}`);
      return normalizeList(res.data)[0] as LessonSummary | undefined;
    },
  });

  useEffect(() => {
    if (currentSummary) {
      setForm(currentSummary);
      return;
    }
    setForm((current) => (
      current.lesson === lesson.id
        ? current
        : { ...emptySummary, lesson: lesson.id }
    ));
  }, [currentSummary, lesson.id]);

  const sources = useMemo(() => {
    const newWords = lesson.new_words || [];
    const noteImages = (lesson.attachments || []).filter((attachment: any) => attachment.is_image);
    return {
      lessonContext: [lesson.title, lesson.template_title].filter(Boolean).join(" · "),
      words: newWords.map((word: any) => ({ word: word.word, meaning: word.meaning })),
      wordCount: newWords.length,
      imageCount: noteImages.length,
      imageNames: noteImages.map((attachment: any) => attachment.file_name).filter(Boolean).slice(0, 4),
    };
  }, [lesson]);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        notes,
        words: sources.words,
        language: "English",
        student_level: lesson.level,
        lesson_context: sources.lessonContext,
      };
      const res = await api.post(`/lessons/${lesson.id}/generate-summary/`, payload);
      return res.data as LessonSummary;
    },
    onSuccess: (data) => {
      setForm(data);
      queryClient.invalidateQueries({ queryKey: ["lesson-summary", lesson.id] });
      queryClient.invalidateQueries({ queryKey: ["lesson", lesson.id] });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.id) return null;
      const payload = {
        summary: form.summary,
        homework: form.homework,
        observations: form.observations,
        words: form.words,
        mistakes: form.mistakes,
        next_topics: form.next_topics,
      };
      const res = await api.put(`/lesson-summaries/${form.id}/`, payload);
      return res.data as LessonSummary;
    },
    onSuccess: (data) => {
      if (data) setForm(data);
      queryClient.invalidateQueries({ queryKey: ["lesson-summary", lesson.id] });
    },
  });

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="h-4 w-4 text-primary" /> Complemento do Contexto para IA
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            As anotações acima já entram automaticamente no contexto da IA. Este campo fica só com o complemento mais fácil para o professor revisar.
          </p>
        </div>
        {isTeacher && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
              {generateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
              {generateMutation.isPending ? "Gerando contexto..." : "Gerar contexto automático"}
            </Button>
            {form.id && (
              <Button variant="outline" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar edição
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="rounded-full border border-border bg-muted/40 px-3 py-1">
          Palavras novas: {sources.wordCount}
        </span>
        <span className="rounded-full border border-border bg-muted/40 px-3 py-1">
          Imagens anexadas: {sources.imageCount}
        </span>
        {form.flashcards.length > 0 && (
          <span className="rounded-full border border-border bg-muted/40 px-3 py-1">
            Cards do aluno nesta aula: {form.flashcards.length}
          </span>
        )}
      </div>

      {sources.imageNames.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Referências anexadas atuais: {sources.imageNames.join(", ")}
        </p>
      )}

      {isLoading && !form.id ? (
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      ) : form.id || isTeacher ? (
        <Textarea
          value={form.summary}
          readOnly={!isTeacher}
          onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))}
          placeholder="Clique em gerar para preencher apenas o complemento: palavras aprendidas, referências anexadas e observações."
          className="min-h-[320px] resize-y"
        />
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">
          O contexto desta aula ainda não foi sintetizado.
        </div>
      )}

      {form.flashcards.length > 0 && (
        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <h3 className="text-sm font-semibold">Cards vinculados ao aluno</h3>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {form.flashcards.map((card) => (
              <div key={card.id} className="rounded-lg border border-border bg-background p-3">
                <p className="text-sm font-semibold">{card.word}</p>
                <p className="mt-1 text-sm text-muted-foreground">{card.translation}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default LessonSummarySection;
