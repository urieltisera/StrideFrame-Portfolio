import Link from "next/link";
import type { ReactNode } from "react";

export function CustomerShell({ children, eventName }: { children: ReactNode; eventName?: string }) {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)]">
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--background)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 md:px-10">
          <div className="min-w-0"><Link href="/" className="text-lg font-black tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">Stride<span className="text-[var(--accent)]">Frame</span></Link>{eventName && <span className="ml-3 hidden truncate border-l border-[var(--border)] pl-3 text-sm text-[var(--text-secondary)] sm:inline">{eventName}</span>}</div>
          <Link href="/cart" className="rounded-[var(--radius-medium)] border border-[var(--border)] px-3 py-2 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-interactive)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">Cart</Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-12">{children}</main>
    </div>
  );
}
