import Link from "next/link";
import { Card } from "@/components/card";
import { PublicMarketingShell } from "@/components/public-marketing-shell";
import { SafeImage } from "@/components/safe-image";
import { prisma } from "@/lib/prisma";
import { isInternalLibraryEvent } from "@/lib/upload-workflow";

export const dynamic = "force-dynamic";

export default async function FindPhotosPage() {
  const events = await prisma.event.findMany({ where: { status: "PUBLISHED" }, include: { photographer: { select: { name: true } }, albums: { where: { status: "PUBLISHED" }, include: { photos: { where: { status: "PUBLISHED" }, take: 1 } }, take: 1 } }, orderBy: { createdAt: "desc" }, take: 24 });
  const publicEvents = events.filter((event) => !isInternalLibraryEvent(event, event.photographerId));

  return <PublicMarketingShell><div className="mx-auto max-w-7xl px-5 py-16 md:px-10 md:py-24"><div className="max-w-2xl"><p className="sf-kicker text-[var(--accent)]">Public galleries</p><h1 className="sf-page-title mt-4">Find your photos.</h1><p className="sf-body-secondary mt-5 text-lg">Browse published galleries from the moments that matter. Open a gallery to find, choose and keep your photographs.</p></div><div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{publicEvents.map((event) => { const photo = event.albums[0]?.photos[0]; return <Link href={`/e/${event.slug}`} key={event.id}><Card variant="interactive" className="group h-full overflow-hidden p-0"><div className="aspect-[4/3] bg-[var(--secondary-dark)]">{photo ? <SafeImage src={`/api/previews/${photo.previewKey}`} alt="" fallbackLabel="Gallery preview unavailable" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <div className="grid h-full place-items-center text-white/40"><span className="font-display text-4xl">SF</span></div>}</div><div className="p-5"><p className="sf-caption">{event.photographer.name}</p><h2 className="sf-card-title mt-2">{event.title}</h2><p className="mt-5 text-sm font-bold text-[var(--accent)]">Open gallery <span aria-hidden="true">↗</span></p></div></Card></Link>; })}{publicEvents.length === 0 && <Card className="p-10 text-center sm:col-span-2 lg:col-span-3"><p className="sf-kicker">No published galleries yet</p><h2 className="mt-3 font-display text-2xl font-extrabold">Your next moment will be here.</h2><p className="sf-body-secondary mx-auto mt-3 max-w-md">Published galleries appear here when they are ready to share.</p></Card>}</div></div></PublicMarketingShell>;
}
