"use client";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<ButtonVariant, string> = {
  // Dark foreground on #20CC6D: white small text has insufficient contrast (spec 4.1).
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active",
  secondary: "bg-surface text-foreground border border-border hover:bg-muted active:bg-muted/80",
  ghost: "bg-transparent text-foreground hover:bg-muted active:ring-2 active:ring-border",
  danger: "bg-danger text-white hover:bg-danger/90 active:bg-danger/80",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  loading?: boolean;
  loadingText?: string;
  icon?: ReactNode;
  size?: "md" | "sm";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", loading = false, loadingText, icon, size = "md", className, children, disabled, type, onClick, ...rest },
  ref,
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      onClick={loading ? undefined : onClick}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium",
        "transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "min-h-9 px-3 text-sm",
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      <span>{loading && loadingText ? loadingText : children}</span>
    </button>
  );
});
