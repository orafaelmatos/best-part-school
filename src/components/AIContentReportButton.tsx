import { useState } from "react";
import { Flag } from "lucide-react";
import { api } from "@/lib/api";
import { Button, inputClasses } from "@/components/student/ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export default function AIContentReportButton({ messageId }: { messageId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("inaccurate");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setBusy(true); setError("");
    try { await api.post("/ai-study/content-reports/", { message_id: messageId, reason, details }); setSent(true); }
    catch { setError("Não conseguimos enviar sua denúncia. Tente novamente."); }
    finally { setBusy(false); }
  };
  return <>
    <button
      type="button"
      onClick={() => { setSent(false); setError(""); setOpen(true); }}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-caption text-ink-secondary transition-colors duration-150 ease-standard hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      aria-label="Denunciar resposta da IA"
    >
      <Flag size={14} aria-hidden="true" />Denunciar resposta
    </button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl border-line bg-surface text-ink">
        <DialogHeader>
          <DialogTitle className="text-h4 text-ink">{sent ? "Denúncia recebida" : "Denunciar resposta da IA"}</DialogTitle>
          <DialogDescription className="text-body text-ink-secondary">{sent ? "A equipe da escola recebeu a resposta e seu relato para análise." : "Conte o que aconteceu. Sua denúncia será analisada pela equipe da escola."}</DialogDescription>
        </DialogHeader>
        {!sent && <div className="space-y-4">
          <label className="block text-body font-medium text-ink">Motivo
            <select value={reason} onChange={(event) => setReason(event.target.value)} className={cn(inputClasses, "mt-2")}>
              <option value="inaccurate">Informação incorreta</option>
              <option value="offensive">Conteúdo ofensivo</option>
              <option value="unsafe">Conteúdo perigoso</option>
              <option value="other">Outro motivo</option>
            </select>
          </label>
          <label className="block text-body font-medium text-ink">Detalhes (opcional)
            <textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={2000} rows={4} className={cn(inputClasses, "mt-2 py-3")} />
          </label>
          {error && <p role="alert" className="text-body text-danger">{error}</p>}
        </div>}
        <DialogFooter className="gap-2 sm:gap-2 sm:space-x-0">
          {sent ? <Button onClick={() => setOpen(false)}>Concluir</Button> : <>
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button>
            <Button disabled={busy} onClick={() => void submit()}>{busy ? "Enviando…" : "Enviar denúncia"}</Button>
          </>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
