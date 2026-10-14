import Link from "next/link";
import type { ReactNode } from "react";

export function CustomerShell({ children, eventName }: { children: ReactNode; eventName?: string }) {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)]">
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 md:px-10">
          <div className="flex min-w-0 items-center gap-3"><Link href="/" className="flex items-center gap-2 text-lg font-black tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"><span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--accent)] text-xs font-black text-white">✦</span>Stride<span className="text-[var(--accent)]">Frame</span></Link>{eventName && <span className="hidden truncate border-l border-[var(--border)] pl-3 text-sm text-[var(--text-secondary)] sm:inline">{eventName}</span>}</div>
          <nav aria-label="Customer navigation" className="hidden items-center gap-6 text-sm font-semibold text-[var(--text-secondary)] md:flex"><Link href="/" className="hover:text-[var(--text-primary)]">Events</Link><Link href="/photographer/login" className="hover:text-[var(--text-primary)]">Photographer area</Link></nav>
          <Link href="/cart" className="rounded-[var(--radius-medium)] border border-[var(--border)] px-3 py-2 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-interactive)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">Cart <span aria-hidden="true">→</span></Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-12">{children}</main>
    </div>
  );
}
