import * as React from "react";
import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

/** Conversation message. Student on primary blue; AI tutor on a neutral surface with its mark. */
export function ChatBubble({ from, children, className, label }: {
  from: "student" | "ai"; children: React.ReactNode; className?: string; label?: string;
}) {
  if (from === "student") {
    return (
      <div className={cn("ml-auto max-w-[85%] rounded-xl rounded-br-xs bg-primary px-4 py-3 text-body-lg text-primary-foreground", className)}>
        <span className="sr-only">{label ?? "Você"}: </span>{children}
      </div>
    );
  }
  return (
    <div className={cn("flex max-w-[92%] gap-2", className)}>
      <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-ai-soft text-ai" aria-hidden="true"><Sparkles size={16} /></span>
      <div className="min-w-0 rounded-xl rounded-tl-xs border border-line bg-surface px-4 py-3 text-body-lg text-ink">
        <span className="sr-only">{label ?? "Tutor de IA"}: </span>{children}
      </div>
    </div>
  );
}

const blockStyles = {
  correction: { box: "bg-warning-soft", title: "text-warning" },
  translation: { box: "bg-surface-muted", title: "text-ink" },
  example: { box: "bg-primary-subtle", title: "text-primary-dark" },
  tip: { box: "bg-ai-soft", title: "text-ai" },
} as const;

/** Labeled block inside lessons or AI answers: correction, translation, example or tip. */
export function StudyBlock({ kind, title, children, className }: {
  kind: keyof typeof blockStyles; title: string; children: React.ReactNode; className?: string;
}) {
  const style = blockStyles[kind];
  return (
    <div className={cn("rounded-lg px-4 py-3", style.box, className)}>
      <p className={cn("text-label", style.title)}>{title}</p>
      <div className="mt-1 text-body-lg text-ink">{children}</div>
    </div>
  );
}

/** Discreet "thinking" indicator for AI responses. */
export function TypingIndicator({ label = "O tutor está escrevendo" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="inline-flex items-center gap-1 rounded-xl border border-line bg-surface px-4 py-3">
      {[0, 150, 300].map((delay) => (
        <span key={delay} className="size-1.5 rounded-full bg-ai-accent motion-safe:animate-pulse" style={{ animationDelay: `${delay}ms` }} />
      ))}
    </div>
  );
}
