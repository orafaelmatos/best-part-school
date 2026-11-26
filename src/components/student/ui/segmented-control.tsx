import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

type Item<T extends string> = { value: T; label: string; to?: string };

const itemClass = (active: boolean) => cn(
  "flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-md px-3 text-center text-body transition-[background-color,color] duration-150 ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
  active ? "bg-surface font-semibold text-ink shadow-raised" : "font-medium text-ink hover:bg-surface/60",
);

/**
 * Two to four mutually exclusive options. With `to` on items it navigates (aria-current);
 * otherwise it switches local state (aria-pressed).
 */
export function SegmentedControl<T extends string>({ items, value, onChange, label, className }: {
  items: Item<T>[]; value: T; onChange?: (value: T) => void; label: string; className?: string;
}) {
  const navigates = items.every((item) => item.to);
  const Wrapper = navigates ? "nav" : "div";
  return (
    <Wrapper aria-label={label} role={navigates ? undefined : "group"} className={cn("flex gap-1 rounded-lg bg-surface-muted p-1", className)}>
      {items.map((item) => {
        const active = item.value === value;
        return item.to ? (
          <Link key={item.value} to={item.to} aria-current={active ? "page" : undefined} className={itemClass(active)}>{item.label}</Link>
        ) : (
          <button key={item.value} type="button" aria-pressed={active} onClick={() => onChange?.(item.value)} className={itemClass(active)}>{item.label}</button>
        );
      })}
    </Wrapper>
  );
}
