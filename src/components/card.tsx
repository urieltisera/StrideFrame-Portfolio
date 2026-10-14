import type { HTMLAttributes } from "react";
type CardProps = HTMLAttributes<HTMLDivElement> & { variant?: "default" | "elevated" | "interactive" };
const variants = { default: "", elevated: "shadow-[var(--shadow-elevated)]", interactive: "transition-all hover:-translate-y-0.5 hover:border-[var(--accent)]/40 hover:bg-[var(--surface-interactive)]" };
export function Card({ variant = "default", className = "", ...props }: CardProps) { return <div className={`rounded-[var(--radius-large)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)] ${variants[variant]} ${className}`} {...props} />; }
