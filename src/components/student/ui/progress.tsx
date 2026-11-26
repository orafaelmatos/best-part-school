import * as React from "react";

import { cn } from "@/lib/utils";

const barTones = { primary: "bg-primary", success: "bg-success", ai: "bg-ai", onDark: "bg-primary-soft" } as const;

/** Linear progress. aria-valuenow uses the real count, not the percentage. */
export function ProgressBar({ value, max, label, tone = "primary", className, trackClassName }: {
  value: number; max: number; label: string; tone?: keyof typeof barTones; className?: string; trackClassName?: string;
}) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn("h-2 overflow-hidden rounded-full bg-surface-muted", trackClassName, className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-300 ease-standard", barTones[tone])} style={{ width: `${percent}%` }} />
    </div>
  );
}

/** Circular progress with optional center content. Default center shows the percentage. */
export function CircularProgress({ value, max, label, size = 64, strokeWidth = 6, children, className, onDark = false }: {
  value: number; max: number; label: string; size?: number; strokeWidth?: number; children?: React.ReactNode; className?: string; onDark?: boolean;
}) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} className={onDark ? "stroke-surface/15" : "stroke-surface-muted"} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - percent / 100)}
          className={cn("transition-[stroke-dashoffset] duration-300 ease-standard", onDark ? "stroke-primary-soft" : "stroke-primary")}
        />
      </svg>
      <span className={cn("absolute text-label", onDark ? "text-primary-foreground" : "text-ink")}>{children ?? `${percent}%`}</span>
    </div>
  );
}
