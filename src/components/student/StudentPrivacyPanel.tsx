import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { isAxiosError } from "axios";
import { api, sessionBoundConfig } from "@/lib/api";
import { getSessionGeneration } from "@/lib/session";
import { LEGAL_PATHS, SUPPORT_EMAIL, supportMailto } from "@/lib/privacy";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
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
  return <section className="student-card space-y-5 p-5" aria-labelledby="privacy-title">
    <h2 id="privacy-title" className="text-sm font-bold">Privacidade e IA</h2>
    <div className="space-y-3 text-sm leading-6 text-slate-600">
      {consent.isPending ? <p>Carregando suas preferências...</p> : consent.isError ? <p>Não carregamos sua preferência. <button type="button" className="underline" onClick={() => void consent.refetch()}>Tentar novamente</button></p> : <>
        <p>{consent.data.accepted ? "Você autorizou o envio de respostas, áudios e conteúdo selecionado das aulas à OpenAI para práticas de IA." : "O envio de dados à OpenAI não está autorizado. Você poderá escolher antes de iniciar uma prática de IA."}</p>
        {consent.data.accepted && <Button variant="outline" disabled={busy} onClick={() => void revoke()}>Revogar autorização de IA</Button>}
      </>}
      <div className="flex flex-wrap gap-x-5 gap-y-2"><Link className="inline-flex min-h-11 items-center font-semibold text-primary underline" to={LEGAL_PATHS.privacy}>Política de privacidade</Link><Link className="inline-flex min-h-11 items-center font-semibold text-primary underline" to={LEGAL_PATHS.support}>Suporte</Link></div>
      <p>Para recuperar seu acesso ou solicitar informações sobre seus dados, escreva para <a href={supportMailto()} className="break-all font-semibold text-primary underline">{SUPPORT_EMAIL}</a>.</p>
      {error && !open && <p role="alert" className="text-destructive">{error}</p>}
      <Button variant="outline" className="text-destructive" onClick={() => { setError(""); setPassword(""); setConfirmation(""); setOpen(true); }}>Excluir minha conta</Button>
    </div>
    <Dialog open={open} onOpenChange={(next) => { if (!busy) { setOpen(next); setPassword(""); setConfirmation(""); } }}><DialogContent>
      <DialogHeader><DialogTitle>Excluir sua conta?</DialogTitle><DialogDescription>Esta ação é permanente. Seu acesso e os dados vinculados à sua conta serão removidos da aplicação, incluindo conversas e gravações de prática. A exclusão da conta não cancela contratos nem obrigações com a escola.</DialogDescription></DialogHeader>
      <div className="space-y-4">
        <label className="block text-sm font-medium">Sua senha atual<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-12 w-full rounded-lg border px-3 text-base" /></label>
        <label className="block text-sm font-medium">Digite EXCLUIR<input autoComplete="off" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-2 h-12 w-full rounded-lg border px-3 text-base" /></label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => { setOpen(false); setPassword(""); }}>Manter minha conta</Button><Button variant="destructive" disabled={busy || !password || confirmation !== "EXCLUIR"} onClick={() => void deleteAccount()}>{busy ? "Excluindo..." : "Excluir definitivamente"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </section>;
}
