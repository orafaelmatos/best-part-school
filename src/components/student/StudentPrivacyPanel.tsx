import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { isAxiosError } from "axios";
import { api, sessionBoundConfig } from "@/lib/api";
import { getSessionGeneration } from "@/lib/session";
import { LEGAL_PATHS, SUPPORT_EMAIL, supportMailto } from "@/lib/privacy";
import { useAuth } from "@/contexts/AuthContext";
import { ShieldCheck } from "lucide-react";
import { Alert, Button, Card, IconTile, TextField } from "@/components/student/ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ConsentStatus = { accepted: boolean; accepted_at: string | null };

export default function StudentPrivacyPanel() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const consent = useQuery({ queryKey: ["ai-consent", user?.user_id], queryFn: async () => (await api.get<ConsentStatus>("/accounts/ai-consent/")).data });
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const revoke = async () => {
    setBusy(true); setError("");
    try { await api.delete("/accounts/ai-consent/", sessionBoundConfig(getSessionGeneration())); await consent.refetch(); }
    catch { setError("Não conseguimos atualizar sua autorização. Tente novamente."); }
    finally { setBusy(false); }
  };
  const deleteAccount = async () => {
    setBusy(true); setError("");
    try {
      await api.post("/accounts/me/delete/", { password, confirmation }, sessionBoundConfig(getSessionGeneration()));
      setPassword(""); setConfirmation(""); setOpen(false);
      await logout(); queryClient.clear();
    } catch (cause) {
      setError(isAxiosError(cause) && cause.response?.status === 400 ? "Confira sua senha e digite EXCLUIR para confirmar." : "Não conseguimos excluir sua conta. Tente novamente ou fale com o suporte.");
    } finally { setBusy(false); }
  };
  return <Card as="section" className="space-y-4" aria-labelledby="privacy-title">
    <div className="flex items-center gap-3">
      <IconTile icon={ShieldCheck} />
      <h2 id="privacy-title" className="text-h4 text-ink">Privacidade e IA</h2>
    </div>
    <div className="space-y-4 text-body text-ink-secondary">
      {consent.isPending ? <p role="status">Carregando suas preferências…</p> : consent.isError ? <p>Não carregamos sua preferência. <button type="button" className="inline-flex min-h-11 items-center font-semibold text-primary underline" onClick={() => void consent.refetch()}>Tentar novamente</button></p> : <>
        <p>{consent.data.accepted ? "Você autorizou o envio de respostas, áudios e conteúdo selecionado das aulas à OpenAI para práticas de IA." : "O envio de dados à OpenAI não está autorizado. Você poderá escolher antes de iniciar uma prática de IA."}</p>
        {consent.data.accepted && <Button variant="outline" size="sm" loading={busy} onClick={() => void revoke()}>Revogar autorização de IA</Button>}
      </>}
      <div className="flex flex-wrap gap-x-6"><Link className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-2" to={LEGAL_PATHS.privacy}>Política de privacidade</Link><Link className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-2" to={LEGAL_PATHS.support}>Suporte</Link></div>
      <p>Para recuperar seu acesso ou solicitar informações sobre seus dados, escreva para <a href={supportMailto()} className="break-words font-semibold text-primary underline underline-offset-2">{SUPPORT_EMAIL}</a>.</p>
      {error && !open && <Alert role="alert" tone="danger" title={error} />}
      <div className="border-t border-line pt-4">
        <Button variant="ghost" size="sm" className="-ml-4 text-danger hover:bg-danger-soft" onClick={() => { setError(""); setPassword(""); setConfirmation(""); setOpen(true); }}>Excluir minha conta</Button>
      </div>
    </div>
    <Dialog open={open} onOpenChange={(next) => { if (!busy) { setOpen(next); setPassword(""); setConfirmation(""); } }}><DialogContent className="rounded-2xl">
      <DialogHeader><DialogTitle className="text-h3">Excluir sua conta?</DialogTitle><DialogDescription className="text-body text-ink-secondary">Esta ação é permanente. Seu acesso e os dados vinculados à sua conta serão removidos da aplicação, incluindo conversas e gravações de prática. A exclusão da conta não cancela contratos nem obrigações com a escola.</DialogDescription></DialogHeader>
      <div className="space-y-4">
        <TextField label="Sua senha atual" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        <TextField label="Digite EXCLUIR" autoComplete="off" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        {error && <Alert role="alert" tone="danger" title={error} />}
      </div>
      <DialogFooter className="gap-2"><Button variant="outline" disabled={busy} onClick={() => { setOpen(false); setPassword(""); }}>Manter minha conta</Button><Button variant="destructive" loading={busy} loadingLabel="Excluindo…" disabled={!password || confirmation !== "EXCLUIR"} onClick={() => void deleteAccount()}>Excluir definitivamente</Button></DialogFooter>
    </DialogContent></Dialog>
  </Card>;
}
