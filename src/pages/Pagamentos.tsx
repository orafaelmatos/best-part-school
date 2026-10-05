import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertCircle,
  BadgeDollarSign,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
  Landmark,
  MessageCircleMore,
  Settings2,
  Upload,
  Wallet,
  XCircle,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import FileUploadField from "@/components/FileUploadField";
import { useToast } from "@/hooks/use-toast";

const currency = (value: number | string | null | undefined) =>
  Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleDateString("pt-BR") : "—";

const pixKeyTypeLabel = (value?: string | null) => {
  if (value === "cpf") return "CPF";
  if (value === "phone") return "Telefone";
  if (value === "random") return "Chave aleatoria";
  return "E-mail";
};

const FinanceCard = ({ label, value, icon: Icon, tone = "default" }: any) => (
  <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
    <div className="mb-4 flex items-center justify-between">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className={`rounded-lg p-2 ${tone === "success" ? "bg-emerald-100 text-emerald-700" : tone === "warning" ? "bg-amber-100 text-amber-700" : tone === "danger" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-700"}`}>
        <Icon className="h-4 w-4" />
      </div>
    </div>
    <p className="text-2xl font-semibold text-foreground">{value}</p>
  </div>
);

const SectionList = ({ title, description, items, onOpenDetails, actions }: any) => (
  <section className="rounded-2xl border border-border bg-card shadow-sm">
    <div className="flex items-center justify-between border-b border-border px-5 py-4">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">{items.length}</span>
    </div>
    <div className="divide-y divide-border">
      {items.length === 0 && (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">Nada por aqui.</div>
      )}
      {items.map((item: any) => (
        <div key={item.id} className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium text-foreground">{item.student_name}</p>
              <StatusBadge status={item.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {currency(item.amount)} · vencimento {dateLabel(item.due_date)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {actions?.(item)}
            <Button variant="outline" size="sm" onClick={() => onOpenDetails(item)}>
              Detalhes
            </Button>
          </div>
        </div>
      ))}
    </div>
  </section>
);

const Pagamentos = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPayment, setSelectedPayment] = useState<any | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [settingsForm, setSettingsForm] = useState({
    pix_key_type: "email",
    pix_key: "",
    default_monthly_fee: "",
    default_due_day: "10",
    default_message: "",
    payment_instructions: "",
    whatsapp_number: "",
  });

  const isTeacher = user?.role === "teacher" || user?.role === "admin";

  const teacherDashboardQuery = useQuery({
    queryKey: ["finance-dashboard"],
    queryFn: async () => (await api.get("/finance/dashboard/")).data,
    enabled: isTeacher,
  });

  const studentFinanceQuery = useQuery({
    queryKey: ["my-finance"],
    queryFn: async () => (await api.get("/finance/me/")).data,
    enabled: user?.role === "student",
  });

  const settingsQuery = useQuery({
    queryKey: ["finance-settings"],
    queryFn: async () => (await api.get("/finance/settings/me/")).data,
    enabled: isTeacher,
  });

  const studentDetailQuery = useQuery({
    queryKey: ["student-finance-detail", selectedStudentId],
    queryFn: async () => (await api.get(`/finance/student/${selectedStudentId}/`)).data,
    enabled: !!selectedStudentId,
  });

  const paymentActionMutation = useMutation({
    mutationFn: async ({ paymentId, action }: { paymentId: string; action: string }) => {
      if (action === "paid") return api.patch(`/payments/${paymentId}/mark_paid/`);
      if (action === "pending") return api.patch(`/payments/${paymentId}/mark_pending/`);
      if (action === "charge") return api.post(`/payments/${paymentId}/charge_student/`);
      throw new Error("Acao invalida");
    },
    onSuccess: async (response, variables) => {
      queryClient.invalidateQueries({ queryKey: ["finance-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["my-finance"] });
      queryClient.invalidateQueries({ queryKey: ["student-finance-detail"] });
      if (variables.action === "charge") {
        const url = response.data.url;
        const message = response.data.message;
        await navigator.clipboard.writeText(message);
        if (url) window.open(url, "_blank", "noopener,noreferrer");
        toast({ title: "Mensagem pronta", description: "Texto copiado e WhatsApp preparado." });
      } else {
        toast({ title: "Financeiro atualizado" });
      }
    },
    onError: (err: any) => {
      toast({
        title: "Erro financeiro",
        description: err.response?.data?.error || "Nao foi possivel concluir a acao.",
        variant: "destructive",
      });
    },
  });

  const uploadContractMutation = useMutation({
    mutationFn: async ({ studentId, file }: { studentId: string; file: File }) => {
      const payload = new FormData();
      payload.append("contract_file", file);
      payload.append("contract_name", file.name);
      return api.patch(`/accounts/users/${studentId}/`, payload, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: () => {
      setContractFile(null);
      queryClient.invalidateQueries({ queryKey: ["student-finance-detail"] });
      queryClient.invalidateQueries({ queryKey: ["finance-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["my-finance"] });
      toast({ title: "Contrato anexado", description: "O aluno ja pode abrir o contrato pelo financeiro." });
    },
    onError: (err: any) => {
      toast({
        title: "Erro ao anexar contrato",
        description: err.response?.data?.contract_file?.[0] || err.response?.data?.error || "Nao foi possivel enviar o contrato.",
        variant: "destructive",
      });
    },
  });

  const settingsMutation = useMutation({
    mutationFn: async () => api.put("/finance/settings/me/", settingsForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finance-settings"] });
      setIsSettingsOpen(false);
      toast({ title: "Configuracoes salvas" });
    },
  });

  const teacherDashboard = teacherDashboardQuery.data;
  const studentFinance = studentFinanceQuery.data;

  useEffect(() => {
    if (settingsQuery.data) {
      setSettingsForm({
        pix_key_type: settingsQuery.data.pix_key_type || "email",
        pix_key: settingsQuery.data.pix_key || "",
        default_monthly_fee: settingsQuery.data.default_monthly_fee || "",
        default_due_day: String(settingsQuery.data.default_due_day || 10),
        default_message: settingsQuery.data.default_message || "",
        payment_instructions: settingsQuery.data.payment_instructions || "",
        whatsapp_number: settingsQuery.data.whatsapp_number || "",
      });
    }
  }, [settingsQuery.data]);

  useEffect(() => {
    setContractFile(null);
  }, [selectedStudentId]);

  const teacherActions = (item: any) => (
    <>
      <Button size="sm" onClick={() => paymentActionMutation.mutate({ paymentId: item.id, action: "charge" })}>
        <MessageCircleMore className="mr-2 h-4 w-4" />
        Cobrar aluno
      </Button>
      <Button size="sm" variant="outline" onClick={() => paymentActionMutation.mutate({ paymentId: item.id, action: "paid" })}>
        Marcar pago
      </Button>
    </>
  );

  return (
    <DashboardLayout>
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <PageHeader
          title="Financeiro"
          description={isTeacher ? "Recebimentos, inadimplencia e contratos em um painel unico." : "Mensalidade, PIX e contrato em um fluxo simples."}
        />
        {isTeacher && (
          <Button className="w-full sm:w-auto" onClick={() => setIsSettingsOpen(true)}>
            <Settings2 className="mr-2 h-4 w-4" />
            Configuracoes
          </Button>
        )}
      </div>

      {isTeacher ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <FinanceCard label="Total previsto no mes" value={currency(teacherDashboard?.total_expected)} icon={Wallet} />
            <FinanceCard label="Total recebido" value={currency(teacherDashboard?.total_received)} icon={CheckCircle2} tone="success" />
            <FinanceCard label="Total pendente" value={currency(teacherDashboard?.total_pending)} icon={Clock3} tone="warning" />
            <FinanceCard label="Total vencido" value={currency(teacherDashboard?.total_overdue)} icon={AlertCircle} tone="danger" />
            <FinanceCard label="Alunos inadimplentes" value={teacherDashboard?.delinquent_students || 0} icon={XCircle} tone="danger" />
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-base font-semibold">Previsao financeira</h2>
              <p className="text-sm text-muted-foreground">Recebido vs pendente para este mes e os proximos.</p>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={teacherDashboard?.monthly_projection || []}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="received" fill="#1f7a4d" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="pending" fill="#d97706" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <SectionList title="Pagamentos pendentes" description="Cobrar rapido e abrir detalhes do aluno." items={teacherDashboard?.pending_items || []} onOpenDetails={(item: any) => setSelectedStudentId(item.student)} actions={teacherActions} />
            <SectionList title="Proximos do vencimento" description="Aulas e cobrancas que merecem atencao agora." items={teacherDashboard?.due_soon_items || []} onOpenDetails={(item: any) => setSelectedStudentId(item.student)} actions={teacherActions} />
            <SectionList title="Vencidos" description="Mensalidades em atraso." items={teacherDashboard?.overdue_items || []} onOpenDetails={(item: any) => setSelectedStudentId(item.student)} actions={teacherActions} />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Mensalidade atual</h2>
                  <p className="text-sm text-muted-foreground">Resumo da cobranca, vencimento e PIX do professor.</p>
                </div>
                {studentFinance?.current_payment && <StatusBadge status={studentFinance.current_payment.status} />}
              </div>

              {studentFinance?.current_payment ? (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <FinanceCard label="Mensalidade" value={currency(studentFinance.current_payment.amount)} icon={BadgeDollarSign} />
                    <FinanceCard label="Vencimento da mensalidade" value={dateLabel(studentFinance.current_payment.due_date)} icon={Clock3} tone={studentFinance.current_payment.status === "overdue" ? "danger" : "warning"} />
                    <FinanceCard label={`Chave PIX do professor (${pixKeyTypeLabel(studentFinance?.settings?.pix_key_type)})`} value={studentFinance?.settings?.pix_key || "Nao configurada"} icon={Landmark} />
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <p className="font-semibold">Pague para o professor até {dateLabel(studentFinance.current_payment.due_date)}.</p>
                    <p className="mt-1 leading-6">
                      Use a chave PIX do professor acima, leia o QR Code abaixo ou copie o codigo PIX copia e cola.
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    <p className="text-sm font-medium">Instrucoes</p>
                    <p className="mt-1 text-sm text-muted-foreground">{studentFinance?.settings?.payment_instructions || "Pague via PIX usando a chave do professor. Se precisar confirmar algo, fale diretamente com o professor."}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold">Copie e cole para pagar para o professor</p>
                        <p className="mt-1 text-xs text-muted-foreground break-all">{studentFinance.pix_payload || "O professor ainda precisa configurar a chave PIX."}</p>
                      </div>
                      <Button className="w-full sm:w-auto" variant="outline" size="sm" onClick={async () => {
                        await navigator.clipboard.writeText(studentFinance.pix_payload || "");
                        toast({ title: "Codigo PIX copiado" });
                      }}>
                        <Copy className="mr-2 h-4 w-4" />
                        Copiar PIX
                      </Button>
                    </div>
                    {studentFinance.pix_payload && (
                      <div className="mt-4 rounded-xl bg-muted/20 p-4">
                        <p className="text-center text-sm font-semibold text-foreground">Leia este QR Code para pagar para o professor</p>
                        <p className="mt-1 text-center text-xs text-muted-foreground">ou copie e cole o codigo PIX acima no app do banco.</p>
                        <div className="mt-4 flex justify-center">
                          <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(studentFinance.pix_payload)}`}
                            alt="QR Code PIX para pagar o professor"
                            className="h-48 w-48 rounded-lg border border-border bg-white p-2"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                  Nenhuma mensalidade ativa no momento.
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold">Contrato</h2>
              <p className="mt-1 text-sm text-muted-foreground">Se quiser ver seu contrato, clique aqui.</p>

              <div className="mt-5 space-y-4">
                {studentFinance?.profile?.contract_url ? (
                  <a href={studentFinance.profile.contract_url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-4 text-sm font-medium hover:bg-muted/40">
                    <span className="flex items-center gap-2"><FileText className="h-4 w-4" /> {studentFinance.profile.contract_name || "Contrato do aluno"}</span>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Contrato ainda nao anexado pelo professor.</div>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <SectionList title="Proximas mensalidades" description="O que vem pela frente." items={studentFinance?.upcoming_payments || []} onOpenDetails={setSelectedPayment} />
            <SectionList title="Historico financeiro" description="Pagamentos recentes." items={studentFinance?.payment_history || []} onOpenDetails={setSelectedPayment} />
          </div>
        </div>
      )}

      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Configuracoes financeiras</DialogTitle>
            <DialogDescription>PIX, vencimento padrao e mensagem base para cobrancas futuras.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Tipo da chave PIX</label>
              <select className="w-full rounded-lg border border-border bg-background p-3 text-sm" value={settingsForm.pix_key_type} onChange={(e) => setSettingsForm({ ...settingsForm, pix_key_type: e.target.value })}>
                <option value="email">E-mail</option>
                <option value="cpf">CPF</option>
                <option value="phone">Telefone</option>
                <option value="random">Chave aleatoria</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Chave PIX</label>
              <input className="w-full rounded-lg border border-border bg-background p-3 text-sm" value={settingsForm.pix_key} onChange={(e) => setSettingsForm({ ...settingsForm, pix_key: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Mensalidade padrao</label>
              <input className="w-full rounded-lg border border-border bg-background p-3 text-sm" value={settingsForm.default_monthly_fee} onChange={(e) => setSettingsForm({ ...settingsForm, default_monthly_fee: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Vencimento padrao</label>
              <input className="w-full rounded-lg border border-border bg-background p-3 text-sm" value={settingsForm.default_due_day} onChange={(e) => setSettingsForm({ ...settingsForm, default_due_day: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium">WhatsApp</label>
              <input className="w-full rounded-lg border border-border bg-background p-3 text-sm" value={settingsForm.whatsapp_number} onChange={(e) => setSettingsForm({ ...settingsForm, whatsapp_number: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium">Mensagem padrao</label>
              <textarea className="min-h-28 w-full rounded-lg border border-border bg-background p-3 text-sm" value={settingsForm.default_message} onChange={(e) => setSettingsForm({ ...settingsForm, default_message: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium">Instrucoes ao aluno</label>
              <textarea className="min-h-24 w-full rounded-lg border border-border bg-background p-3 text-sm" value={settingsForm.payment_instructions} onChange={(e) => setSettingsForm({ ...settingsForm, payment_instructions: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSettingsOpen(false)}>Cancelar</Button>
            <Button onClick={() => settingsMutation.mutate()} disabled={settingsMutation.isPending}>
              Salvar configuracoes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedStudentId} onOpenChange={(open) => !open && setSelectedStudentId(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Detalhes financeiros do aluno</DialogTitle>
            <DialogDescription>Mensalidade, contrato e timeline financeira em um unico lugar.</DialogDescription>
          </DialogHeader>
          {studentDetailQuery.data && (
            <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-muted/20 p-4">
                  <p className="text-lg font-semibold">{studentDetailQuery.data.profile.student_name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {currency(studentDetailQuery.data.profile.monthly_fee)} · vence dia {studentDetailQuery.data.profile.due_day}
                  </p>
                </div>
                {studentDetailQuery.data.profile.contract_url ? (
                  <a href={studentDetailQuery.data.profile.contract_url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl border border-border bg-card p-4 text-sm font-medium hover:bg-muted/40">
                    <span className="flex items-center gap-2"><FileText className="h-4 w-4" /> {studentDetailQuery.data.profile.contract_name || "Contrato"}</span>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                ) : (
                  <div className="rounded-xl border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
                    Nenhum contrato anexado ainda.
                  </div>
                )}
                <div className="rounded-xl border border-border bg-card p-4">
                  <FileUploadField
                    label="Contrato do aluno"
                    description="Anexe ou troque o contrato que o aluno podera abrir no financeiro."
                    file={contractFile}
                    onChange={setContractFile}
                  />
                  <Button
                    className="mt-4 w-full"
                    disabled={!contractFile || uploadContractMutation.isPending}
                    onClick={() => uploadContractMutation.mutate({ studentId: studentDetailQuery.data.profile.student, file: contractFile! })}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {uploadContractMutation.isPending ? "Anexando..." : "Anexar contrato"}
                  </Button>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-sm font-semibold">Observacoes</p>
                  <p className="mt-2 text-sm text-muted-foreground">{studentDetailQuery.data.profile.notes || "Sem observacoes financeiras."}</p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-sm font-semibold">Historico</p>
                  <div className="mt-3 space-y-3">
                    {studentDetailQuery.data.history.map((payment: any) => (
                      <div key={payment.id} className="rounded-lg border border-border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">{currency(payment.amount)}</p>
                            <p className="text-xs text-muted-foreground">Vencimento {dateLabel(payment.due_date)}</p>
                          </div>
                          <StatusBadge status={payment.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-sm font-semibold">Timeline financeira</p>
                  <div className="mt-3 space-y-3">
                    {studentDetailQuery.data.timeline.map((entry: any) => (
                      <div key={entry.id} className="border-l-2 border-primary/20 pl-4">
                        <p className="text-sm font-medium">{entry.title}</p>
                        <p className="text-xs text-muted-foreground">{entry.description || dateLabel(entry.created_at)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedPayment && !isTeacher} onOpenChange={(open) => !open && setSelectedPayment(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes da mensalidade</DialogTitle>
            <DialogDescription>Valor, vencimento e status desta cobranca.</DialogDescription>
          </DialogHeader>
          {selectedPayment && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-4">
                <div>
                  <p className="text-lg font-semibold">{currency(selectedPayment.amount)}</p>
                  <p className="text-sm text-muted-foreground">Vencimento {dateLabel(selectedPayment.due_date)}</p>
                </div>
                <StatusBadge status={selectedPayment.status} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Pagamentos;
