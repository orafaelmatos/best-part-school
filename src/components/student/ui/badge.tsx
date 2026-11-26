import * as React from "react";

import { cn } from "@/lib/utils";

const badgeTones = {
  neutral: "bg-surface-muted text-ink",
  primary: "bg-primary-light text-primary-dark",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  // Danger text on danger-soft fails AA for small text: keep the text dark.
  danger: "bg-danger-soft text-ink",
  ai: "bg-ai-soft text-ai",
  solid: "bg-primary text-primary-foreground",
} as const;

export type BadgeTone = keyof typeof badgeTones;

/** Read-only status or count. Always pair color with words ("Concluída", "2 pendentes"). */
export function Badge({ tone = "neutral", icon, className, children, ...props }: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone; icon?: React.ReactNode;
}) {
  return (
    <span className={cn("inline-flex min-h-6 items-center gap-1 rounded-full px-2.5 py-0.5 text-label [&_svg]:size-3.5 [&_svg]:shrink-0", badgeTones[tone], className)} {...props}>
      {icon}{children}
    </span>
  );
}

/** Selectable filter. Use inside a group with a visible label or aria-label. */
export const Chip = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }>(
  ({ selected = false, className, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-pressed={selected}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-body font-medium transition-colors duration-150 ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&_svg]:size-4",
        selected ? "border-primary bg-primary text-primary-foreground" : "border-line bg-surface text-ink-secondary hover:border-primary-soft hover:text-ink",
        className,
      )}
      {...props}
    />
  ),
);
Chip.displayName = "StudentChip";
