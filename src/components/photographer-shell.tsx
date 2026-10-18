import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "./brand";
import { Icon, type IconName } from "./icon";
import type { AppearanceTheme } from "@prisma/client";
import { getCurrentPhotographer } from "@/lib/auth";
import { logout } from "@/app/photographer/actions";

type PhotographerShellProps = {
  children: ReactNode;
  active?: "dashboard" | "events" | "photos" | "albums" | "sales" | "orders" | "settings" | "profile" | "upload";
  accountName?: string;
  appearance?: AppearanceTheme;
};

const navigation: Array<{ label: string; href: string; active: PhotographerShellProps["active"]; icon: IconName }> = [
  { label: "Photos", href: "/photographer/photos", active: "photos", icon: "image" },
  { label: "Albums", href: "/photographer/albums", active: "albums", icon: "layers" },
  { label: "Sales", href: "/photographer/sales", active: "sales", icon: "orders" },
];

export async function PhotographerShell({ children, active = "dashboard", accountName, appearance }: PhotographerShellProps) {
  const current = appearance ? null : await getCurrentPhotographer();
  const resolvedAppearance = appearance ?? current?.appearanceTheme ?? "BLACK";
  const navItem = (item: PhotographerShellProps["active"]) =>
    `flex items-center gap-3 rounded-[var(--radius-medium)] px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
      active === item
        ? "bg-white/12 text-white"
        : "text-white/60 hover:bg-white/8 hover:text-white"
    }`;

  return (
    <div data-photographer-shell data-appearance={resolvedAppearance.toLowerCase()} className="sf-photographer-shell min-h-screen bg-[var(--background)] text-[var(--text-primary)]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden h-dvh max-h-dvh w-60 flex-col overflow-hidden bg-[var(--ink)] px-5 py-6 text-white lg:flex">
        <div className="shrink-0"><BrandLogo href="/photographer/photos" light />
        <p className="mt-2 text-xs text-white/45">Photographer workspace</p>
        <Link href="/photographer/upload" className="mt-8 flex items-center justify-center gap-2 rounded-[var(--radius-small)] bg-[var(--orange)] px-3 py-3 text-sm font-bold text-white transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--orange)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)]"><Icon name="upload" size={18} />Upload Photos</Link>
        </div><div className="sf-sidebar-scroll mt-8 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 pr-1"><div className="grid gap-7">
          <nav aria-label="Photographer navigation" className="grid gap-1">
            <p className="sf-label mb-2 px-3 text-white/40">Workspace</p>
            {navigation.map((item) => <Link key={item.href} className={navItem(item.active)} href={item.href}><Icon name={item.icon} size={18} />{item.label}</Link>)}
          </nav>
        </div></div>
        <div className="mt-auto shrink-0 border-t border-white/10 pb-[env(safe-area-inset-bottom)] pt-5">
          <p className="text-xs text-white/45">Signed in as</p>
          <p className="mt-1 truncate text-sm font-semibold text-white">{accountName || "Photographer"}</p>
          <details className="mt-4 group">
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-[var(--radius-medium)] px-3 py-2 text-sm font-semibold text-white/70 hover:bg-white/8 hover:text-white"><span>Profile / account</span><span aria-hidden="true" className="text-white/45">⌄</span></summary>
            <div className="mt-2 grid gap-1 pl-3">
              <Link href="/photographer/dashboard#public-profile" className="rounded-[var(--radius-medium)] px-3 py-2 text-xs font-semibold text-white/60 hover:bg-white/8 hover:text-white">Public profile</Link>
              <Link href="/photographer/settings/payments" className="rounded-[var(--radius-medium)] px-3 py-2 text-xs font-semibold text-white/60 hover:bg-white/8 hover:text-white">Payment settings</Link>
              <form action={logout}><button type="submit" className="w-full rounded-[var(--radius-medium)] px-3 py-2 text-left text-xs font-semibold text-white/60 hover:bg-white/8 hover:text-white">Sign out</button></form>
            </div>
          </details>
        </div>
      </aside>
      <div className="border-b border-white/10 bg-[var(--ink)] text-white lg:hidden">
        <div className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-6">
          <BrandLogo href="/photographer/photos" light compact />
          <nav aria-label="Photographer mobile navigation" className="flex min-w-0 items-center gap-1 overflow-x-auto">
            {navigation.map((item) => <Link key={item.href} className={`${navItem(item.active)} shrink-0 px-2.5 text-xs`} href={item.href}><Icon name={item.icon} size={16} /><span className="hidden min-[430px]:inline">{item.label}</span></Link>)}
            <Link href="/photographer/upload" className="flex shrink-0 items-center gap-2 rounded-[var(--radius-medium)] bg-[var(--orange)] px-2.5 py-2.5 text-xs font-bold text-white"><Icon name="upload" size={16} /><span className="hidden min-[430px]:inline">Upload</span></Link>
          </nav>
          <details className="relative shrink-0">
            <summary aria-label="Profile and account" className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-[var(--radius-medium)] border border-white/15 text-sm font-bold text-white/75 hover:bg-white/10">•••</summary>
            <div className="absolute right-0 top-12 z-30 grid min-w-44 gap-1 rounded-[var(--radius-medium)] border border-white/15 bg-[var(--ink)] p-2 shadow-[var(--shadow-elevated)]">
              <Link href="/photographer/dashboard#public-profile" className="rounded-[var(--radius-medium)] px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white">Public profile</Link>
              <Link href="/photographer/settings/payments" className="rounded-[var(--radius-medium)] px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white">Payment settings</Link>
              <form action={logout}><button type="submit" className="w-full rounded-[var(--radius-medium)] px-3 py-2 text-left text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white">Sign out</button></form>
            </div>
          </details>
        </div>
      </div>
      <main className="sf-page-reveal min-h-screen lg:pl-60">
        <div className="mx-auto max-w-7xl p-5 sm:p-6 md:p-8 lg:p-10">{children}</div>
      </main>
    </div>
  );
}
