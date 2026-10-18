import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "./brand";
import { Icon } from "./icon";
import type { AppearanceTheme } from "@prisma/client";

export function CustomerShell({ children, eventName, appearance = "BLACK" }: { children: ReactNode; eventName?: string; appearance?: AppearanceTheme }) {
  return (
    <div data-appearance={appearance.toLowerCase()} className="sf-customer-shell min-h-screen bg-[var(--background)] text-[var(--text-primary)]">
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-white/90 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 md:px-10">
          <div className="flex min-w-0 items-center gap-3"><BrandLogo href="/" />{eventName && <span className="hidden max-w-[18rem] truncate border-l border-[var(--border)] pl-3 text-sm text-[var(--text-secondary)] sm:inline">{eventName}</span>}</div>
          <nav aria-label="Customer navigation" className="hidden items-center gap-6 text-sm font-semibold text-[var(--text-secondary)] md:flex"><Link href="/" className="transition-colors hover:text-[var(--text-primary)]">Events</Link><Link href="/photographer/login" className="transition-colors hover:text-[var(--text-primary)]">Photographer area</Link></nav>
          <Link href="/cart" aria-label="Cart" className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-small)] border border-[var(--border)] px-3 py-2 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"><Icon name="cart" size={17} /><span className="hidden sm:inline">Cart</span></Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-12">{children}</main>
    </div>
  );
}
