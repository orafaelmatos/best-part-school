import * as React from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

/** Section title with an optional "see all" link. */
export function SectionHeader({ id, title, description, actionLabel, actionTo, action, className }: {
  id?: string; title: string; description?: string; actionLabel?: string; actionTo?: string; action?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 id={id} className="text-h4 text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-body text-ink-secondary">{description}</p>}
      </div>
      {action}
      {actionTo && actionLabel && (
        <Link to={actionTo} className="-mr-2 inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-md px-2 text-body font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          {actionLabel}<ChevronRight size={16} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

/** Groups list items in one surface with dividers. Avoids cards inside cards. */
export function ListGroup({ className, children, ...props }: React.HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn("divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface", className)} {...props}>{children}</ul>;
}

type ListItemProps = {
  leading?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  /** Internal route. Renders a Link with a chevron. */
  to?: string;
  href?: string;
  /** Opens href in a new tab (native apps route it to the system browser). */
  external?: boolean;
  onClick?: () => void;
  className?: string;
  /** Wraps in <li>. Set false when the item is not inside a ListGroup. */
  asListItem?: boolean;
  "aria-label"?: string;
};

export function ListItem({ leading, title, description, meta, trailing, to, href, external = false, onClick, className, asListItem = true, ...aria }: ListItemProps) {
  const interactive = Boolean(to || href || onClick);
  const content = (
    <>
      {leading}
      <span className="min-w-0 flex-1">
        {meta && <span className="mb-0.5 block text-caption text-ink-muted">{meta}</span>}
        <span className="block text-body font-medium text-ink">{title}</span>
        {description && <span className="mt-0.5 block text-caption text-ink-secondary">{description}</span>}
      </span>
      {trailing ?? (interactive && <ChevronRight size={20} className="shrink-0 text-ink-muted" aria-hidden="true" />)}
    </>
  );
  const classes = cn(
    "flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left",
    interactive && "transition-colors duration-150 ease-standard hover:bg-surface-muted active:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
    className,
  );
  const element = to ? <Link to={to} className={classes} {...aria}>{content}</Link>
    : href ? <a href={href} className={classes} {...(external ? { target: "_blank", rel: "noreferrer" } : {})} {...aria}>{content}</a>
      : onClick ? <button type="button" onClick={onClick} className={classes} {...aria}>{content}</button>
        : <div className={classes}>{content}</div>;
  return asListItem ? <li>{element}</li> : element;
}
