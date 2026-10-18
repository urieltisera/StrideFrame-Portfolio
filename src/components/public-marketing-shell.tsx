import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "./brand";

const navigation = [
  { href: "/find-photos", label: "Find Photos" },
  { href: "/for-photographers", label: "For Photographers" },
  { href: "/photographer/login", label: "Sign In" },
];

export function PublicMarketingShell({ children }: { children: ReactNode }) {
  return <div className="sf-global-black min-h-screen bg-[var(--background)] text-[var(--text-primary)]">
    <header className="border-b border-white/10 bg-[var(--ink)] text-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 md:px-10"><BrandLogo href="/" light /><nav aria-label="Public navigation" className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm font-semibold sm:gap-x-6">{navigation.map((item) => <Link key={item.href} href={item.href} className="text-white/70 transition-colors hover:text-white">{item.label}</Link>)}<Link href="/photographer/register" className="rounded-[var(--radius-small)] bg-[var(--orange)] px-3 py-2 text-[var(--ink)] transition-colors hover:bg-white">Get Started</Link></nav></div></header>
    <main>{children}</main>
    <footer className="border-t border-white/10 bg-[var(--ink)] text-white"><div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-sm sm:flex-row sm:items-center sm:justify-between md:px-10"><div><BrandLogo href="/" light compact /><p className="mt-2 text-xs uppercase tracking-[.18em] text-white/45">Every finish has a frame.</p></div><div className="flex flex-wrap gap-5 text-white/60"><Link href="/find-photos" className="hover:text-white">Find Photos</Link><Link href="/for-photographers" className="hover:text-white">For Photographers</Link><Link href="/photographer/login" className="hover:text-white">Sign In</Link></div></div></footer>
  </div>;
}
