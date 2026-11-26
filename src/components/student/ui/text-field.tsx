import * as React from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";

export const inputClasses = "min-h-12 w-full rounded-md border border-line bg-surface px-4 text-body-lg text-ink placeholder:text-ink-muted transition-[border-color,box-shadow] duration-150 ease-standard focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:bg-surface-muted disabled:text-ink-muted aria-[invalid=true]:border-danger";

/** Labeled input with hint, error and optional leading icon. */
export const TextField = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & {
  label: string; hint?: string; error?: string; leadingIcon?: React.ReactNode; hideLabel?: boolean;
}>(({ label, hint, error, leadingIcon, hideLabel = false, id, className, ...props }, ref) => {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  const describedBy = [hint && `${inputId}-hint`, error && `${inputId}-error`].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={inputId} className={cn("mb-1.5 block text-body font-medium text-ink", hideLabel && "sr-only")}>{label}</label>
      <div className="relative">
        {leadingIcon && <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted [&_svg]:size-5" aria-hidden="true">{leadingIcon}</span>}
        <input ref={ref} id={inputId} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={cn(inputClasses, leadingIcon && "pl-11")} {...props} />
      </div>
      {hint && !error && <p id={`${inputId}-hint`} className="mt-1.5 text-caption text-ink-secondary">{hint}</p>}
      {error && <p id={`${inputId}-error`} className="mt-1.5 text-caption font-medium text-danger">{error}</p>}
    </div>
  );
});
TextField.displayName = "StudentTextField";

export const SearchBar = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string }>(
  ({ label, ...props }, ref) => <TextField ref={ref} type="search" label={label} hideLabel leadingIcon={<Search />} {...props} />,
);
SearchBar.displayName = "StudentSearchBar";
