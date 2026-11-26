import { useEffect, useId, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Sparkles } from "lucide-react";

import { Alert, Badge, Button, inputClasses } from "@/components/student/ui";
import { Checkbox } from "@/components/ui/checkbox";
import { iconStroke } from "@/design-system/tokens";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type SentenceDraft = {
  source_word: string;
  sentence: string;
  translation: string;
  review_warning?: string;
  selected: boolean;
  id: number;
};

type Props = {
  level?: string;
  refetch?: () => void;
  onBeforePersist?: () => Promise<boolean> | boolean;
  initiallyExpanded?: boolean;
  initialInput?: string;
} & ({ lessonId: string; vocabulary?: never }
  | { lessonId?: never; vocabulary: true });

const BATCH_LIMIT = 50;
const textareaClass = cn(inputClasses, "py-3");

function errorMessage(error: unknown, fallback: string) {
  if (isAxiosError(error) && typeof error.response?.data?.detail === "string") {
    return error.response.data.detail;
  }
  return fallback;
}

const GenerateWordSentences = ({ lessonId, level = "", refetch, onBeforePersist, initiallyExpanded = false, initialInput = "" }: Props) => {
  const inputId = useId();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [input, setInput] = useState(initialInput);
  const [drafts, setDrafts] = useState<SentenceDraft[]>([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [rewritingId, setRewritingId] = useState<number | null>(null);
  const [resolvedLevel, setResolvedLevel] = useState(level);
  const operationRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const forStudent = Boolean(lessonId);
  const basePath = lessonId ? `/lessons/${lessonId}` : "/vocabulary-cards";
  const Heading = lessonId ? "h5" : "h2";

  const seen = new Set<string>();
  const words = input.split(/[\n,;]+/).map((word) => word.trim()).filter((word) => {
    const normalized = word.toLocaleLowerCase();
    if (!word || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
  const selected = drafts.filter((draft) => draft.selected);
  const busy = generating || saving || rewritingId !== null;
  const invalidWords = words.length > BATCH_LIMIT || words.some((word) => word.length > 100);
  const invalidDrafts = selected.some((draft) => !draft.sentence.trim() || !draft.translation.trim());

  const generate = async () => {
    if (operationRef.current || busy || !words.length || invalidWords) return;
    operationRef.current = true;
    setGenerating(true);
    setError("");
    try {
      if (await onBeforePersist?.() === false) return;
      if (!mounted.current) return;
      const { data } = await api.post<{ items: Omit<SentenceDraft, "selected" | "id">[]; level?: string }>(
        `${basePath}/generate-word-sentences/`,
        { words },
      );
      if (!mounted.current) return;
      setDrafts(data.items.map((item, id) => ({ ...item, selected: !item.review_warning, id })));
      setResolvedLevel(data.level || level);
    } catch (error) {
      if (mounted.current) setError(errorMessage(error, "Não foi possível gerar as frases. Sua lista foi mantida para tentar novamente."));
    } finally {
      operationRef.current = false;
      if (mounted.current) setGenerating(false);
    }
  };

  const updateDraft = (id: number, update: Partial<SentenceDraft>) => {
    setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...update } : draft));
  };

  const rewrite = async (draft: SentenceDraft, adjustment: "easier" | "harder") => {
    if (operationRef.current || busy || !draft.sentence.trim()) return;
    operationRef.current = true; setRewritingId(draft.id); setError("");
    try {
      if (await onBeforePersist?.() === false) return;
      if (!mounted.current) return;
      const { data } = await api.post<{ item: Pick<SentenceDraft, "source_word" | "sentence" | "translation">; level?: string }>(
        `${basePath}/${lessonId ? "rewrite-word-sentence" : "generate-word-sentence"}/`,
        { source_word: draft.source_word, previous_sentence: draft.sentence, adjustment },
      );
      if (!mounted.current) return;
      updateDraft(draft.id, { sentence: data.item.sentence, translation: data.item.translation, review_warning: undefined });
      setResolvedLevel(data.level || resolvedLevel);
    } catch (cause) { if (mounted.current) setError(errorMessage(cause, "Não foi possível refazer a frase. Sua sugestão anterior foi mantida para tentar novamente.")); }
    finally { operationRef.current = false; if (mounted.current) setRewritingId(null); }
  };

  const approve = async () => {
    if (operationRef.current || busy || !selected.length || invalidDrafts) return;
    operationRef.current = true;
    setSaving(true);
    setError("");
    try {
      if (await onBeforePersist?.() === false) return;
      if (!mounted.current) return;
      const { data } = await api.post<{ created_count: number; skipped_count: number }>(
        `${basePath}/${lessonId ? "approve-word-sentences" : "save-word-sentences"}/`,
        { items: selected.map(({ source_word, sentence, translation }) => ({
          source_word,
          sentence: sentence.trim(),
          translation: translation.trim(),
        })) },
      );
      void queryClient.invalidateQueries({ queryKey: ["vocabulary-cards"] });
      void queryClient.invalidateQueries({ queryKey: ["vocabulary-dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["sidebar-badges"] });
      if (!mounted.current) return;
      setDrafts((current) => current.filter((draft) => !draft.selected));
      if (selected.length === drafts.length) setInput("");
      toast({
        title: data.created_count === 1 ? "1 frase salva para praticar" : `${data.created_count} frases salvas para praticar`,
        description: data.skipped_count
          ? `${data.skipped_count} já estavam na lista e não foram duplicadas.`
          : forStudent ? "Os cards aprovados já estão disponíveis para o aluno." : "As frases já estão disponíveis para você revisar.",
      });
      refetch?.();
    } catch (error) {
      if (mounted.current) setError(errorMessage(error, "Não foi possível salvar as frases. Suas correções foram mantidas para tentar novamente."));
    } finally {
      operationRef.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  return (
    <section
      className={lessonId ? "space-y-4 rounded-lg border border-line bg-surface p-4" : "space-y-4"}
      aria-label="Frases com IA"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Heading className={cn("flex items-center gap-2 text-ink", lessonId ? "text-body font-semibold" : "text-h4")}>
            <Sparkles size={20} strokeWidth={iconStroke} className="shrink-0 text-ai" aria-hidden="true" /> Frases com IA
          </Heading>
          <p className="mt-1 text-body text-ink-secondary">Digite uma palavra ou uma lista. A IA cria uma frase em inglês e uma tradução para cada palavra, {forStudent ? "no nível do aluno" : "no seu nível de inglês"}. Ajuste a dificuldade, revise e salve {forStudent ? "para ele praticar" : "para praticar"}.</p>
        </div>
        {!expanded && <Button type="button" size="sm" variant="outline" onClick={() => setExpanded(true)}>Gerar frases com IA</Button>}
      </div>

      {expanded && (
        <>
          {!drafts.length ? (
            <div className="space-y-3">
              <label htmlFor={inputId} className="block text-body font-medium text-ink">Lista de palavras ou expressões</label>
              <textarea
                id={inputId}
                lang="en"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                disabled={busy}
                rows={5}
                placeholder={"Ex.:\nairport\nlook forward to\nachievement"}
                aria-describedby={`${inputId}-help`}
                className={textareaClass}
              />
              <div id={`${inputId}-help`} className="flex flex-wrap justify-between gap-2 text-caption text-ink-secondary">
                <span>Separe por linha, vírgula ou ponto e vírgula. Até {BATCH_LIMIT} palavras por lote.</span>
                <span>{words.length}/{BATCH_LIMIT} palavras · Frases {forStudent ? "no nível do aluno" : "no seu nível"}</span>
              </div>
              {invalidWords && <p role="alert" className="text-body text-danger">Use até {BATCH_LIMIT} palavras, com no máximo 100 caracteres por palavra ou expressão.</p>}
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={generate} disabled={busy || !words.length || invalidWords}>
                  {generating ? <Loader2 className="motion-safe:animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
                  {generating ? "Gerando frases..." : "Gerar frases"}
                </Button>
                <Button type="button" variant="ghost" disabled={busy} onClick={() => { setExpanded(false); setError(""); }}>Fechar</Button>
              </div>
              {generating && <p role="status" className="text-caption text-ink-secondary">Preparando uma frase e uma tradução para cada palavra. Isso pode levar alguns instantes.</p>}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-body font-medium text-ink">Revise as sugestões</p>
                  <p className="mt-1 text-caption text-ink-secondary">Frase em inglês na frente, tradução no verso. Edite os campos e desmarque o que não quiser salvar.</p>
                </div>
                <Badge tone="primary">{selected.length} de {drafts.length} selecionadas</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setDrafts((current) => current.map((draft) => ({ ...draft, selected: true })))}>Selecionar todas</Button>
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setDrafts((current) => current.map((draft) => ({ ...draft, selected: false })))}>Desmarcar todas</Button>
              </div>
              <div className={cn("space-y-3", lessonId && "max-h-[600px] overflow-y-auto pr-1")}>
                {drafts.map((draft) => (
                  <div
                    key={draft.id}
                    role="group"
                    aria-label={`Sugestão com ${draft.source_word}`}
                    className={cn("space-y-3 rounded-lg border p-4", draft.selected ? "border-line bg-surface" : "border-dashed border-line bg-surface-muted")}
                  >
                    <label className="flex min-h-11 min-w-0 cursor-pointer items-center gap-3 text-body font-semibold text-ink">
                      <Checkbox checked={draft.selected} disabled={busy} onCheckedChange={(checked) => updateDraft(draft.id, { selected: checked === true })} aria-label={`Incluir ${draft.source_word}`} className="size-5" />
                      <span lang="en" className="min-w-0 break-words">{draft.source_word}</span>
                    </label>
                    {draft.review_warning && (
                      <Alert tone="warning" title="Confira esta sugestão">{draft.review_warning}</Alert>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label htmlFor={`${inputId}-${draft.id}-sentence`} className="block text-caption font-medium text-ink">Frase em inglês (frente)</label>
                        <textarea id={`${inputId}-${draft.id}-sentence`} lang="en" value={draft.sentence} disabled={busy} maxLength={255} rows={3} onChange={(event) => updateDraft(draft.id, { sentence: event.target.value })} className={textareaClass} />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor={`${inputId}-${draft.id}-translation`} className="block text-caption font-medium text-ink">Tradução em português (verso)</label>
                        <textarea id={`${inputId}-${draft.id}-translation`} value={draft.translation} disabled={busy} maxLength={2000} rows={3} onChange={(event) => updateDraft(draft.id, { translation: event.target.value })} className={textareaClass} />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" disabled={busy || !draft.sentence.trim()} onClick={() => void rewrite(draft, "easier")}>Refazer mais fácil</Button>
                      <Button type="button" size="sm" variant="outline" disabled={busy || !draft.sentence.trim()} onClick={() => void rewrite(draft, "harder")}>Refazer mais difícil</Button>
                    </div>
                    <p className={cn("text-caption", draft.selected ? "text-ink-muted" : "text-ink")}>Mantém “{draft.source_word}” e ajusta só esta frase. Nível de referência: {resolvedLevel}. {forStudent ? "O nível cadastrado do aluno não muda." : "Seu nível cadastrado não muda."}</p>
                    {rewritingId === draft.id ? <p role="status" className={cn("text-caption", draft.selected ? "text-ink-secondary" : "text-ink")}>Refazendo a frase e a tradução...</p> : null}
                  </div>
                ))}
              </div>
              {invalidDrafts && <p role="alert" className="text-body text-danger">Preencha a frase e a tradução de todos os cards selecionados.</p>}
              <p className="text-caption text-ink-secondary">{forStudent ? "As sugestões só ficam disponíveis para o aluno depois da sua aprovação." : "As sugestões só entram na sua revisão depois que você escolher e salvar as frases."}</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button type="button" className="whitespace-normal" onClick={approve} disabled={busy || !selected.length || invalidDrafts}>
                  {saving ? <Loader2 className="motion-safe:animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
                  {saving ? "Salvando frases..." : `${forStudent ? "Aprovar e salvar" : "Salvar"} ${selected.length} ${selected.length === 1 ? "frase" : "frases"}`}
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => { setDrafts([]); setError(""); }}>Descartar sugestões</Button>
              </div>
            </div>
          )}
          {error && <Alert tone="danger" role="alert" title={error} />}
        </>
      )}
    </section>
  );
};

export default GenerateWordSentences;
