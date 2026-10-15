import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { CustomerShell } from "@/components/customer-shell";
import { EmptyState, PageHeader } from "@/components/feedback";
import { StatusBadge } from "@/components/badge";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { addToCart } from "@/app/customer-actions";
import { resolveEffectivePhotoPrice } from "@/lib/pricing";

export default async function AlbumPage({ params }: { params: Promise<{ eventSlug: string; albumSlug: string }> }) {
  const { eventSlug, albumSlug } = await params;
  const album = await prisma.album.findFirst({ where: { slug: albumSlug, status: "PUBLISHED", event: { slug: eventSlug, status: "PUBLISHED" } }, include: { event: true, photos: { where: { status: "PUBLISHED" }, orderBy: { createdAt: "asc" } } } });
  if (!album) notFound();
  return <CustomerShell eventName={album.event.title}><div className="mb-6"><Link href={`/e/${album.event.slug}`} className="sf-body-secondary hover:text-[var(--text-primary)]">← Back to {album.event.title}</Link></div><PageHeader eyebrow="Published album" title={album.title} description={album.description || "Select the moments you want to keep."} action={<Link href="/cart"><Button type="button" variant="secondary">View cart</Button></Link>} /><div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{album.photos.map((photo) => { const price = resolveEffectivePhotoPrice({ ...photo, album: { priceCents: album.priceCents } }); return <Card key={photo.id} className="group overflow-hidden"><div className="relative aspect-[4/3] bg-[var(--surface-elevated)]"><img src={storage.getPublicPreviewUrl(photo.previewKey)} alt={photo.title || "Event photo preview"} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" /></div><div className="p-4"><div className="flex items-start justify-between gap-3"><p className="truncate text-sm font-semibold text-[var(--text-secondary)]">{photo.title || "Event photo"}</p><StatusBadge status={photo.status} /></div><div className="mt-4 flex items-center justify-between gap-3"><p className="text-lg font-black">${(price.priceCents / 100).toFixed(2)} <span className="text-xs font-semibold text-[var(--text-muted)]">{price.currency}</span></p><form action={addToCart}><input type="hidden" name="photoId" value={photo.id} /><Button type="submit">Add to cart</Button></form></div></div></Card>; })}{album.photos.length === 0 && <div className="sm:col-span-2 lg:col-span-3"><EmptyState title="No published photos yet" description="This album is ready, but photos have not been published yet." /></div>}</div><div className="mt-8 flex justify-center"><Link href="/cart" className="text-sm font-bold text-[var(--accent)] hover:text-[var(--accent-hover)]">View cart →</Link></div></CustomerShell>;
}
