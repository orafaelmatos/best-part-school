import { useEffect, useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BookPlus, Loader2, Sparkles } from "lucide-react";
import { isAxiosError } from "axios";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Sentence = { source_word: string; sentence: string; translation: string };
type Props = { studentId?: string };

const Composer = ({ studentId }: Props) => {
  const queryClient = useQueryClient();
  const inputId = useId();
  const mounted = useRef(true);
  const pending = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const [word, setWord] = useState("");
  const [draft, setDraft] = useState<Sentence | null>(null);
  const [level, setLevel] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const teacher = Boolean(studentId);
  const studentScope = studentId ? { student_id: studentId } : {};
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const showError = (cause: unknown, fallback: string) => {
    const detail = isAxiosError(cause) ? cause.response?.data?.detail : null;
    setError(typeof detail === "string" ? detail : fallback);
  };
  const generate = async (adjustment: "standard" | "easier" | "harder" = "standard") => {
    if (pending.current || !word.trim() || (adjustment !== "standard" && !draft)) return;
    pending.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const { data } = await api.post<{ item: Sentence; level: string }>("/vocabulary-cards/generate-word-sentence/", {
        source_word: adjustment === "standard" ? word.trim() : draft!.source_word,
        adjustment, ...(adjustment !== "standard" ? { previous_sentence: draft!.sentence } : {}), ...studentScope,
      });
      if (!mounted.current) return;
      setDraft(data.item); setLevel(data.level); setSaved(false);
    } catch (cause) { if (mounted.current) showError(cause, "Não foi possível criar a frase. Sua palavra e a frase anterior foram mantidas para tentar novamente."); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  const save = async () => {
    if (pending.current || !draft || saved) return;
    pending.current = true; setSaving(true); setError("");
    try {
      const { data } = await api.post<{ created: boolean }>("/vocabulary-cards/save-word-sentence/", { ...draft, ...studentScope });
      for (const key of ["vocabulary-cards", "vocabulary-dashboard", "sidebar-badges"]) void queryClient.invalidateQueries({ queryKey: [key] });
      if (!mounted.current) return;
      setSaved(true); setNotice(data.created ? "Frase salva! Ela já está disponível em Palavras Aprendidas para revisar." : "Esta frase já estava salva para revisar.");
    } catch (cause) { if (mounted.current) showError(cause, "Não foi possível salvar agora. Sua frase foi mantida para tentar novamente."); }
    finally { pending.current = false; if (mounted.current) setSaving(false); }
  };
  const disabled = busy || saving;
  return <section aria-label={teacher ? "Criar frases para o aluno" : "Criar minha frase com IA"} className="space-y-4 rounded-3xl border border-primary/20 bg-card p-4 shadow-sm sm:p-6">
    <div><h2 className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="h-5 w-5 shrink-0 text-primary" />Uma palavra nova, uma frase para praticar</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Digite uma palavra ou expressão em inglês. A IA cria uma frase no {teacher ? "nível cadastrado do aluno" : "seu nível de inglês"} e mostra a tradução em português.</p></div>
    {!expanded ? <Button type="button" variant="outline" className="h-auto min-h-11 max-w-full whitespace-normal py-3 text-left" onClick={() => setExpanded(true)}><Sparkles className="h-4 w-4 shrink-0" />{teacher ? "Adicionar uma palavra nova para a IA criar uma frase para o aluno" : "Adicionar uma palavra nova para a IA criar uma frase para você"}</Button> : <>
      <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void generate(); }}>
        <label htmlFor={inputId} className="block text-sm font-medium">{teacher ? "Qual palavra o aluno aprendeu?" : "Qual palavra em inglês você aprendeu?"}</label>
        <Input id={inputId} autoFocus required maxLength={100} value={word} disabled={disabled} placeholder="Ex.: happy, airport, look forward to" aria-describedby={`${inputId}-help`} onChange={(event) => { setWord(event.target.value); setDraft(null); setSaved(false); setNotice(""); setError(""); }} />
        <p id={`${inputId}-help`} className="text-xs leading-relaxed text-muted-foreground">Uma palavra ou expressão por vez. Você não precisa escrever uma frase nem saber a tradução.</p>
        <Button type="submit" disabled={disabled || !word.trim()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{busy ? "Criando frase..." : "Criar frase com IA"}</Button>
      </form>
      {busy ? <p role="status" className="text-sm text-muted-foreground">A IA está preparando uma frase com a mesma palavra. Aguarde um instante.</p> : null}
      {draft ? <article aria-label={`Frase com ${draft.source_word}`} className="space-y-4 rounded-2xl border border-border bg-background p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs"><span className="max-w-full break-words rounded-full bg-primary/10 px-3 py-1 font-medium text-primary">Palavra: {draft.source_word}</span><span className="text-muted-foreground">Nível de referência: {level}</span></div>
        <p lang="en" className="break-words text-lg font-medium leading-relaxed">{draft.sentence}</p>
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={disabled} onClick={() => void generate("easier")}>Refazer mais fácil</Button><Button type="button" variant="outline" disabled={disabled} onClick={() => void generate("harder")}>Refazer mais difícil</Button></div>
        <p className="text-xs leading-relaxed text-muted-foreground">A palavra permanece a mesma. Só a construção da frase muda. Este ajuste não altera {teacher ? "o nível cadastrado do aluno" : "seu nível cadastrado"}.</p>
        <div><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tradução em português</h3><p lang="pt-BR" className="mt-2 text-sm leading-relaxed">{draft.translation}</p></div>
        <Button type="button" disabled={disabled || saved} className="h-auto min-h-10 max-w-full whitespace-normal" onClick={() => void save()}><BookPlus className="h-4 w-4" />{saving ? "Salvando frase..." : saved ? "Frase salva para revisar" : "Salvar frase para revisar"}</Button>
      </article> : null}
    </>}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {notice ? <p role="status" className="text-sm text-emerald-700">{notice}</p> : null}
  </section>;
};

const WordSentenceComposer = ({ studentId }: Props) => {
  const { user } = useAuth();
  if (!user || (user.role !== "student" && !studentId)) return null;
  if (user.role === "student" && studentId && studentId !== user.user_id) return null;
  return <Composer key={`${user.user_id}-${studentId || "own"}`} studentId={user.role === "student" ? undefined : studentId} />;
};

export default WordSentenceComposer;
