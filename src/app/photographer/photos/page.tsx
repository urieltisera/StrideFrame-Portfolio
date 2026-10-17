import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/button";
import { EmptyState, PageHeader } from "@/components/feedback";
import { PhotographerShell } from "@/components/photographer-shell";
import { getCurrentPhotographer } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveEffectivePhotoPrice } from "@/lib/pricing";
import { formatUsd } from "@/lib/money";
import { albumDisplayTitle } from "@/lib/album-labels";
import { isInternalLibraryEvent } from "@/lib/upload-workflow";
import { PhotoInventory, type InventoryPhoto } from "./photo-inventory";

export default async function PhotosPage({ searchParams }: { searchParams?: Promise<{ uploaded?: string }> }) {
  const person = await getCurrentPhotographer();
  if (!person) redirect("/photographer/login");
  const photos = await prisma.photo.findMany({ where: { album: { photographerId: person.id } }, include: { album: { include: { event: true } } }, orderBy: { createdAt: "desc" }, take: 120 });
  const params = searchParams ? await searchParams : {};
  const inventoryPhotos: InventoryPhoto[] = photos.map((photo) => {
    const internal = isInternalLibraryEvent(photo.album.event, person.id);
    const price = resolveEffectivePhotoPrice(photo);
    return { id: photo.id, previewUrl: `/api/previews/${photo.previewKey}`, alt: photo.title || photo.originalFilename || "Photo preview", originalFilename: photo.originalFilename, albumTitle: internal ? "Unassigned photos" : albumDisplayTitle(photo.album), collectionLabel: internal ? undefined : photo.album.event.title, status: photo.status, priceLabel: formatUsd(price.priceCents) };
  });
  const uploaded = Number(params.uploaded || 0);
  return <PhotographerShell active="photos" accountName={person.name}><PageHeader eyebrow="Workspace" title="Photos" description={`${photos.length} moments in your library.`} action={<Link href="/photographer/upload"><Button type="button">Upload photos</Button></Link>} /><div className="mt-8">{uploaded > 0 && <div role="status" className="mb-5 rounded-[var(--radius-medium)] border border-[var(--border-strong)] bg-[var(--surface-interactive)] p-4 text-sm font-semibold">Photos uploaded — {uploaded} {uploaded === 1 ? "photo is" : "photos are"} ready in your library.</div>}{photos.length ? <PhotoInventory photos={inventoryPhotos} /> : <EmptyState title="Your photo library is empty" description="Upload a batch to see real previews, pricing and publication status here." action={<Link href="/photographer/upload"><Button type="button">Upload photos</Button></Link>} />}</div></PhotographerShell>;
}
