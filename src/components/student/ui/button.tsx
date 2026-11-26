import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg text-button transition-[background-color,color,transform] duration-150 ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-busy:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary-dark active:bg-primary-dark",
        secondary: "bg-primary-light text-primary-dark hover:bg-primary-soft/60",
        outline: "border border-line bg-surface text-ink hover:bg-surface-muted",
        ghost: "text-primary hover:bg-primary-subtle",
        destructive: "bg-danger text-primary-foreground hover:bg-danger/90",
        onDark: "bg-surface text-primary-deep hover:bg-primary-subtle",
      },
      size: {
        sm: "min-h-11 px-4 text-body font-semibold [&_svg]:size-4",
        md: "min-h-12 px-5",
        lg: "min-h-[3.25rem] px-6",
        icon: "size-12 rounded-md p-0",
      },
      fullWidth: { true: "w-full" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Renders the child element (a Link, for example) with button styles. */
  asChild?: boolean;
  /** Shows a spinner, blocks clicks and announces the busy state. */
  loading?: boolean;
  loadingLabel?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, fullWidth, asChild = false, loading = false, loadingLabel, disabled, children, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size, fullWidth }), className);
    if (asChild) return <Slot ref={ref} className={classes} {...props}>{children}</Slot>;
    return (
      <button ref={ref} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
        {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
        {loading && loadingLabel ? loadingLabel : children}
      </button>
    );
  },
);
Button.displayName = "StudentButton";

export interface IconButtonProps extends Omit<ButtonProps, "size" | "children"> {
  /** Required: icon-only buttons need an accessible name. */
  "aria-label": string;
  icon: React.ReactNode;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, variant = "outline", className, ...props }, ref) => (
    <Button ref={ref} size="icon" variant={variant} className={className} {...props}>{icon}</Button>
  ),
);
IconButton.displayName = "StudentIconButton";
