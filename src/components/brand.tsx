import Link from "next/link";
import type { ReactNode } from "react";

type BrandMarkProps = { size?: number; className?: string };

export function BrandMark({ size = 32, className = "" }: BrandMarkProps) {
  return <img aria-hidden="true" className={className} width={size} height={size} src="/brand/production/vector/symbols/strideframe-symbol-color.svg" alt="" />;
}

type BrandLogoProps = { href?: string; light?: boolean; compact?: boolean; className?: string; ariaLabel?: string };

export function BrandLogo({ href, light = false, compact = false, className = "", ariaLabel = "StrideFrame home" }: BrandLogoProps) {
  const source = compact
    ? light ? "/brand/production/vector/symbols/strideframe-symbol-color.svg" : "/brand/production/vector/symbols/strideframe-symbol-black.svg"
    : light ? "/brand/production/vector/logos/strideframe-logo-primary-dark.svg" : "/brand/production/vector/logos/strideframe-logo-primary-light.svg";
  const width = compact ? 32 : 188;
  const height = compact ? 32 : 26;
  const content = <span className={`inline-flex items-center ${className}`}>
    <img aria-hidden="true" width={width} height={height} src={source} alt="" className="block h-auto max-w-full" />
  </span>;
  return href ? <Link href={href} aria-label={ariaLabel} className="inline-flex rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--orange)] focus-visible:ring-offset-2">{content}</Link> : content;
}

export function BrandTagline({ children }: { children?: ReactNode }) {
  return <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">{children || "Every finish has a frame."}</p>;
}
