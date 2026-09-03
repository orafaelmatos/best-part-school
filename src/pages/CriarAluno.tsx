import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, BadgeDollarSign, BookOpen, CheckCircle2, ClipboardList, UserRound } from "lucide-react";
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
  { key: "tracking", label: "Acompanhamento", icon: ClipboardList },
  { key: "finance", label: "Financeiro", icon: BadgeDollarSign },
  { key: "review", label: "Revisao", icon: CheckCircle2 },
] as const;

const MAX_UPLOAD_SIZE = 8 * 1024 * 1024;
const trackingTextFields = [
  { key: "learningGoal", label: "Objetivo que quer aprender ingles", rows: 3 },
  { key: "taughtContent", label: "O que ja foi ensinado", rows: 4 },
  { key: "contentToTeach", label: "O que precisa ensinar", rows: 4 },
  { key: "strengths", label: "Pontos fortes", rows: 3 },
  { key: "weaknesses", label: "Pontos fracos", rows: 3 },
] as const;

const getTotalLessons = (level: string) => {
  const levelData = curriculumData[level as keyof typeof curriculumData] || { lessons: [], grammar: [] };
  const transversalData = curriculumData["ALL LEVELS"] || { lessons: [], grammar: [] };
  return levelData.lessons.length + levelData.grammar.length + transversalData.lessons.length + transversalData.grammar.length;
};

const CriarAluno = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [studentPhoto, setStudentPhoto] = useState<File | null>(null);
  const [studentPhotoError, setStudentPhotoError] = useState("");
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
    plannedLessons: String(getTotalLessons("A1/A2")),
    completedLessons: "0",
    contractStartDate: "",
    contractEndDate: "",
    learningGoal: "",
    taughtContent: "",
    contentToTeach: "",
    strengths: "",
    weaknesses: "",
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
      payload.append("planned_lessons_count", formData.plannedLessons || "0");
      payload.append("completed_lessons_count", formData.completedLessons || "0");
      if (formData.contractStartDate) payload.append("contract_start_date", formData.contractStartDate);
      if (formData.contractEndDate) payload.append("contract_end_date", formData.contractEndDate);
      payload.append("learning_goal", formData.learningGoal);
      payload.append("taught_content", formData.taughtContent);
      payload.append("content_to_teach", formData.contentToTeach);
      payload.append("strengths", formData.strengths);
      payload.append("weaknesses", formData.weaknesses);
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
      if (studentPhoto) {
        payload.append("photo", studentPhoto);
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
          err.response?.data?.completed_lessons_count?.[0] ||
          err.response?.data?.contract_end_date?.[0] ||
          err.response?.data?.photo?.[0] ||
          err.response?.data?.email?.[0] ||
          err.response?.data?.error ||
          "Verifique os dados e tente novamente.",
        variant: "destructive",
      });
    },
  });

  const pendingLessons = Math.max(Number(formData.plannedLessons || 0) - Number(formData.completedLessons || 0), 0);

  const reviewItems = useMemo(() => [
    { label: "Aluno", value: formData.name || "Nao informado" },
    { label: "E-mail", value: formData.email || "Nao informado" },
    { label: "Nivel", value: formData.level },
    { label: "Foto", value: studentPhoto ? "Adicionada" : "Sem foto" },
    { label: "Aulas planejadas", value: `${formData.plannedLessons || 0} aulas` },
    { label: "Aulas ja feitas", value: `${formData.completedLessons || 0} aulas` },
    { label: "Aulas pendentes", value: `${pendingLessons} aulas` },
    { label: "Inicio do contrato", value: formData.contractStartDate || "Nao informado" },
    { label: "Fim do contrato", value: formData.contractEndDate || "Nao informado" },
    { label: "Objetivo", value: formData.learningGoal || "Nao informado" },
    { label: "Mensalidade", value: `R$ ${formData.monthlyFee || financeSettings?.default_monthly_fee || "0,00"}` },
    { label: "Vencimento", value: `Dia ${formData.dueDay || financeSettings?.default_due_day || 10}` },
    { label: "Horarios", value: formData.schedules.length ? `${formData.schedules.length} horarios selecionados` : "Sem agenda recorrente" },
  ], [financeSettings, formData, pendingLessons, studentPhoto]);

  const handleStudentPhotoChange = (file: File | null) => {
    if (!file) {
      setStudentPhoto(null);
      setStudentPhotoError("");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setStudentPhotoError("A foto precisa ser uma imagem valida.");
      return;
    }
    if (file.size > MAX_UPLOAD_SIZE) {
      setStudentPhotoError("A foto deve ter no maximo 8 MB.");
      return;
    }
    setStudentPhotoError("");
    setStudentPhoto(file);
  };

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

  const handleLevelChange = (level: string) => {
    const currentDefault = String(getTotalLessons(formData.level));
    const nextDefault = String(getTotalLessons(level));
    setFormData({
      ...formData,
      level,
      plannedLessons: formData.plannedLessons === currentDefault ? nextDefault : formData.plannedLessons,
    });
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
        <div className="grid gap-3 md:grid-cols-5">
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
              <div className="space-y-4 rounded-2xl bg-muted/40 p-6">
                <FileUploadField
                  label="Foto do aluno"
                  description="A foto aparece na lista de alunos. Sem foto, o sistema mostra as iniciais."
                  accept=".png,.jpg,.jpeg,.webp"
                  formatsLabel="PNG, JPG, JPEG ou WEBP"
                  file={studentPhoto}
                  onChange={handleStudentPhotoChange}
                  error={studentPhotoError}
                />
                <div>
                  <h3 className="text-sm font-semibold">Visao rapida</h3>
                  <p className="mt-2 text-sm text-muted-foreground">O professor consegue cadastrar o aluno, configurar a mensalidade e ja sair com a trilha e as cobrancas prontas.</p>
                </div>
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
                  <select className="w-full rounded-lg border border-border bg-background p-3 text-sm" value={formData.level} onChange={(e) => handleLevelChange(e.target.value)}>
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

          {currentStep === "tracking" && (
            <section className="space-y-6 p-6">
              <div>
                <h2 className="text-lg font-semibold">Acompanhamento do aluno</h2>
                <p className="text-sm text-muted-foreground">Plano de aulas, contrato e pontos pedagogicos para orientar as proximas aulas.</p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">Quantidade de aulas que ele tera</label>
                  <input
                    type="number"
                    min="0"
                    className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                    value={formData.plannedLessons}
                    onChange={(e) => setFormData({ ...formData, plannedLessons: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Quantidade de aulas que ele ja teve</label>
                  <input
                    type="number"
                    min="0"
                    className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                    value={formData.completedLessons}
                    onChange={(e) => setFormData({ ...formData, completedLessons: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Aulas pendentes</label>
                  <input
                    type="number"
                    readOnly
                    className="w-full rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground"
                    value={pendingLessons}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">Data que comecou o contrato</label>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                    value={formData.contractStartDate}
                    onChange={(e) => setFormData({ ...formData, contractStartDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Data que terminara o contrato</label>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                    value={formData.contractEndDate}
                    onChange={(e) => setFormData({ ...formData, contractEndDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {trackingTextFields.map((field) => (
                  <div key={field.key} className={field.key === "learningGoal" ? "lg:col-span-2" : ""}>
                    <label className="mb-1 block text-sm font-medium">{field.label}</label>
                    <textarea
                      rows={field.rows}
                      className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                      value={formData[field.key]}
                      onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                    />
                  </div>
                ))}
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
                  <p>A trilha sera criada com {formData.plannedLessons || 0} aulas, considerando {formData.completedLessons || 0} ja feitas.</p>
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
