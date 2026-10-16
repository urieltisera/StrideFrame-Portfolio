import Link from "next/link";
import type { ReactNode } from "react";

type BrandMarkProps = { size?: number; className?: string };

export function BrandMark({ size = 32, className = "" }: BrandMarkProps) {
  return <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M 60 20 L 180 20 L 156 140 L 126 140 L 144 50 L 54 50 Z" fill="#FF5A1F" />
    <path d="M 140 180 L 20 180 L 44 60 L 74 60 L 56 150 L 146 150 Z" fill="currentColor" />
  </svg>;
}

type BrandLogoProps = { href?: string; light?: boolean; compact?: boolean; className?: string; ariaLabel?: string };

export function BrandLogo({ href, light = false, compact = false, className = "", ariaLabel = "StrideFrame home" }: BrandLogoProps) {
  const content = <span className={`inline-flex items-center gap-2 ${light ? "text-white" : "text-[var(--ink)]"} ${className}`}>
    <BrandMark size={compact ? 28 : 32} />
    {!compact && <span className="font-display text-xl font-extrabold tracking-[-0.04em]">StrideFrame</span>}
  </span>;
  return href ? <Link href={href} aria-label={ariaLabel} className="inline-flex rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--orange)] focus-visible:ring-offset-2">{content}</Link> : content;
}

export function BrandTagline({ children }: { children?: ReactNode }) {
  return <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">{children || "Every finish has a frame."}</p>;
}
