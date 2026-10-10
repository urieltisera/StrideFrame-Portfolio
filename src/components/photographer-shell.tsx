import Link from "next/link";
import type { ReactNode } from "react";

type PhotographerShellProps = {
  children: ReactNode;
  active?: "dashboard" | "events";
  accountName?: string;
};

export function PhotographerShell({ children, active = "dashboard", accountName }: PhotographerShellProps) {
  const navItem = (item: "dashboard" | "events") =>
    `rounded-[var(--radius-medium)] px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
      active === item
        ? "bg-[var(--surface-interactive)] text-[var(--text-primary)]"
        : "text-[var(--text-secondary)] hover:bg-[var(--surface-interactive)] hover:text-[var(--text-primary)]"
    }`;

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)]">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-[var(--border)] bg-[var(--surface)] p-6 lg:flex">
        <Link href="/photographer/dashboard" className="text-xl font-black tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
          Stride<span className="text-[var(--accent)]">Frame</span>
        </Link>
        <p className="sf-caption mt-2">Photographer workspace</p>
        <nav aria-label="Photographer navigation" className="mt-12 grid gap-2">
          <Link className={navItem("dashboard")} href="/photographer/dashboard">Dashboard</Link>
          <Link className={navItem("events")} href="/photographer/dashboard#events">Events</Link>
        </nav>
        <div className="mt-auto border-t border-[var(--border)] pt-5">
          <p className="sf-caption">Signed in as</p>
          <p className="mt-1 truncate text-sm font-semibold text-[var(--text-primary)]">{accountName || "Photographer"}</p>
        </div>
      </aside>
      <div className="border-b border-[var(--border)] bg-[var(--surface)] lg:hidden">
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <Link href="/photographer/dashboard" className="font-black tracking-tight">Stride<span className="text-[var(--accent)]">Frame</span></Link>
          <nav aria-label="Photographer mobile navigation" className="flex gap-1 text-sm">
            <Link className={navItem("dashboard")} href="/photographer/dashboard">Dashboard</Link>
            <Link className={navItem("events")} href="/photographer/dashboard#events">Events</Link>
          </nav>
        </div>
      </div>
      <main className="min-h-screen lg:pl-64">
        <div className="mx-auto max-w-7xl p-5 md:p-8 lg:p-10">{children}</div>
      </main>
    </div>
  );
}
