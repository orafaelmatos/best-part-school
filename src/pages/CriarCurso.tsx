import { useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import { api } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

const CriarCurso = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    price: 0,
    isFree: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/courses/", { ...formData, created_by: 1 });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      navigate("/marketplace");
    } catch (err) {
      alert("Erro ao criar curso");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <PageHeader title="Criar Curso" description="Adicione um novo material ao marketplace." />
      <div className="max-w-md bg-card p-6 border border-border rounded-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Título</label>
            <input required type="text" className="w-full p-2 border border-border bg-background rounded-lg" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Descrição</label>
            <textarea required className="w-full p-2 border border-border bg-background rounded-lg" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
          </div>
          <div className="flex items-center gap-2 mt-4 mb-2">
            <input type="checkbox" id="isFree" checked={formData.isFree} onChange={e => setFormData({...formData, isFree: e.target.checked})} />
            <label htmlFor="isFree" className="text-sm">É gratuito?</label>
          </div>
          {!formData.isFree && (
            <div>
              <label className="block text-sm font-medium mb-1">Preço (R$)</label>
              <input required type="number" step="0.01" className="w-full p-2 border border-border bg-background rounded-lg" value={formData.price} onChange={e => setFormData({...formData, price: parseFloat(e.target.value)})} />
            </div>
          )}
          <button disabled={loading} className="w-full mt-4 py-2 bg-primary text-primary-foreground rounded-lg">{loading ? "Salvando..." : "Salvar Curso"}</button>
        </form>
      </div>
    </DashboardLayout>
  );
};
export default CriarCurso;
