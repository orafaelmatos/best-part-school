import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, BadgeDollarSign, BookOpen, CalendarClock, CheckCircle2, UserRound } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { curriculumData } from "@/data/curriculum";
import RecurringSchedulePicker from "@/components/RecurringSchedulePicker";
import FileUploadField from "@/components/FileUploadField";
import { cn } from "@/lib/utils";
import { APP_PATHS } from "@/lib/routes";

const STEPS = [
  { key: "personal", label: "Dados pessoais", icon: UserRound },
  { key: "academic", label: "Dados academicos", icon: BookOpen },
  { key: "finance", label: "Financeiro", icon: BadgeDollarSign },
  { key: "review", label: "Revisao", icon: CheckCircle2 },
] as const;

const MAX_UPLOAD_SIZE = 8 * 1024 * 1024;

const CriarAluno = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [contractError, setContractError] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    level: "A1/A2",
    listening: 1,
    speaking: 1,
    reading: 1,
    writing: 1,
    monthlyFee: "",
    dueDay: "10",
    financeNotes: "",
    schedules: [] as { day: string; time: string }[],
  });

  const { data: financeSettings } = useQuery({
    queryKey: ["finance-settings"],
    queryFn: async () => {
      const res = await api.get("/finance/settings/me/");
      return res.data;
    },
    enabled: user?.role === "teacher" || user?.role === "admin",
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = new FormData();
      payload.append("name", formData.name);
      payload.append("email", formData.email);
      payload.append("password", formData.password);
      payload.append("role", "student");
      payload.append("level", formData.level);
      payload.append("listening", String(formData.listening));
      payload.append("speaking", String(formData.speaking));
      payload.append("reading", String(formData.reading));
      payload.append("writing", String(formData.writing));
      payload.append("teacher_id", user?.user_id || "");
      payload.append("monthly_fee", formData.monthlyFee || String(financeSettings?.default_monthly_fee || 0));
      payload.append("due_day", formData.dueDay || String(financeSettings?.default_due_day || 10));
      payload.append("finance_notes", formData.financeNotes);
      payload.append("schedules", JSON.stringify(formData.schedules.map((schedule) => ({
        day_of_week: parseInt(schedule.day),
        time: schedule.time,
      }))));
      if (contractFile) {
        payload.append("contract_file", contractFile);
        payload.append("contract_name", contractFile.name);
      }

      const res = await api.post("/accounts/register/", payload, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data;
    },
    onSuccess: () => {
      toast({ title: "Aluno cadastrado com sucesso!" });
      navigate(APP_PATHS.students);
    },
    onError: (err: any) => {
      toast({
        title: "Erro ao cadastrar",
        description:
          err.response?.data?.schedule ||
          err.response?.data?.monthly_fee?.[0] ||
          err.response?.data?.email?.[0] ||
          err.response?.data?.error ||
          "Verifique os dados e tente novamente.",
        variant: "destructive",
      });
    },
  });

  const reviewItems = useMemo(() => [
    { label: "Aluno", value: formData.name || "Nao informado" },
    { label: "E-mail", value: formData.email || "Nao informado" },
    { label: "Nivel", value: formData.level },
    { label: "Mensalidade", value: `R$ ${formData.monthlyFee || financeSettings?.default_monthly_fee || "0,00"}` },
    { label: "Vencimento", value: `Dia ${formData.dueDay || financeSettings?.default_due_day || 10}` },
    { label: "Horarios", value: formData.schedules.length ? `${formData.schedules.length} horarios selecionados` : "Sem agenda recorrente" },
  ], [financeSettings, formData]);

  const handleContractChange = (file: File | null) => {
    if (!file) {
      setContractFile(null);
      setContractError("");
      return;
    }
    if (file.size > MAX_UPLOAD_SIZE) {
      setContractError("O contrato deve ter no maximo 8 MB.");
      return;
    }
    setContractError("");
    setContractFile(file);
  };

  const nextStep = () => setStepIndex((current) => Math.min(current + 1, STEPS.length - 1));
  const previousStep = () => setStepIndex((current) => Math.max(current - 1, 0));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    createMutation.mutate();
  };

  const currentStep = STEPS[stepIndex].key;

  return (
    <DashboardLayout>
      <div className="mb-8 flex items-center justify-between gap-4">
        <PageHeader title="Novo Aluno" description="Cadastro guiado com agenda, financeiro e contrato em um fluxo claro." />
        <Button type="button" variant="outline" onClick={() => navigate(APP_PATHS.students)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-3 md:grid-cols-4">
          {STEPS.map((step, index) => {
            const active = index === stepIndex;
            const done = index < stepIndex;
            return (
              <button
                key={step.key}
                type="button"
                onClick={() => setStepIndex(index)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-4 text-left transition",
                  active && "border-primary bg-primary text-primary-foreground shadow-sm",
                  done && !active && "border-primary/20 bg-primary/5",
                  !active && !done && "border-border bg-card hover:bg-muted/50"
                )}
              >
                <div className={cn("rounded-lg p-2", active ? "bg-white/15" : "bg-muted")}>
                  <step.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide opacity-70">Etapa {index + 1}</p>
                  <p className="text-sm font-semibold">{step.label}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-sm">
          {currentStep === "personal" && (
            <section className="grid gap-6 p-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold">Dados pessoais</h2>
                  <p className="text-sm text-muted-foreground">Informacoes basicas de acesso para o aluno.</p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Nome do aluno</label>
                  <input required type="text" className="w-full rounded-lg border border-border bg-background p-3 text-sm" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">E-mail</label>
                  <input required type="email" className="w-full rounded-lg border border-border bg-background p-3 text-sm" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Senha inicial</label>
                  <input required type="password" className="w-full rounded-lg border border-border bg-background p-3 text-sm" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
                </div>
              </div>
              <div className="rounded-2xl bg-muted/40 p-6">
                <h3 className="text-sm font-semibold">Visao rapida</h3>
                <p className="mt-2 text-sm text-muted-foreground">O professor consegue cadastrar o aluno, configurar a mensalidade e já sair com a trilha e as cobrancas prontas.</p>
              </div>
            </section>
          )}

          {currentStep === "academic" && (
            <section className="grid gap-6 p-6 lg:grid-cols-[0.8fr_1.2fr]">
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold">Dados academicos</h2>
                  <p className="text-sm text-muted-foreground">Nivel inicial e percepcao de habilidade do aluno.</p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Nivel base</label>
                  <select className="w-full rounded-lg border border-border bg-background p-3 text-sm" value={formData.level} onChange={(e) => setFormData({ ...formData, level: e.target.value })}>
                    {Object.keys(curriculumData).filter((level) => level !== "ALL LEVELS").map((level) => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {(["listening", "speaking", "reading", "writing"] as const).map((skill) => (
                    <div key={skill}>
                      <label className="mb-1 block text-sm font-medium capitalize">{skill}</label>
                      <input type="number" min="1" max="10" className="w-full rounded-lg border border-border bg-background p-3 text-sm" value={formData[skill]} onChange={(e) => setFormData({ ...formData, [skill]: parseInt(e.target.value) })} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold">Agenda recorrente</h3>
                  <p className="text-sm text-muted-foreground">Selecione os horarios fixos. A sequencia de aulas sera gerada automaticamente.</p>
                </div>
                <RecurringSchedulePicker teacherId={user?.user_id} value={formData.schedules} onChange={(schedules) => setFormData({ ...formData, schedules })} />
              </div>
            </section>
          )}

          {currentStep === "finance" && (
            <section className="grid gap-6 p-6 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold">Financeiro</h2>
                  <p className="text-sm text-muted-foreground">Mensalidade, vencimento, observacoes e contrato.</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium">Mensalidade</label>
                    <input type="number" step="0.01" className="w-full rounded-lg border border-border bg-background p-3 text-sm" placeholder={String(financeSettings?.default_monthly_fee || "0.00")} value={formData.monthlyFee} onChange={(e) => setFormData({ ...formData, monthlyFee: e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Dia do vencimento</label>
                    <input type="number" min="1" max="28" className="w-full rounded-lg border border-border bg-background p-3 text-sm" value={formData.dueDay} onChange={(e) => setFormData({ ...formData, dueDay: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Observacoes financeiras</label>
                  <textarea className="min-h-32 w-full rounded-lg border border-border bg-background p-3 text-sm" value={formData.financeNotes} onChange={(e) => setFormData({ ...formData, financeNotes: e.target.value })} />
                </div>
              </div>
              <div>
                <FileUploadField
                  label="Contrato do aluno"
                  description="Contrato visivel para professor e aluno. Aceita PDF e imagens."
                  file={contractFile}
                  onChange={handleContractChange}
                  error={contractError}
                />
              </div>
            </section>
          )}

          {currentStep === "review" && (
            <section className="grid gap-6 p-6 lg:grid-cols-[0.9fr_1.1fr]">
              <div>
                <h2 className="text-lg font-semibold">Revisao final</h2>
                <p className="mt-1 text-sm text-muted-foreground">Confira os dados antes de concluir o cadastro.</p>
                <div className="mt-5 space-y-3">
                  {reviewItems.map((item) => (
                    <div key={item.label} className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3">
                      <span className="text-sm text-muted-foreground">{item.label}</span>
                      <span className="text-sm font-medium text-foreground">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl bg-muted/40 p-6">
                <h3 className="text-sm font-semibold">O que acontece ao salvar</h3>
                <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                  <p>O perfil financeiro do aluno sera criado com contrato, mensalidade e vencimento.</p>
                  <p>As mensalidades iniciais do aluno serao geradas automaticamente para os proximos meses.</p>
                  <p>A agenda recorrente continua alimentando a trilha de aulas conforme o nivel.</p>
                </div>
              </div>
            </section>
          )}

          <div className="flex items-center justify-between border-t border-border p-6">
            <Button type="button" variant="outline" onClick={stepIndex === 0 ? () => navigate(APP_PATHS.students) : previousStep}>
              {stepIndex === 0 ? "Cancelar" : "Voltar"}
            </Button>
            <div className="flex gap-3">
              {stepIndex < STEPS.length - 1 ? (
                <Button type="button" onClick={nextStep}>Continuar</Button>
              ) : (
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Cadastrando..." : "Cadastrar aluno"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </form>
    </DashboardLayout>
  );
};

export default CriarAluno;
