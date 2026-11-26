import { useEffect, useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BookPlus, Check, Loader2, Plus, Sparkles } from "lucide-react";
import { isAxiosError } from "axios";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { Alert, Badge, Button, Card, IconTile, TextField } from "@/components/student/ui";

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
      setSaved(true); setNotice(data.created ? teacher ? "Frase salva! Ela já está disponível no vocabulário do aluno para revisar." : "Frase salva! Ela já está disponível em Meu vocabulário para revisar." : "Esta frase já estava salva para revisar.");
    } catch (cause) { if (mounted.current) showError(cause, "Não foi possível salvar agora. Sua frase foi mantida para tentar novamente."); }
    finally { pending.current = false; if (mounted.current) setSaving(false); }
  };
  const disabled = busy || saving;
  return <Card as="section" aria-label={teacher ? "Criar frases para o aluno" : "Criar minha frase com IA"} className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <IconTile icon={Sparkles} tone="ai" />
      <div className="min-w-0">
        <h2 className="text-h4 text-ink">Uma palavra nova, uma frase para praticar</h2>
        <p className="mt-1 text-body text-ink-secondary">Digite uma palavra ou expressão em inglês. A IA cria uma frase no {teacher ? "nível cadastrado do aluno" : "seu nível de inglês"} e mostra a tradução em português.</p>
      </div>
    </div>
    {!expanded ? <Button type="button" variant="outline" fullWidth className="h-auto whitespace-normal py-3 text-left sm:w-auto" onClick={() => setExpanded(true)}><Plus aria-hidden="true" />{teacher ? "Adicionar uma palavra nova para a IA criar uma frase para o aluno" : "Adicionar uma palavra nova para a IA criar uma frase para você"}</Button> : <>
      <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void generate(); }}>
        <TextField
          id={inputId}
          label={teacher ? "Qual palavra o aluno aprendeu?" : "Qual palavra em inglês você aprendeu?"}
          hint="Uma palavra ou expressão por vez. Você não precisa escrever uma frase nem saber a tradução."
          lang="en"
          autoFocus
          required
          maxLength={100}
          value={word}
          disabled={disabled}
          placeholder="Ex.: happy, airport, look forward to"
          onChange={(event) => { setWord(event.target.value); setDraft(null); setSaved(false); setNotice(""); setError(""); }}
        />
        <Button type="submit" variant={draft ? "outline" : "primary"} disabled={disabled || !word.trim()}>{busy ? <Loader2 className="motion-safe:animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}{busy ? "Criando frase..." : "Criar frase com IA"}</Button>
      </form>
      {busy ? <p role="status" className="text-body text-ink-secondary">A IA está preparando uma frase com a mesma palavra. Aguarde um instante.</p> : null}
      {draft ? <article aria-label={`Frase com ${draft.source_word}`} className="space-y-4 border-t border-line pt-5">
        <div className="flex flex-wrap items-center gap-2"><Badge tone="primary" className="max-w-full break-words">Palavra: {draft.source_word}</Badge><span className="text-caption text-ink-muted">Nível de referência: {level}</span></div>
        <div className="space-y-2">
          <p lang="en" className="break-words text-h4 text-ink">{draft.sentence}</p>
          <h3 className="sr-only">Tradução em português</h3>
          <p lang="pt-BR" className="text-body-lg text-ink-secondary">{draft.translation}</p>
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => void generate("easier")}>Refazer mais fácil</Button><Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => void generate("harder")}>Refazer mais difícil</Button></div>
          <p className="text-caption text-ink-muted">A palavra permanece a mesma. Só a construção da frase muda. Este ajuste não altera {teacher ? "o nível cadastrado do aluno" : "seu nível cadastrado"}.</p>
        </div>
        <Button type="button" fullWidth disabled={disabled || saved} className="whitespace-normal sm:w-auto" onClick={() => void save()}>{saved ? <Check aria-hidden="true" /> : <BookPlus aria-hidden="true" />}{saving ? "Salvando frase..." : saved ? "Frase salva para revisar" : "Salvar frase para revisar"}</Button>
      </article> : null}
    </>}
    {error ? <Alert tone="danger" role="alert" title={error} /> : null}
    {notice ? <Alert tone="success" role="status" title={notice} /> : null}
  </Card>;
};

const WordSentenceComposer = ({ studentId }: Props) => {
  const { user } = useAuth();
  if (!user || (user.role !== "student" && !studentId)) return null;
  if (user.role === "student" && studentId && studentId !== user.user_id) return null;
  return <Composer key={`${user.user_id}-${studentId || "own"}`} studentId={user.role === "student" ? undefined : studentId} />;
};

export default WordSentenceComposer;
