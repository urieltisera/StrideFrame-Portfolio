import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { EmptyState, PageHeader } from "@/components/feedback";
import { PhotographerShell } from "@/components/photographer-shell";
import { StatusBadge } from "@/components/badge";
import { getCurrentPhotographer } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publishAlbum, removePhoto, updatePhotoPrice, uploadPhotos } from "@/app/photographer/actions";
import { UploadForm } from "./upload-form";
import { formatUsd } from "@/lib/money";
import { qrUrl } from "@/lib/qr";
import { albumDisplayTitle } from "@/lib/album-labels";
import { CopyProfileLink } from "@/app/photographer/dashboard/profile-link-actions";

export default async function AlbumPage({ params }: { params: Promise<{ id: string }> }) {
  const person = await getCurrentPhotographer();
  if (!person) redirect("/photographer/login");
  const { id } = await params;
  const album = await prisma.album.findFirst({ where: { id, photographerId: person.id }, include: { event: true, photos: true, qrLinks: true } });
  if (!album) notFound();
  const qr = album.qrLinks[0];

  return (
    <PhotographerShell active="albums" accountName={person.name}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><Link href="/photographer/photos" className="sf-body-secondary hover:text-[var(--text-primary)]">← Back to Photos</Link>{album.status === "PUBLISHED" && <Link href={`/e/${album.event.slug}/${album.slug}`}><Button type="button" variant="secondary">View public album</Button></Link>}</div>
      <PageHeader eyebrow="Album" title={albumDisplayTitle(album)} description={album.description || "Manage photos, pricing and public access for this album."} action={<div className="flex flex-wrap items-center gap-2"><StatusBadge status={album.status} />{album.status !== "PUBLISHED" && <form action={publishAlbum}><input type="hidden" name="albumId" value={album.id} /><Button type="submit">Publish</Button></form>}</div>} />

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="p-6 md:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="sf-label text-[var(--accent)]">Photo library</p><h2 className="sf-section-title mt-2">Upload photos</h2><p className="sf-body-secondary mt-2">Originals remain private. Public galleries use protected previews.</p></div><div className="text-right"><p className="text-3xl font-black">{album.photos.length}</p><p className="sf-caption">photos</p></div></div><div className="mt-6"><UploadForm albumId={album.id} eventId={album.eventId} albumPriceCents={album.priceCents} action={uploadPhotos} /></div></Card>

        <Card className="p-6 md:p-7"><p className="sf-label text-[var(--accent)]">Publication & sharing</p><h2 className="sf-section-title mt-2">{album.status === "PUBLISHED" ? "This album is public" : "This album is private"}</h2><p className="sf-body-secondary mt-2">{album.status === "PUBLISHED" ? "Published photos are available in the public gallery. Draft photos remain private." : "Publish this album when you are ready to share its published photos."}</p>{album.status === "PUBLISHED" && <>{qr ? <div className="mt-5 rounded-[var(--radius-medium)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4"><StatusBadge status={qr.status} /><code className="mt-3 block break-all text-xs text-[var(--text-secondary)]">{qrUrl(qr.code)}</code></div> : <p className="mt-5 text-sm text-[var(--text-secondary)]">A share link is not available for this legacy album yet.</p>}<div className="mt-4 flex flex-wrap gap-2">{qr && <><CopyProfileLink url={qrUrl(qr.code)} /><a href={`/e/${album.event.slug}/${album.slug}`}><Button type="button" variant="secondary">View public album</Button></a><a href={`/api/qr/${qr.code}`} download><Button type="button" variant="secondary">Download QR</Button></a></>}</div></>}</Card>
      </div>

      <section className="mt-12" aria-labelledby="photos-heading"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="sf-label text-[var(--accent)]">Inventory</p><h2 id="photos-heading" className="sf-section-title mt-2">Photos</h2></div><p className="sf-caption">Preview and price management</p></div>{album.photos.length === 0 ? <div className="mt-5"><EmptyState title="No photos yet" description="Upload a batch above to start building this album." /></div> : <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"><>{album.photos.map((photo) => <Card key={photo.id} className="overflow-hidden"><div className="aspect-[4/3] bg-[var(--surface-elevated)]"><img src={`/api/previews/${photo.previewKey}`} alt={photo.originalFilename} className="h-full w-full object-cover" /></div><div className="p-4"><div className="flex items-start justify-between gap-3"><p className="truncate text-sm font-semibold" title={photo.originalFilename}>{photo.originalFilename}</p><StatusBadge status={photo.status} /></div><div className="mt-3 flex items-center justify-between"><span className="text-lg font-black">{formatUsd(photo.priceOverrideCents ?? album.priceCents)}</span><form action={removePhoto}><input type="hidden" name="photoId" value={photo.id} /><input type="hidden" name="eventId" value={album.eventId} /><Button type="submit" variant="ghost" className="text-[var(--error)]">Delete</Button></form></div><form action={updatePhotoPrice} className="mt-4 flex flex-wrap gap-2"><input type="hidden" name="photoId" value={photo.id} /><input type="hidden" name="eventId" value={album.eventId} /><input name="priceDollars" inputMode="decimal" pattern="^\d+(\.\d{1,2})?$" defaultValue={photo.priceOverrideCents === null ? "" : (photo.priceOverrideCents / 100).toFixed(2)} placeholder="Album price" className="min-h-10 min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-3 text-sm" /><Button type="submit" variant="secondary">{photo.priceOverrideCents === null ? "Set override" : "Save price"}</Button>{photo.priceOverrideCents !== null && <button type="submit" name="clearOverride" value="true" className="rounded-xl px-3 text-xs font-bold text-[var(--accent)]">Use album price</button>}</form></div></Card>)}</></div>}</section>
    </PhotographerShell>
  );
}
