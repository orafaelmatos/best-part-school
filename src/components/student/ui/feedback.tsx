import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { iconStroke } from "@/design-system/tokens";

const alertTones: Record<string, { box: string; icon: string; Icon: LucideIcon }> = {
  info: { box: "bg-info-soft", icon: "text-info", Icon: Info },
  success: { box: "bg-success-soft", icon: "text-success", Icon: CheckCircle2 },
  warning: { box: "bg-warning-soft", icon: "text-warning", Icon: AlertTriangle },
  danger: { box: "bg-danger-soft", icon: "text-danger", Icon: XCircle },
};

/** Inline message. Text stays ink for contrast; the tone shows in the icon and background. */
export function Alert({ tone = "info", title, children, action, role, className }: {
  tone?: "info" | "success" | "warning" | "danger"; title: React.ReactNode; children?: React.ReactNode;
  action?: React.ReactNode; role?: "alert" | "status"; className?: string;
}) {
  const { box, icon, Icon } = alertTones[tone];
  return (
    <div role={role} className={cn("flex gap-3 rounded-lg p-4 text-ink", box, className)}>
      <Icon size={20} strokeWidth={iconStroke} className={cn("mt-0.5 shrink-0", icon)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold">{title}</p>
        {children && <div className="mt-1 text-body text-ink">{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}

/** Invitation to act when a list has nothing yet. Never an apology. */
export function EmptyState({ icon: Icon, title, description, action, className, compact = false }: {
  icon: LucideIcon; title: string; description?: React.ReactNode; action?: React.ReactNode; className?: string; compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center text-center", compact ? "px-4 py-6" : "px-6 py-10", className)}>
      <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-primary-subtle text-primary" aria-hidden="true">
        <Icon size={28} strokeWidth={iconStroke} />
      </span>
      <p className="text-h4 text-ink">{title}</p>
      {description && <p className="mt-1 max-w-xs text-body text-ink-secondary">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-md bg-surface-muted motion-safe:animate-pulse", className)} {...props} />;
}

/** Card-shaped loading placeholder. Announces itself to screen readers. */
export function SkeletonCard({ label = "Carregando", lines = 2, className }: { label?: string; lines?: number; className?: string }) {
  return (
    <div role="status" aria-label={label} className={cn("space-y-3 rounded-xl border border-line bg-surface p-5", className)}>
      <span className="sr-only">{label}…</span>
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: lines }, (_, index) => <Skeleton key={index} className={cn("h-4", index === lines - 1 ? "w-3/5" : "w-full")} />)}
    </div>
  );
}
