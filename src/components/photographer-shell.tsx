import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "./brand";
import { Icon, type IconName } from "./icon";

type PhotographerShellProps = {
  children: ReactNode;
  active?: "dashboard" | "events" | "photos" | "albums" | "orders" | "settings" | "profile" | "upload";
  accountName?: string;
};

const navigation: Array<{ label: string; href: string; active: PhotographerShellProps["active"]; icon: IconName }> = [
  { label: "Upload photos", href: "/photographer/upload", active: "upload", icon: "upload" },
  { label: "Dashboard", href: "/photographer/dashboard", active: "dashboard", icon: "grid" },
  { label: "Photos", href: "/photographer/photos", active: "photos", icon: "image" },
  { label: "Albums", href: "/photographer/albums", active: "albums", icon: "layers" },
  { label: "Orders", href: "/photographer/orders", active: "orders", icon: "orders" },
  { label: "Payment settings", href: "/photographer/settings/payments", active: "settings", icon: "card" },
  { label: "Public profile", href: "/photographer/dashboard#public-profile", active: "profile", icon: "user" },
];

export function PhotographerShell({ children, active = "dashboard", accountName }: PhotographerShellProps) {
  const navItem = (item: PhotographerShellProps["active"]) =>
    `flex items-center gap-3 rounded-[var(--radius-medium)] px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
      active === item
        ? "bg-white/12 text-white"
        : "text-white/60 hover:bg-white/8 hover:text-white"
    }`;

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col bg-[var(--ink)] px-5 py-6 text-white lg:flex">
        <BrandLogo href="/photographer/dashboard" light />
        <p className="mt-2 text-xs text-white/45">Photographer workspace</p>
        <Link href="/photographer/upload" className="mt-8 flex items-center justify-center gap-2 rounded-[var(--radius-small)] bg-[var(--orange)] px-3 py-3 text-sm font-bold text-white transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--orange)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)]"><Icon name="upload" size={18} />Upload photos</Link>
        <div className="mt-10 grid gap-7">
          <nav aria-label="Photographer navigation" className="grid gap-1">
            <p className="sf-label mb-2 px-3 text-white/40">Overview</p>
            {navigation.slice(1, 2).map((item) => <Link key={item.href} className={navItem(item.active)} href={item.href}><Icon name={item.icon} size={18} />{item.label}</Link>)}
            <p className="sf-label mb-2 mt-6 px-3 text-white/40">Workspace</p>
            {navigation.slice(2, 5).map((item) => <Link key={item.href} className={navItem(item.active)} href={item.href}><Icon name={item.icon} size={18} />{item.label}</Link>)}
          </nav>
          <nav aria-label="Business navigation" className="grid gap-1">
            <p className="sf-label mb-2 px-3 text-white/40">Business</p>
            {navigation.slice(5, 6).map((item) => <Link key={item.href} className={navItem(item.active)} href={item.href}><Icon name={item.icon} size={18} />{item.label}</Link>)}
            <p className="sf-label mb-2 mt-6 px-3 text-white/40">Account</p>
            {navigation.slice(6).map((item) => <Link key={item.href} className={navItem(item.active)} href={item.href}><Icon name={item.icon} size={18} />{item.label}</Link>)}
          </nav>
        </div>
        <div className="mt-auto border-t border-white/10 pt-5">
          <p className="text-xs text-white/45">Signed in as</p>
          <p className="mt-1 truncate text-sm font-semibold text-white">{accountName || "Photographer"}</p>
        </div>
      </aside>
      <div className="border-b border-white/10 bg-[var(--ink)] text-white lg:hidden">
        <div className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-6">
          <BrandLogo href="/photographer/dashboard" light compact />
          <nav aria-label="Photographer mobile navigation" className="flex min-w-0 items-center gap-1 overflow-x-auto">
            {navigation.map((item) => <Link key={item.href} className={`${navItem(item.active)} shrink-0 px-2.5 text-xs`} href={item.href}><Icon name={item.icon} size={16} /><span className="hidden min-[430px]:inline">{item.label === "Payment settings" ? "Payments" : item.label}</span></Link>)}
          </nav>
        </div>
      </div>
      <main className="min-h-screen lg:pl-60">
        <div className="mx-auto max-w-7xl p-5 sm:p-6 md:p-8 lg:p-10">{children}</div>
      </main>
    </div>
  );
}
