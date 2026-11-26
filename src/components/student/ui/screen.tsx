import * as React from "react";

import { cn } from "@/lib/utils";

/** Page title inside the content area. The shell header shows the short screen name. */
export function ScreenTitle({ title, description, eyebrow, action, className }: {
  title: React.ReactNode; description?: React.ReactNode; eyebrow?: React.ReactNode; action?: React.ReactNode; className?: string;
}) {
  return (
    <header className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-body text-ink-secondary">{eyebrow}</p>}
        <h1 className="text-h2 text-ink">{title}</h1>
        {description && <p className="mt-1 text-body-lg text-ink-secondary">{description}</p>}
      </div>
      {action}
    </header>
  );
}

/** Vertical rhythm for a screen: 32px between sections. Flex gap skips visually hidden (sr-only) headings. */
export function Screen({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-8 [&>*]:min-w-0", className)} {...props} />;
}
