import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { CustomerShell } from "@/components/customer-shell";
import { EmptyState } from "@/components/feedback";
import { SafeImage } from "@/components/safe-image";
import { StatusBadge } from "@/components/badge";
import { prisma } from "@/lib/prisma";
import { createStorageProvider } from "@/lib/storage-factory";
import { albumDisplayTitle } from "@/lib/album-labels";
import { addToCart } from "@/app/customer-actions";
import { resolveEffectivePhotoPrice } from "@/lib/pricing";
import { isInternalLibraryEvent } from "@/lib/upload-workflow";

export default async function AlbumPage({ params, searchParams }: { params: Promise<{ eventSlug: string; albumSlug: string }>; searchParams?: Promise<{ fromProfile?: string }> }) {
  const { eventSlug, albumSlug } = await params;
  const query = searchParams ? await searchParams : {};
  const album = await prisma.album.findFirst({ where: { slug: albumSlug, status: "PUBLISHED", event: { slug: eventSlug, status: "PUBLISHED" } }, include: { event: { include: { photographer: { select: { name: true, publicSlug: true, publicProfileEnabled: true, appearanceTheme: true } } } }, photos: { where: { status: "PUBLISHED" }, orderBy: { createdAt: "asc" } } } });
  if (!album) notFound();
  if (isInternalLibraryEvent(album.event, album.event.photographerId)) album.event.title = album.event.photographer.name;
  const previewProvider = createStorageProvider();
  const profileReturn = query.fromProfile && album.event.photographer.publicProfileEnabled && album.event.photographer.publicSlug === query.fromProfile ? `/p/${query.fromProfile}` : `/e/${album.event.slug}`;
  const profileReturnLabel = profileReturn.startsWith("/p/") ? "← Back to photographer profile" : "← Back to gallery";
  return <CustomerShell eventName={album.event.title} appearance={album.event.photographer.appearanceTheme}><div className="mb-7 flex flex-wrap items-center justify-between gap-3"><Link href={profileReturn} className="sf-body-secondary hover:text-[var(--text-primary)]">{profileReturnLabel}</Link><div className="flex flex-wrap items-center gap-4">{album.event.photographer.publicProfileEnabled && album.event.photographer.publicSlug && <Link href={`/p/${album.event.photographer.publicSlug}`} className="text-sm font-bold text-[var(--accent)]">More from {album.event.photographer.name} ↗</Link>}<Link href={`/e/${album.event.slug}/find`} className="text-sm font-bold text-[var(--accent)]">Find My Photos</Link></div></div><section className="border-b border-[var(--border)] pb-8"><p className="sf-label text-[var(--accent)]">{album.event.photographer.name}</p><div className="mt-3 flex flex-wrap items-end justify-between gap-5"><div><p className="sf-caption">Gallery album</p><h1 className="sf-page-title mt-2">{albumDisplayTitle(album)}</h1>{album.description && <p className="sf-body-secondary mt-3 max-w-2xl">{album.description}</p>}</div><Link href="/cart"><Button type="button" variant="secondary">View cart</Button></Link></div></section><div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">{album.photos.map((photo) => { const price = resolveEffectivePhotoPrice({ ...photo, album: { priceCents: album.priceCents } }); return <article key={photo.id} className="group overflow-hidden rounded-[var(--radius-medium)] border border-[var(--border)] bg-[var(--surface)]"><div className="sf-focus-pull relative aspect-[4/3] bg-[var(--surface-elevated)]"><SafeImage src={previewProvider.getPublicPreviewUrl(photo.previewKey)} alt={photo.title || "Published photo preview"} fallbackLabel="Preview unavailable" className="h-full w-full object-cover" /></div><div className="p-4"><div className="flex items-start justify-between gap-3"><p className="truncate text-sm font-semibold text-[var(--text-secondary)]">{photo.title || "Photo"}</p><StatusBadge status={photo.status} /></div><div className="mt-4 flex items-center justify-between gap-3"><p className="text-lg font-black">${(price.priceCents / 100).toFixed(2)} <span className="text-xs font-semibold text-[var(--text-muted)]">{price.currency}</span></p><form action={addToCart}><input type="hidden" name="photoId" value={photo.id} /><Button type="submit" aria-label={`Add ${photo.title || "photo"} to cart`}>Add to cart</Button></form></div></div></article>; })}{album.photos.length === 0 && <div className="sm:col-span-2 lg:col-span-3"><EmptyState title="No published photos yet" description="This album is ready, but photos have not been published yet." /></div>}</div><div className="sf-action-strip mt-8 flex-wrap rounded-[var(--radius-medium)] p-4"><p className="font-bold">Ready to keep a moment?</p><Link href="/cart" className="text-sm font-bold text-[var(--accent)] hover:text-[var(--accent-hover)]">View cart →</Link></div></CustomerShell>;
}
