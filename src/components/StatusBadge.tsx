import { cn } from "@/lib/utils";

type Status = "completed" | "upcoming" | "scheduled" | "rescheduled" | "canceled" | "missed" | "paid" | "pending" | "failed";

const statusStyles: Record<Status, string> = {
  completed: "bg-success/10 text-success",
  upcoming: "bg-primary/10 text-primary",
  scheduled: "bg-primary/10 text-primary",
  rescheduled: "bg-warning/10 text-warning",
  canceled: "bg-destructive/10 text-destructive",
  missed: "bg-purple-500/10 text-purple-500",
  paid: "bg-success/10 text-success",
  pending: "bg-warning/10 text-warning",
  failed: "bg-destructive/10 text-destructive",
};

const statusLabels: Record<Status, string> = {
  completed: "Concluída",
  upcoming: "Agendada",
  scheduled: "Agendada",
  rescheduled: "Reagendada",
  canceled: "Cancelada",
  missed: "Falta",
  paid: "Pago",
  pending: "Pendente",
  failed: "Falhou",
};

const StatusBadge = ({ status }: { status: Status }) => (
  <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", statusStyles[status])}>
    {statusLabels[status]}
  </span>
);

export default StatusBadge;
