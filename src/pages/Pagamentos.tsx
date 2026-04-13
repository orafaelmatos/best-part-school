import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { CreditCard, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const Pagamentos = () => {
  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: async () => {
      const res = await api.get('/payments/');
      return res.data;
    }
  });

  const totalPaid = payments.filter((p: any) => p.status === "paid").reduce((sum: number, p: any) => sum + parseFloat(p.amount), 0);
  const nextPayment = payments.find((p: any) => p.status === "pending");

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <PageHeader title="Pagamentos" description="Histórico e status dos seus pagamentos." />
        <Link to="/pagamentos/novo" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg flex items-center gap-2 font-medium hover:opacity-90">
          <Plus size={18} /> Novo Registro
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="border border-border rounded-xl p-5 bg-card">
          <p className="text-sm text-muted-foreground mb-1">Total pago</p>
          <p className="text-2xl font-bold text-foreground">R$ {totalPaid.toFixed(2)}</p>
        </div>
        <div className="border border-border rounded-xl p-5 bg-card">
          <p className="text-sm text-muted-foreground mb-1">Próximo pagamento</p>
          <p className="text-2xl font-bold text-foreground">
            {nextPayment ? `R$ ${parseFloat(nextPayment.amount).toFixed(2)}` : "—"}
          </p>
          {nextPayment && (
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(nextPayment.created_at).toLocaleDateString("pt-BR")}
            </p>
          )}
        </div>
        <div className="border border-border rounded-xl p-5 bg-card flex items-center justify-center">
          <button className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 sidebar-transition">
            <CreditCard size={16} /> Pagar agora
          </button>
        </div>
      </div>

      <div className="border border-border rounded-xl bg-card overflow-hidden">
        {isLoading ? <p className="p-4">Carregando pagamentos...</p> : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Data</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Método</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Valor</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-4 text-center text-muted-foreground">Nenhum pagamento registrado.</td></tr>
              )}
              {payments.map((p: any) => (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-accent/50 sidebar-transition">
                  <td className="px-5 py-4 text-sm text-card-foreground">{new Date(p.created_at).toLocaleDateString("pt-BR")}</td>
                  <td className="px-5 py-4 text-sm text-muted-foreground">{p.payment_method}</td>
                  <td className="px-5 py-4 text-sm text-card-foreground text-right font-medium">R$ {parseFloat(p.amount).toFixed(2)}</td>
                  <td className="px-5 py-4 text-right flex justify-end"><StatusBadge status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </DashboardLayout>
  );
};
export default Pagamentos;
