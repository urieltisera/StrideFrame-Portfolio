import Link from "next/link";
import type { ReactNode } from "react";

type PhotographerShellProps = {
  children: ReactNode;
  active?: "dashboard" | "events";
  accountName?: string;
};

export function PhotographerShell({ children, active = "dashboard", accountName }: PhotographerShellProps) {
  const navItem = (item: "dashboard" | "events") =>
    `flex items-center gap-3 rounded-[var(--radius-medium)] px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
      active === item
        ? "bg-white/12 text-white"
        : "text-white/60 hover:bg-white/8 hover:text-white"
    }`;

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)]">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-[var(--navy)] p-6 text-white lg:flex">
        <Link href="/photographer/dashboard" className="flex items-center gap-2 text-xl font-black tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--accent)] text-sm">✦</span>Stride<span className="text-[#9d8bff]">Frame</span>
        </Link>
        <p className="mt-2 text-xs text-white/45">Photographer workspace</p>
        <nav aria-label="Photographer navigation" className="mt-12 grid gap-2">
          <Link className={navItem("dashboard")} href="/photographer/dashboard"><span aria-hidden="true">▦</span>Dashboard</Link>
          <Link className={navItem("events")} href="/photographer/dashboard#events"><span aria-hidden="true">◫</span>Events</Link>
          <Link className="flex items-center gap-3 rounded-[var(--radius-medium)] px-3 py-2.5 text-sm font-semibold text-white/60 hover:bg-white/8 hover:text-white" href="/photographer/dashboard#events"><span aria-hidden="true">▧</span>Photos</Link>
          <Link className="flex items-center gap-3 rounded-[var(--radius-medium)] px-3 py-2.5 text-sm font-semibold text-white/60 hover:bg-white/8 hover:text-white" href="/photographer/dashboard#events"><span aria-hidden="true">◌</span>Orders</Link>
        </nav>
        <div className="mt-auto border-t border-white/10 pt-5">
          <p className="text-xs text-white/45">Signed in as</p>
          <p className="mt-1 truncate text-sm font-semibold text-white">{accountName || "Photographer"}</p>
        </div>
      </aside>
      <div className="border-b border-[var(--border)] bg-[var(--navy)] text-white lg:hidden">
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <Link href="/photographer/dashboard" className="font-black tracking-tight">Stride<span className="text-[#9d8bff]">Frame</span></Link>
          <nav aria-label="Photographer mobile navigation" className="flex gap-1 text-xs">
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
