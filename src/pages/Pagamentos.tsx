import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { payments } from "@/data/mockData";
import { CreditCard } from "lucide-react";

const Pagamentos = () => {
  const totalPaid = payments.filter((p) => p.status === "paid").reduce((sum, p) => sum + p.amount, 0);
  const nextPayment = payments.find((p) => p.status === "pending");

  return (
    <DashboardLayout>
      <PageHeader title="Pagamentos" description="Histórico e status dos seus pagamentos." />

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="border border-border rounded-xl p-5 bg-card">
          <p className="text-sm text-muted-foreground mb-1">Total pago</p>
          <p className="text-2xl font-bold text-foreground">R$ {totalPaid.toFixed(2)}</p>
        </div>
        <div className="border border-border rounded-xl p-5 bg-card">
          <p className="text-sm text-muted-foreground mb-1">Próximo pagamento</p>
          <p className="text-2xl font-bold text-foreground">
            {nextPayment ? `R$ ${nextPayment.amount.toFixed(2)}` : "—"}
          </p>
          {nextPayment && (
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(nextPayment.date).toLocaleDateString("pt-BR")}
            </p>
          )}
        </div>
        <div className="border border-border rounded-xl p-5 bg-card flex items-center justify-center">
          <button className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 sidebar-transition">
            <CreditCard size={16} /> Pagar agora
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="border border-border rounded-xl bg-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Data</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Descrição</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Método</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Valor</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0 hover:bg-accent/50 sidebar-transition">
                <td className="px-5 py-4 text-sm text-card-foreground">{new Date(p.date).toLocaleDateString("pt-BR")}</td>
                <td className="px-5 py-4 text-sm text-card-foreground">{p.description}</td>
                <td className="px-5 py-4 text-sm text-muted-foreground">{p.method}</td>
                <td className="px-5 py-4 text-sm text-card-foreground text-right font-medium">R$ {p.amount.toFixed(2)}</td>
                <td className="px-5 py-4 text-right"><StatusBadge status={p.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
};

export default Pagamentos;
