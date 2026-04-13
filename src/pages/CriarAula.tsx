import { useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import { api } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

const CriarAula = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    level: "A1",
    date: "",
    time: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const datetime = new Date(`${formData.date}T${formData.time}`).toISOString();
      await api.post("/lessons/", {
        title: formData.title,
        level: formData.level,
        date: datetime,
        status: "scheduled",
        teacher: 1, // default mock teacher id created previously
        student: 2, // default mock student id created previously
      });
      queryClient.invalidateQueries({ queryKey: ["lessons"] });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      navigate("/aulas");
    } catch (err) {
      alert("Erro ao criar aula");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <PageHeader title="Criar Nova Aula" description="Adicione uma nova aula ao sistema." />
      <div className="max-w-md bg-card p-6 border border-border rounded-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Título</label>
            <input required type="text" className="w-full p-2 rounded-lg border border-border bg-background" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Nível</label>
            <select className="w-full p-2 rounded-lg border border-border bg-background" value={formData.level} onChange={e => setFormData({...formData, level: e.target.value})}>
              {["A1","A2","B1","B2","C1","C2"].map(l => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Data</label>
              <input required type="date" className="w-full p-2 rounded-lg border border-border bg-background" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Hora</label>
              <input required type="time" className="w-full p-2 rounded-lg border border-border bg-background" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} />
            </div>
          </div>
          <button disabled={loading} className="w-full mt-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90">{loading ? "Salvando..." : "Salvar Aula"}</button>
        </form>
      </div>
    </DashboardLayout>
  );
};
export default CriarAula;
