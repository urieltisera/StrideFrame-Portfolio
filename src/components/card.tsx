import type { HTMLAttributes } from "react";
type CardProps = HTMLAttributes<HTMLDivElement> & { variant?: "default" | "elevated" | "interactive" };
const variants = { default: "", elevated: "shadow-[var(--shadow-elevated)]", interactive: "transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--accent)]/60 hover:bg-[var(--surface-interactive)]" };
export function Card({ variant = "default", className = "", ...props }: CardProps) { return <div className={`rounded-[var(--radius-large)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)] ${variants[variant]} ${className}`} {...props} />; }
