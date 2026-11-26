import * as React from "react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/** Bottom sheet for secondary choices and history. Built on the shared Radix sheet. */
export function BottomSheet({ open, onOpenChange, title, description, children, className, onCloseAutoFocus }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        onCloseAutoFocus={onCloseAutoFocus}
        className={cn("mx-auto max-w-2xl rounded-t-2xl border-0 bg-surface px-5 pt-3 text-ink shadow-overlay", className)}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-disabled" aria-hidden="true" />
        <SheetHeader className="mb-5 pr-12 text-left">
          <SheetTitle className="text-h3 text-ink">{title}</SheetTitle>
          {description ? <SheetDescription className="text-body text-ink-secondary">{description}</SheetDescription> : <SheetDescription className="sr-only">{title}</SheetDescription>}
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}
