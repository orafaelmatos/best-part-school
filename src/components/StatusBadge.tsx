import { cn } from "@/lib/utils";

type Status = "completed" | "upcoming" | "scheduled" | "in_progress" | "rescheduled" | "canceled" | "missed" | "paid" | "pending" | "failed" | "awaiting_confirmation" | "overdue";

const statusStyles: Record<Status, string> = {
  completed: "bg-success/10 text-success",
  upcoming: "bg-primary/10 text-primary",
  scheduled: "bg-primary/10 text-primary",
  in_progress: "bg-blue-500/10 text-blue-600",
  rescheduled: "bg-warning/10 text-warning",
  canceled: "bg-destructive/10 text-destructive",
  missed: "bg-purple-500/10 text-purple-500",
  paid: "bg-success/10 text-success",
  pending: "bg-warning/10 text-warning",
  failed: "bg-destructive/10 text-destructive",
  awaiting_confirmation: "bg-amber-100 text-amber-700",
  overdue: "bg-rose-100 text-rose-700",
};

const statusLabels: Record<Status, string> = {
  completed: "Concluída",
  upcoming: "Agendada",
  scheduled: "Agendada",
  in_progress: "Em andamento",
  rescheduled: "Reagendada",
  canceled: "Cancelada",
  missed: "Falta",
  paid: "Pago",
  pending: "Pendente",
  failed: "Falhou",
  awaiting_confirmation: "Aguardando confirmacao",
  overdue: "Vencido",
};

const StatusBadge = ({ status }: { status: Status }) => (
  <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", statusStyles[status])}>
    {statusLabels[status]}
  </span>
);

export default StatusBadge;
