import { useEffect, useRef, useState } from "react";
import { api, sessionBoundConfig } from "@/lib/api";
import { getSessionGeneration, subscribeSession } from "@/lib/session";
import { registerAIConsentRequester } from "@/lib/aiConsent";
import { LEGAL_PATHS, PRIVACY_VERSION } from "@/lib/privacy";
import { PUBLIC_SITE_URL } from "@/apps/target";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function AIConsentDialog() {
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const resolveRef = useRef<((accepted: boolean) => void) | null>(null);
  const generationRef = useRef(0);
  const promptIdRef = useRef(0);
  useEffect(() => {
    const unregister = registerAIConsentRequester(() => new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      promptIdRef.current += 1;
      generationRef.current = getSessionGeneration();
      setAccepted(false); setBusy(false); setError(""); setOpen(true);
    }));
    const unsubscribe = subscribeSession(() => {
      if (resolveRef.current && generationRef.current !== getSessionGeneration()) {
        promptIdRef.current += 1;
        resolveRef.current(false); resolveRef.current = null; setBusy(false); setOpen(false);
      }
    });
    return () => { unregister(); unsubscribe(); resolveRef.current?.(false); };
  }, []);
  const finish = (value: boolean) => {
    promptIdRef.current += 1;
    resolveRef.current?.(value); resolveRef.current = null; setBusy(false); setOpen(false);
  };
  const confirm = async () => {
    if (generationRef.current !== getSessionGeneration()) { finish(false); return; }
    const promptId = promptIdRef.current;
    const generation = generationRef.current;
    setBusy(true); setError("");
    try {
      await api.put("/accounts/ai-consent/", { accepted: true, version: PRIVACY_VERSION }, sessionBoundConfig(generationRef.current));
      if (promptId === promptIdRef.current && generation === getSessionGeneration()) finish(true);
    } catch { if (promptId === promptIdRef.current) setError("Não conseguimos salvar sua escolha. Tente novamente."); }
    finally { if (promptId === promptIdRef.current) setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) finish(false); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>Antes de praticar com IA</DialogTitle>
        <DialogDescription>A inteligência artificial é opcional. Suas aulas e materiais continuam disponíveis se você recusar.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 text-sm leading-6">
        <p>Para gerar respostas e correções, enviamos à <strong>OpenAI</strong> o texto que você escrever, as gravações de voz que enviar e o conteúdo das aulas selecionadas para a prática. A OpenAI processa esses dados para transcrever áudio, gerar voz e preparar feedback educacional.</p>
        <p>As respostas podem conter erros. Evite compartilhar documentos, dados de saúde, informações financeiras ou outros dados sensíveis nas conversas.</p>
        <p>Você pode revogar esta autorização em <strong>Perfil → Privacidade e IA</strong>. Isso interrompe novos envios; não desfaz o processamento já realizado.</p>
        {PUBLIC_SITE_URL && <a className="font-semibold text-primary underline" href={`${PUBLIC_SITE_URL.replace(/\/$/, "")}${LEGAL_PATHS.privacy}`} target="_blank" rel="noreferrer">Ler a política de privacidade</a>}
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4">
          <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} disabled={busy} className="mt-1 h-5 w-5 shrink-0" />
          <span>Autorizo o envio dos dados descritos acima à OpenAI para as práticas de IA.</span>
        </label>
        {error && <p role="alert" className="text-destructive">{error}</p>}
      </div>
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => finish(false)}>Agora não</Button>
        <Button disabled={!accepted || busy} onClick={() => void confirm()}>{busy ? "Salvando..." : "Autorizar e continuar"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
