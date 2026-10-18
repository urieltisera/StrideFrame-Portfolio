import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { EmptyState, PageHeader } from "@/components/feedback";
import { PhotographerShell } from "@/components/photographer-shell";
import { StatusBadge } from "@/components/badge";
import { getCurrentPhotographer } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatUsd } from "@/lib/money";
import { publicProfileUrl } from "@/lib/qr";
import { logout, togglePublicProfile } from "@/app/photographer/actions";
import { albumDisplayTitle } from "@/lib/album-labels";
import { internalLibraryEventSlug } from "@/lib/upload-workflow";
import { CopyProfileLink } from "./profile-link-actions";
import { AppearanceControl } from "@/components/appearance-control";

export default async function Dashboard() {
  const person = await getCurrentPhotographer();
  if (!person) redirect("/photographer/login");
  const internalSlug = internalLibraryEventSlug(person.id);
  const [albums, photos, orders, draftAlbum] = await Promise.all([
    prisma.album.findMany({ where: { photographerId: person.id, slug: { not: "individual-photos" }, event: { slug: { not: internalSlug } } }, include: { _count: { select: { photos: true } } }, orderBy: { updatedAt: "desc" }, take: 4 }),
    prisma.photo.count({ where: { album: { photographerId: person.id } } }),
    prisma.order.findMany({ where: { photographerId: person.id }, include: { items: true }, orderBy: { createdAt: "desc" }, take: 6 }),
    prisma.album.findFirst({ where: { photographerId: person.id, status: "DRAFT", slug: { not: "individual-photos" }, event: { slug: { not: internalSlug } } }, orderBy: { updatedAt: "desc" }, select: { id: true, title: true, slug: true } }),
  ]);
  const paidOrders = orders.filter((order) => order.status === "PAID");
  const revenueCents = paidOrders.reduce((sum, order) => sum + order.totalCents, 0);
  const photosSold = paidOrders.reduce((sum, order) => sum + order.items.length, 0);

  return <PhotographerShell active="dashboard" accountName={person.name} appearance={person.appearanceTheme}>
    <div className="flex items-center justify-end gap-3"><span className="sf-caption hidden sm:inline">{person.email}</span><form action={logout}><Button type="submit" variant="ghost">Sign out</Button></form></div>
    <PageHeader eyebrow="Workspace" title="Your work. In focus." description="Photos, albums, orders and revenue at a glance." action={<Link href="/photographer/upload"><Button type="button">Upload photos <span aria-hidden="true">↗</span></Button></Link>} />
    <section aria-label="Business overview" className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[["Published albums", albums.filter((album) => album.status === "PUBLISHED").length.toString(), "Ready for customers"], ["Photos", photos.toLocaleString(), "Across your library"], ["Orders", orders.length.toString(), "Recent customer orders"], ["Revenue", formatUsd(revenueCents), `${photosSold} photos sold`]].map(([label, value, detail], index) => <Card key={label} className={`sf-metric-card p-5 ${index === 0 ? "border-[var(--accent)]/40" : ""}`}><p className="sf-label">{label}</p><p className="mt-5 font-display text-3xl font-extrabold tracking-tight">{value}</p><p className="sf-body-secondary">{detail}</p></Card>)}
    </section>
    <div className="mt-10">
      <section aria-labelledby="albums-heading"><div className="flex items-end justify-between"><div><p className="sf-kicker">Your work</p><h2 id="albums-heading" className="sf-section-title mt-2">Recent albums</h2></div><Link href="/photographer/albums" className="text-sm font-bold text-[var(--accent)]">View all</Link></div><div className="mt-5 grid gap-4 sm:grid-cols-2">{albums.map((album) => <Link href={`/photographer/albums/${album.id}`} key={album.id}><Card variant="interactive" className="h-full p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="sf-card-title">{albumDisplayTitle(album)}</h3><p className="sf-caption mt-2">{album._count.photos} photos</p></div><StatusBadge status={album.status} /></div><div className="mt-7 flex items-center justify-between border-t border-[var(--border)] pt-4"><span className="text-sm font-semibold text-[var(--text-secondary)]">Open album</span><span className="text-lg text-[var(--accent)]">↗</span></div></Card></Link>)}{albums.length === 0 && <div className="sm:col-span-2"><EmptyState title="Your library starts here" description="Upload your first batch and your albums will appear here." action={<Link href="/photographer/upload"><Button type="button">Upload photos</Button></Link>} /></div>}</div>{draftAlbum && <div className="sf-action-strip mt-5 rounded-[var(--radius-medium)] p-4"><div><p className="sf-kicker">Ready to share</p><p className="mt-1 text-sm font-bold">Publish {albumDisplayTitle(draftAlbum)}</p></div><Link href={`/photographer/albums/${draftAlbum.id}`} className="shrink-0 text-sm font-bold text-[var(--accent)]">Review album →</Link></div>}</section>
    </div>
    <section className="mt-10" aria-labelledby="orders-heading"><div className="flex items-end justify-between"><div><p className="sf-kicker">Commerce</p><h2 id="orders-heading" className="sf-section-title mt-2">Recent orders</h2></div><Link href="/photographer/orders" className="text-sm font-bold text-[var(--accent)]">View all</Link></div><div className="mt-5 overflow-hidden rounded-[var(--radius-large)] border border-[var(--border)] bg-[var(--surface)]">{orders.map((order) => <Link href={`/photographer/orders/${order.id}`} key={order.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4 last:border-0 hover:bg-[var(--surface-interactive)]"><div><p className="font-bold">{order.publicOrderCode}</p><p className="sf-caption mt-1">{order.customerEmail} · {order.items.length} photos</p></div><div className="flex items-center gap-4"><span className="font-bold">{formatUsd(order.totalCents)}</span><StatusBadge status={order.status} /></div></Link>)}{orders.length === 0 && <div className="p-5"><EmptyState title="No orders yet" description="Verified customer orders will appear here." /></div>}</div></section>
    <Card id="public-profile" className="mt-10 p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="sf-kicker">Public presence</p><h2 className="sf-section-title mt-2">Your photographer profile</h2><p className="sf-body-secondary mt-2">One permanent link for all of your published work.</p></div><StatusBadge status={person.publicProfileEnabled ? "published" : "draft"} /></div>{person.publicProfileEnabled && person.publicSlug ? <><p className="mt-5 break-all rounded-[var(--radius-medium)] bg-[var(--surface-interactive)] p-3 text-sm">{publicProfileUrl(person.publicSlug)}</p><div className="mt-4 flex flex-wrap gap-2"><Link href={`/p/${person.publicSlug}`} target="_blank"><Button type="button" variant="secondary">Open profile</Button></Link><CopyProfileLink url={publicProfileUrl(person.publicSlug)} /><a href="/api/photographer/profile-qr" download><Button type="button" variant="secondary">Download QR</Button></a><form action={togglePublicProfile}><input type="hidden" name="enabled" value="false" /><Button type="submit" variant="ghost">Disable</Button></form></div></> : <form action={togglePublicProfile} className="mt-5"><input type="hidden" name="enabled" value="true" /><Button type="submit">Enable public profile</Button></form>}<div className="mt-6 border-t border-[var(--border)] pt-6"><AppearanceControl appearance={person.appearanceTheme} /></div></Card>
  </PhotographerShell>;
}
