import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { EmptyState, PageHeader } from "@/components/feedback";
import { PhotographerShell } from "@/components/photographer-shell";
import { StatusBadge } from "@/components/badge";
import { getCurrentPhotographer } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveEffectivePhotoPrice } from "@/lib/pricing";
import { formatUsd } from "@/lib/money";
import { albumDisplayTitle } from "@/lib/album-labels";

export default async function PhotosPage() {
  const person = await getCurrentPhotographer();
  if (!person) redirect("/photographer/login");
  const photos = await prisma.photo.findMany({ where: { album: { photographerId: person.id } }, include: { album: { include: { event: true } } }, orderBy: { createdAt: "desc" }, take: 120 });
  return <PhotographerShell active="photos" accountName={person.name}><PageHeader eyebrow="Workspace" title="Photos" description={`${photos.length} moments in your library.`} action={<Link href="/photographer/upload"><Button type="button">Upload photos</Button></Link>} /><div className="mt-8">{photos.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{photos.map((photo) => { const price = resolveEffectivePhotoPrice(photo); return <Card key={photo.id} className="overflow-hidden p-0"><div className="aspect-[4/3] bg-[var(--navy-soft)]"><img src={`/api/previews/${photo.previewKey}`} alt={photo.originalFilename} className="h-full w-full object-cover" /></div><div className="p-3"><div className="flex items-start justify-between gap-2"><p className="min-w-0 truncate text-sm font-bold" title={photo.originalFilename}>{photo.originalFilename}</p><StatusBadge status={photo.status} /></div><p className="sf-caption mt-2 truncate">{photo.album.event.title} · {albumDisplayTitle(photo.album)}</p><p className="mt-3 text-sm font-extrabold">{formatUsd(price.priceCents)}</p></div></Card>; })}</div> : <EmptyState title="Your photo library is empty" description="Upload a batch to see real previews, pricing and publication status here." action={<Link href="/photographer/upload"><Button type="button">Upload photos</Button></Link>} />}</div></PhotographerShell>;
}
