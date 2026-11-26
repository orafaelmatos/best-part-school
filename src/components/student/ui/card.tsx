import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { iconStroke } from "@/design-system/tokens";

/**
 * One card structure for every content type (lesson, note, activity, vocabulary,
 * progress, AI suggestion, continue studying, material). Variants only change the surface.
 * Use cardVariants on a Link when the whole card navigates.
 */
export const cardVariants = cva("block rounded-xl text-ink", {
  variants: {
    variant: {
      default: "border border-line bg-surface",
      raised: "bg-surface shadow-raised",
      muted: "bg-surface-muted",
      highlight: "border border-primary-light bg-primary-subtle",
      ai: "border border-ai-soft bg-ai-soft",
      dashed: "border border-dashed border-line bg-transparent",
    },
    padding: { none: "", md: "p-4", lg: "p-5" },
    interactive: {
      true: "transition-[border-color,background-color,transform] duration-150 ease-standard hover:border-primary-soft active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
    },
  },
  defaultVariants: { variant: "default", padding: "lg" },
});

export interface CardProps extends React.HTMLAttributes<HTMLElement>, VariantProps<typeof cardVariants> {
  as?: "div" | "section" | "article";
}

export function Card({ as = "div", className, variant, padding, interactive, ...props }: CardProps) {
  return React.createElement(as, { className: cn(cardVariants({ variant, padding, interactive }), className), ...props });
}

const toneClasses = {
  primary: "bg-primary-subtle text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  ai: "bg-ai-soft text-ai",
  neutral: "bg-surface-muted text-ink-secondary",
  onDark: "bg-surface/10 text-primary-soft",
} as const;

export type Tone = keyof typeof toneClasses;

/** Icon on a soft square. The standard leading visual of cards and list items. */
export function IconTile({ icon: Icon, tone = "primary", size = "md", className }: {
  icon: LucideIcon; tone?: Tone; size?: "sm" | "md" | "lg"; className?: string;
}) {
  const box = size === "sm" ? "size-9" : size === "lg" ? "size-12" : "size-10";
  const iconPx = size === "lg" ? 24 : 20;
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-md", box, toneClasses[tone], className)} aria-hidden="true">
      <Icon size={iconPx} strokeWidth={iconStroke} />
    </span>
  );
}

export { toneClasses };
