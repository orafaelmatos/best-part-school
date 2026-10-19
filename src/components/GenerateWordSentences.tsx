import { useId, useState } from "react";
import { isAxiosError } from "axios";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";

type SentenceDraft = {
  source_word: string;
  sentence: string;
  translation: string;
  review_warning?: string;
  selected: boolean;
  id: number;
};

type Props = {
  lessonId: string;
  level: string;
  refetch: () => void;
  onBeforePersist?: () => Promise<boolean> | boolean;
};

const BATCH_LIMIT = 50;

function errorMessage(error: unknown, fallback: string) {
  if (isAxiosError(error) && typeof error.response?.data?.detail === "string") {
    return error.response.data.detail;
  }
  return fallback;
}

const GenerateWordSentences = ({ lessonId, level, refetch, onBeforePersist }: Props) => {
  const inputId = useId();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [drafts, setDrafts] = useState<SentenceDraft[]>([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const seen = new Set<string>();
  const words = input.split(/[\n,;]+/).map((word) => word.trim()).filter((word) => {
    const normalized = word.toLocaleLowerCase();
    if (!word || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
  const selected = drafts.filter((draft) => draft.selected);
  const busy = generating || saving;
  const invalidWords = words.length > BATCH_LIMIT || words.some((word) => word.length > 100);
  const invalidDrafts = selected.some((draft) => !draft.sentence.trim() || !draft.translation.trim());

  const generate = async () => {
    if (busy || !words.length || invalidWords) return;
    setGenerating(true);
    setError("");
    try {
      if (await onBeforePersist?.() === false) return;
      const { data } = await api.post<{ items: Omit<SentenceDraft, "selected" | "id">[] }>(
        `/lessons/${lessonId}/generate-word-sentences/`,
        { words },
      );
      setDrafts(data.items.map((item, id) => ({ ...item, selected: !item.review_warning, id })));
    } catch (error) {
      setError(errorMessage(error, "Não foi possível gerar as frases. Sua lista foi mantida para tentar novamente."));
    } finally {
      setGenerating(false);
    }
  };

  const updateDraft = (id: number, update: Partial<SentenceDraft>) => {
    setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...update } : draft));
  };

  const approve = async () => {
    if (busy || !selected.length || invalidDrafts) return;
    setSaving(true);
    setError("");
    try {
      if (await onBeforePersist?.() === false) return;
      const { data } = await api.post<{ created_count: number; skipped_count: number }>(
        `/lessons/${lessonId}/approve-word-sentences/`,
        { items: selected.map(({ source_word, sentence, translation }) => ({
          source_word,
          sentence: sentence.trim(),
          translation: translation.trim(),
        })) },
      );
      setDrafts((current) => current.filter((draft) => !draft.selected));
      if (selected.length === drafts.length) setInput("");
      toast({
        title: data.created_count === 1 ? "1 frase salva para praticar" : `${data.created_count} frases salvas para praticar`,
        description: data.skipped_count
          ? `${data.skipped_count} já estavam na lista e não foram duplicadas.`
          : "Os cards aprovados já estão disponíveis para o aluno.",
      });
      refetch();
      void queryClient.invalidateQueries({ queryKey: ["vocabulary-cards"] });
      void queryClient.invalidateQueries({ queryKey: ["vocabulary-dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["sidebar-badges"] });
    } catch (error) {
      setError(errorMessage(error, "Não foi possível salvar as frases. Suas correções foram mantidas para tentar novamente."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-primary/20 bg-background p-4 space-y-4" aria-label="Frases com IA">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h5 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> Frases com IA</h5>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Transforme uma lista de palavras em cards. Revise e aprove antes de enviar ao aluno.</p>
        </div>
        {!expanded && <Button type="button" size="sm" variant="outline" onClick={() => setExpanded(true)}>Gerar frases com IA</Button>}
      </div>

      {expanded && (
        <>
          {!drafts.length ? (
            <div className="space-y-3">
              <label htmlFor={inputId} className="block text-sm font-medium">Lista de palavras ou expressões</label>
              <Textarea
                id={inputId}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                disabled={busy}
                rows={5}
                placeholder={"Ex.:\nairport\nlook forward to\nachievement"}
                aria-describedby={`${inputId}-help`}
              />
              <div id={`${inputId}-help`} className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                <span>Separe por linha, vírgula ou ponto e vírgula. Até {BATCH_LIMIT} palavras por lote.</span>
                <span>{words.length}/{BATCH_LIMIT} palavras · Nível {level}</span>
              </div>
              {invalidWords && <p role="alert" className="text-sm text-destructive">Use até {BATCH_LIMIT} palavras, com no máximo 100 caracteres por palavra ou expressão.</p>}
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={generate} disabled={busy || !words.length || invalidWords}>
                  {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
                  {generating ? "Gerando frases..." : "Gerar frases"}
                </Button>
                <Button type="button" variant="ghost" disabled={busy} onClick={() => { setExpanded(false); setError(""); }}>Fechar</Button>
              </div>
              {generating && <p role="status" className="text-xs text-muted-foreground">Preparando uma frase e uma tradução para cada palavra. Isso pode levar alguns instantes.</p>}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">Revise as sugestões</p>
                  <p className="mt-1 text-xs text-muted-foreground">Frase em inglês na frente, tradução no verso. Edite os campos e desmarque o que não quiser salvar.</p>
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{selected.length} de {drafts.length} selecionadas</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setDrafts((current) => current.map((draft) => ({ ...draft, selected: true })))}>Selecionar todas</Button>
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setDrafts((current) => current.map((draft) => ({ ...draft, selected: false })))}>Desmarcar todas</Button>
              </div>
              <div className="max-h-[600px] space-y-3 overflow-y-auto pr-1">
                {drafts.map((draft) => (
                  <div key={draft.id} className={`rounded-lg border p-3 space-y-3 ${draft.selected ? "border-border" : "border-dashed border-border bg-muted/40"}`}>
                    <label className="flex min-w-0 cursor-pointer items-center gap-2 text-sm font-semibold">
                      <Checkbox checked={draft.selected} disabled={busy} onCheckedChange={(checked) => updateDraft(draft.id, { selected: checked === true })} aria-label={`Incluir ${draft.source_word}`} />
                      <span className="min-w-0 break-words">{draft.source_word}</span>
                    </label>
                    {draft.review_warning && (
                      <p className="rounded-md bg-amber-50 p-2 text-xs leading-5 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                        {draft.review_warning}
                      </p>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label htmlFor={`${inputId}-${draft.id}-sentence`} className="text-xs font-medium">Frase em inglês (frente)</label>
                        <Textarea id={`${inputId}-${draft.id}-sentence`} value={draft.sentence} disabled={busy} maxLength={255} rows={3} onChange={(event) => updateDraft(draft.id, { sentence: event.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor={`${inputId}-${draft.id}-translation`} className="text-xs font-medium">Tradução em português (verso)</label>
                        <Textarea id={`${inputId}-${draft.id}-translation`} value={draft.translation} disabled={busy} maxLength={2000} rows={3} onChange={(event) => updateDraft(draft.id, { translation: event.target.value })} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {invalidDrafts && <p role="alert" className="text-sm text-destructive">Preencha a frase e a tradução de todos os cards selecionados.</p>}
              <p className="text-xs text-muted-foreground">As sugestões só ficam disponíveis para o aluno depois da sua aprovação.</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" className="h-auto min-h-10 w-full whitespace-normal py-2 sm:w-auto" onClick={approve} disabled={busy || !selected.length || invalidDrafts}>
                  {saving ? <Loader2 className="animate-spin" /> : <Check />}
                  {saving ? "Salvando frases..." : `Aprovar e salvar ${selected.length} ${selected.length === 1 ? "frase" : "frases"}`}
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => { setDrafts([]); setError(""); }}>Descartar sugestões</Button>
              </div>
            </div>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </>
      )}
    </section>
  );
};

export default GenerateWordSentences;
