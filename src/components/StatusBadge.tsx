import { cn } from "@/lib/utils";

type Status = "completed" | "upcoming" | "rescheduled" | "canceled" | "paid" | "pending" | "failed";

const statusStyles: Record<Status, string> = {
  completed: "bg-success/10 text-success",
  upcoming: "bg-primary/10 text-foreground",
  rescheduled: "bg-warning/10 text-warning",
  canceled: "bg-destructive/10 text-destructive",
  paid: "bg-success/10 text-success",
  pending: "bg-warning/10 text-warning",
  failed: "bg-destructive/10 text-destructive",
};

const statusLabels: Record<Status, string> = {
  completed: "Concluída",
  upcoming: "Próxima",
  rescheduled: "Reagendada",
  canceled: "Cancelada",
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
