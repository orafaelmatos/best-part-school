import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Brain, Loader2, Save, Sparkles } from "lucide-react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";

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

const hasHtmlTags = (value: string) => /<\/?[a-z][\s\S]*>/i.test(value);

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const formatInlineMarkdown = (value: string) => {
  let text = escapeHtml(value);
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__(.+?)__/g, "<strong>$1</strong>");
  text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
  text = text.replace(/_(.+?)_/g, "<em>$1</em>");
  return text;
};

const normalizeRichTextValue = (value?: string) => {
  const source = (value || "").trim();
  if (!source || hasHtmlTags(source)) {
    return source;
  }

  const blocks: string[] = [];
  let paragraphLines: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (!paragraphLines.length) return;
    blocks.push(`<p>${paragraphLines.join("<br />")}</p>`);
    paragraphLines = [];
  };

  const flushList = () => {
    if (!listType || !listItems.length) return;
    blocks.push(`<${listType}>${listItems.map((item) => `<li>${item}</li>`).join("")}</${listType}>`);
    listType = null;
    listItems = [];
  };

  source.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      return;
    }

    const heading = line.match(/^(#{1,2})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push(`<h${heading[1].length}>${formatInlineMarkdown(heading[2])}</h${heading[1].length}>`);
      return;
    }

    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (listType !== "ul") flushList();
      listType = "ul";
      listItems.push(formatInlineMarkdown(unordered[1]));
      return;
    }

    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (listType !== "ol") flushList();
      listType = "ol";
      listItems.push(formatInlineMarkdown(ordered[1]));
      return;
    }

    if (/^[^:]{1,80}:$/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push(`<h2>${formatInlineMarkdown(line.slice(0, -1))}</h2>`);
      return;
    }

    flushList();
    paragraphLines.push(formatInlineMarkdown(line));
  });

  flushParagraph();
  flushList();

  return blocks.join("");
};

const prepareSummaryForEditor = (summary: LessonSummary): LessonSummary => ({
  ...summary,
  summary: normalizeRichTextValue(summary.summary),
});

const LessonSummarySection = ({
  lesson,
  notes,
  onUpdated,
}: {
  lesson: any;
  notes: string;
  onUpdated?: () => void;
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const summaryQuillRef = useRef<ReactQuill | null>(null);
  const summaryImageInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState<LessonSummary>(emptySummary);
  const [isUploadingSummaryImages, setIsUploadingSummaryImages] = useState(false);
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
      setForm(prepareSummaryForEditor(currentSummary));
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

  const summaryQuillModules = useMemo(() => {
    if (!isTeacher) {
      return { toolbar: false };
    }

    return {
      toolbar: {
        container: [
          [{ header: [1, 2, false] }],
          ["bold", "italic", "underline", "strike", "blockquote"],
          [{ list: "ordered" }, { list: "bullet" }],
          ["link", "image"],
          ["clean"],
        ],
        handlers: {
          image: () => summaryImageInputRef.current?.click(),
        },
      },
    };
  }, [isTeacher]);

  const summaryQuillFormats = useMemo(
    () => ["header", "bold", "italic", "underline", "strike", "blockquote", "list", "bullet", "link", "image"],
    [],
  );

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
      setForm(prepareSummaryForEditor(data));
      queryClient.invalidateQueries({ queryKey: ["lesson-summary", lesson.id] });
      queryClient.invalidateQueries({ queryKey: ["lesson", lesson.id] });
      onUpdated?.();
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
      if (data) setForm(prepareSummaryForEditor(data));
      queryClient.invalidateQueries({ queryKey: ["lesson-summary", lesson.id] });
      onUpdated?.();
    },
  });

  const insertSummaryImageAtCursor = (imageUrl: string) => {
    const editor = summaryQuillRef.current?.getEditor();
    if (!editor) return;
    const selection = editor.getSelection(true);
    const index = selection?.index ?? editor.getLength();
    editor.insertEmbed(index, "image", imageUrl, "user");
    editor.insertText(index + 1, "\n", "user");
    editor.setSelection(index + 2, 0);
    setForm((current) => ({ ...current, summary: editor.root.innerHTML }));
  };

  const uploadImagesToSummary = async (files: FileList | null) => {
    if (!files?.length || !lesson.id) return;
    setIsUploadingSummaryImages(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const formData = new FormData();
        formData.append("lesson", lesson.id);
        formData.append("file", file);
        const response = await api.post("/lessons-attachments/", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        if (response.data?.file_url) {
          insertSummaryImageAtCursor(response.data.file_url);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["lesson", lesson.id] });
      toast({ title: "Imagem inserida no resumo." });
    } catch (error) {
      console.error(error);
      toast({ title: "Erro ao inserir imagem no resumo", variant: "destructive" });
    } finally {
      setIsUploadingSummaryImages(false);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
      {isTeacher && (
        <input
          ref={summaryImageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            uploadImagesToSummary(event.target.files);
            event.target.value = "";
          }}
        />
      )}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="h-4 w-4 text-primary" /> Resumo Automático da Aula
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Síntese da aula, palavras aprendidas e próximos focos. O professor pode gerar e ajustar este resumo sempre que precisar.
          </p>
        </div>
        {isTeacher && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
              {generateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
              {generateMutation.isPending ? "Gerando resumo..." : "Gerar resumo automático"}
            </Button>
            {form.id && (
              <Button variant="outline" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || isUploadingSummaryImages}>
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
        <div className="bg-background rounded-md overflow-hidden border border-border h-[360px]">
          <ReactQuill
            ref={summaryQuillRef}
            theme="snow"
            value={form.summary}
            readOnly={!isTeacher}
            onChange={(value) => setForm((current) => ({ ...current, summary: value }))}
            placeholder="Gere ou edite o resumo da aula, destacando evolução, dificuldades e próximos passos."
            style={{ height: '100%', border: 'none' }}
            modules={summaryQuillModules}
            formats={summaryQuillFormats}
          />
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">
          O resumo desta aula ainda nao foi gerado.
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
