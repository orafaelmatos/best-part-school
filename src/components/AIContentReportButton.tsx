import { useState } from "react";
import { Flag } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
    <button type="button" onClick={() => { setSent(false); setError(""); setOpen(true); }} className="inline-flex min-h-11 items-center gap-1.5 px-2 text-xs text-slate-500 underline-offset-2 hover:underline" aria-label="Denunciar resposta da IA"><Flag size={13} />Denunciar resposta</button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent>
      <DialogHeader><DialogTitle>{sent ? "Denúncia recebida" : "Denunciar resposta da IA"}</DialogTitle><DialogDescription>{sent ? "A equipe da escola recebeu a resposta e seu relato para análise." : "Conte o que aconteceu. Sua denúncia será analisada pela equipe da escola."}</DialogDescription></DialogHeader>
      {!sent && <div className="space-y-4">
        <label className="block text-sm font-medium">Motivo<select value={reason} onChange={(event) => setReason(event.target.value)} className="mt-2 min-h-12 w-full rounded-lg border bg-background p-2 text-base"><option value="inaccurate">Informação incorreta</option><option value="offensive">Conteúdo ofensivo</option><option value="unsafe">Conteúdo perigoso</option><option value="other">Outro motivo</option></select></label>
        <label className="block text-sm font-medium">Detalhes (opcional)<textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={2000} rows={4} className="mt-2 w-full rounded-lg border bg-background p-3 text-base" /></label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>}
      <DialogFooter>{sent ? <Button onClick={() => setOpen(false)}>Concluir</Button> : <><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={busy} onClick={() => void submit()}>{busy ? "Enviando..." : "Enviar denúncia"}</Button></>}</DialogFooter>
    </DialogContent></Dialog>
  </>;
}
