import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { CustomerShell } from "@/components/customer-shell";
import { EmptyState } from "@/components/feedback";
import { SafeImage } from "@/components/safe-image";
import { getCurrentPhotographer } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createStorageProvider } from "@/lib/storage-factory";
import { albumDisplayTitle } from "@/lib/album-labels";

export default async function DraftAlbumPreview({ params }: { params: Promise<{ id: string }> }) {
  const person = await getCurrentPhotographer();
  if (!person) redirect("/photographer/login");
  const { id } = await params;
  const album = await prisma.album.findFirst({
    where: { id, photographerId: person.id, status: "DRAFT" },
    include: { event: true, photos: { orderBy: { createdAt: "asc" } } },
  });
  if (!album) notFound();
  const previewProvider = createStorageProvider();

  return <CustomerShell eventName={album.title} appearance={person.appearanceTheme}>
    <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
      <Link href={`/photographer/albums/${album.id}`} className="sf-body-secondary hover:text-[var(--text-primary)]">← Back to edit album</Link>
      <span className="rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1 text-xs font-bold uppercase tracking-[.12em] text-[var(--accent)]">Draft preview · private</span>
    </div>
    <section className="border-b border-[var(--border)] pb-8">
      <p className="sf-label text-[var(--accent)]">{person.name}</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
        <div><p className="sf-caption">Customer album preview</p><h1 className="sf-page-title mt-2">{albumDisplayTitle(album)}</h1>{album.description && <p className="sf-body-secondary mt-3 max-w-2xl">{album.description}</p>}</div>
        <Link href={`/photographer/albums/${album.id}`}><Button type="button" variant="secondary">Back to edit album</Button></Link>
      </div>
    </section>
    {album.photos.length === 0 ? <div className="mt-8"><EmptyState title="No photos in this draft yet" description="Add photos from the album editor to see the customer-facing preview." action={<Link href={`/photographer/albums/${album.id}`}><Button type="button">Add photos</Button></Link>} /></div> : <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">{album.photos.map((photo) => <Card key={photo.id} className="overflow-hidden p-0"><div className="aspect-[4/3] bg-[var(--surface-elevated)]"><SafeImage src={previewProvider.getPublicPreviewUrl(photo.previewKey)} alt={photo.title || "Draft album photo preview"} fallbackLabel="Preview unavailable" className="h-full w-full object-cover" /></div><div className="p-4"><p className="truncate text-sm font-semibold" title={photo.originalFilename}>{photo.title || photo.originalFilename}</p><p className="sf-caption mt-2">Private until published</p></div></Card>)}</div>}
  </CustomerShell>;
}
