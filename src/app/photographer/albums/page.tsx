import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { EmptyState, PageHeader } from "@/components/feedback";
import { PhotographerShell } from "@/components/photographer-shell";
import { StatusBadge } from "@/components/badge";
import { getCurrentPhotographer } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { albumDisplayTitle } from "@/lib/album-labels";
import { internalLibraryEventSlug } from "@/lib/upload-workflow";
import { AlbumCreateForm } from "./album-create-form";

export default async function AlbumsPage({ searchParams }: { searchParams?: Promise<{ error?: string }> }) {
  const person = await getCurrentPhotographer();
  if (!person) redirect("/photographer/login");
  const albums = await prisma.album.findMany({ where: { photographerId: person.id, slug: { not: "individual-photos" }, event: { slug: { not: internalLibraryEventSlug(person.id) } } }, include: { event: true, photos: { where: { status: "PUBLISHED" }, take: 1, orderBy: { createdAt: "asc" } }, _count: { select: { photos: true } } }, orderBy: { updatedAt: "desc" } });
  const query = searchParams ? await searchParams : {};
  return <PhotographerShell active="albums" accountName={person.name}><PageHeader eyebrow="Workspace" title="Albums" description="Organize your photos into albums and publish them when they are ready." action={<Link href="/photographer/upload"><Button type="button">Upload photos</Button></Link>} /><AlbumCreateForm error={query.error ? decodeURIComponent(query.error) : undefined} /><div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{albums.map((album) => <Link href={`/photographer/albums/${album.id}`} key={album.id}><Card variant="interactive" className="sf-focus-pull h-full overflow-hidden p-0"><div className="aspect-[4/3] bg-[var(--navy-soft)]">{album.photos[0] ? <img src={`/api/photographer/previews/${album.photos[0].previewKey}`} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-white/40"><span className="font-display text-4xl">SF</span></div>}</div><div className="p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="sf-card-title">{albumDisplayTitle(album)}</h2><p className="sf-caption mt-2">{album._count.photos} photos</p></div><StatusBadge status={album.status} /></div><div className="mt-5 flex items-center justify-between border-t border-[var(--border)] pt-4 text-sm"><span className="font-semibold text-[var(--text-secondary)]">Open album</span><span className="text-[var(--accent)]">↗</span></div></div></Card></Link>)}{albums.length === 0 && <div className="sm:col-span-2 xl:col-span-3"><EmptyState title="No albums yet" description="Create a draft album above, or upload photos and select the ones you want to publish together." action={<Link href="/photographer/upload"><Button type="button">Upload photos</Button></Link>} /></div>}</div></PhotographerShell>;
}
