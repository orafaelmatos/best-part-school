import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { curriculumData } from "@/data/curriculum";
import RecurringSchedulePicker from "@/components/RecurringSchedulePicker";
import { ArrowLeft, CalendarClock, UserRound } from "lucide-react";

const CriarAluno = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    level: "A1/A2",
    listening: 1,
    speaking: 1,
    reading: 1,
    writing: 1,
    schedules: [] as { day: string; time: string }[],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: formData.name,
        email: formData.email,
        password: formData.password,
        role: "student",
        level: formData.level,
        listening: formData.listening,
        speaking: formData.speaking,
        reading: formData.reading,
        writing: formData.writing,
        teacher_id: user?.user_id || undefined,
        schedules: formData.schedules
          .filter((schedule) => schedule.day && schedule.time)
          .map((schedule) => ({
            day_of_week: parseInt(schedule.day),
            time: schedule.time,
          })),
      };

      const res = await api.post("/accounts/register/", payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-availability-recurring"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-day-slots"] });
      toast({ title: "Aluno cadastrado com sucesso!" });
      navigate("/alunos");
    },
    onError: (err: any) => {
      toast({
        title: "Erro ao cadastrar",
        description: err.response?.data?.schedule || err.response?.data?.email?.[0] || err.response?.data?.error || "Verifique os dados e tente novamente.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    createMutation.mutate();
  };

  return (
    <DashboardLayout>
      <div className="mb-6 flex items-center justify-between gap-4">
        <PageHeader title="Novo Aluno" description="Cadastre o aluno, defina o nível e escolha a agenda recorrente." />
        <Button type="button" variant="outline" onClick={() => navigate("/alunos")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(360px,520px)_1fr]">
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <UserRound className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold">Dados do aluno</h2>
                <p className="text-sm text-muted-foreground">Informações básicas de acesso e classificação.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Nome do aluno</label>
                <input
                  required
                  type="text"
                  className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">E-mail</label>
                <input
                  required
                  type="email"
                  className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Senha inicial</label>
                <input
                  required
                  type="password"
                  className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Nível base</label>
                <select
                  required
                  className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                  value={formData.level}
                  onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                >
                  {Object.keys(curriculumData).filter((level) => level !== "ALL LEVELS").map((level) => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-1 text-base font-semibold">Habilidades</h2>
            <p className="mb-5 text-sm text-muted-foreground">Use uma escala de 1 a 10 para registrar o ponto de partida.</p>
            <div className="grid grid-cols-2 gap-4">
              {(["listening", "speaking", "reading", "writing"] as const).map((skill) => (
                <div key={skill}>
                  <label className="mb-1 block text-sm font-medium capitalize">{skill}</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                    value={formData[skill]}
                    onChange={(e) => setFormData({ ...formData, [skill]: parseInt(e.target.value) })}
                  />
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <CalendarClock className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold">Agenda recorrente</h2>
                <p className="text-sm text-muted-foreground">Selecione os horários fixos. A trilha de aulas será criada automaticamente.</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            <RecurringSchedulePicker
              teacherId={user?.user_id}
              value={formData.schedules}
              onChange={(schedules) => setFormData({ ...formData, schedules })}
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-border p-6">
            <Button type="button" variant="outline" onClick={() => navigate("/alunos")}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Cadastrando..." : "Cadastrar aluno"}
            </Button>
          </div>
        </section>
      </form>
    </DashboardLayout>
  );
};

export default CriarAluno;
