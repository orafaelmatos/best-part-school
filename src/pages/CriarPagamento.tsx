import { useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import { api } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

const CriarPagamento = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    amount: 0,
    status: "pending",
    payment_method: "PIX",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/payments/", { ...formData });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      navigate("/pagamentos");
    } catch (err) {
      alert("Erro ao criar pagamento");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <PageHeader title="Registrar Pagamento" description="Crie um novo registro financeiro." />
      <div className="max-w-md bg-card p-6 border border-border rounded-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Valor (R$)</label>
            <input required type="number" step="0.01" className="w-full p-2 border border-border bg-background rounded-lg" value={formData.amount} onChange={e => setFormData({...formData, amount: parseFloat(e.target.value)})} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select className="w-full p-2 border border-border bg-background rounded-lg" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
              <option value="pending">Pendente (Pending)</option>
              <option value="paid">Pago (Paid)</option>
              <option value="failed">Falha (Failed)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Método de Pagamento</label>
            <input required type="text" className="w-full p-2 border border-border bg-background rounded-lg" value={formData.payment_method} onChange={e => setFormData({...formData, payment_method: e.target.value})} placeholder="PIX, Cartão, Boleto..." />
          </div>
          <button disabled={loading} className="w-full mt-4 py-2 bg-primary text-primary-foreground rounded-lg">{loading ? "Salvando..." : "Registrar"}</button>
        </form>
      </div>
    </DashboardLayout>
  );
};
export default CriarPagamento;
