import Link from "next/link";
import { Card } from "@/components/card";
import { Icon } from "@/components/icon";
import { PublicMarketingShell } from "@/components/public-marketing-shell";
import { SafeImage } from "@/components/safe-image";
import { LandingHowItWorks, LandingSportCard } from "@/components/landing-motion";
import { LANDING_TICKER_ITEMS } from "@/lib/landing-visuals";
import { prisma } from "@/lib/prisma";
import { isInternalLibraryEvent } from "@/lib/upload-workflow";

export const dynamic = "force-dynamic";

export default async function Home() {
  const events = await prisma.event.findMany({ where: { status: "PUBLISHED" }, include: { photographer: { select: { name: true } }, albums: { where: { status: "PUBLISHED" }, include: { photos: { where: { status: "PUBLISHED" }, take: 1 } }, take: 1 } }, orderBy: { createdAt: "desc" }, take: 3 });
  const publicEvents = events.filter((event) => !isInternalLibraryEvent(event, event.photographerId));
  const fallbackPhoto = publicEvents[0]?.albums[0]?.photos[0];
  const fallbackPhotoSrc = fallbackPhoto ? `/api/previews/${fallbackPhoto.previewKey}` : undefined;

  return <PublicMarketingShell>
    <section className="overflow-hidden bg-[var(--ink)] text-white"><div className="mx-auto grid max-w-7xl gap-10 px-5 pb-20 pt-16 md:grid-cols-[1.05fr_.95fr] md:items-center md:px-10 md:pb-24 md:pt-24"><div><p className="sf-kicker text-[var(--orange)]">Sports photography, in focus</p><h1 className="sf-display mt-5 max-w-3xl text-[4.5rem] leading-[.82] sm:text-[6rem] md:text-[8.5rem]"><span className="block">EVERY FINISH</span><span className="block">HAS A <span className="sf-hero-frame">FRAME.</span></span></h1><p className="mt-8 max-w-xl text-lg leading-8 text-white/65">Find the moments that matter. Discover your race, find your photos, and keep the finish.</p><div className="mt-8 flex flex-wrap gap-3"><Link href="/find-photos" className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-medium)] bg-[var(--orange)] px-5 py-3 text-sm font-bold text-[var(--ink)] hover:bg-white">Find Your Photos <Icon name="arrow" size={17} /></Link><Link href="/for-photographers" className="inline-flex min-h-11 items-center rounded-[var(--radius-medium)] border border-white/25 px-5 py-3 text-sm font-bold text-white hover:border-white">For Photographers</Link></div></div><LandingSportCard fallbackSrc={fallbackPhotoSrc} /></div></section>
    <div className="sf-ticker overflow-hidden bg-[var(--orange)] text-[var(--ink)]" aria-label="StrideFrame product principles"><div className="sf-ticker-track">{[0, 1].map((copy) => <div className="sf-ticker-group" aria-hidden={copy === 1} key={copy}>{LANDING_TICKER_ITEMS.map((item) => <span className="sf-ticker-item" key={`${copy}-${item}`}>{item}<span className="sf-ticker-dot" aria-hidden="true">•</span></span>)}</div>)}</div></div>
    <section className="mx-auto max-w-7xl px-5 py-16 md:px-10 md:py-20"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="sf-kicker">Published work</p><h2 className="sf-section-title mt-2">Real moments, ready to find.</h2></div><Link href="/find-photos" className="text-sm font-bold text-[var(--accent)] hover:underline">Find all photos <span aria-hidden="true">↗</span></Link></div><div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{publicEvents.map((event) => { const photo = event.albums[0]?.photos[0]; return <Link href={`/e/${event.slug}`} key={event.id}><Card variant="interactive" className="group h-full overflow-hidden p-0"><div className="aspect-[4/3] bg-[var(--secondary-dark)]">{photo ? <SafeImage src={`/api/previews/${photo.previewKey}`} alt="" fallbackLabel="Gallery preview unavailable" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <div className="grid h-full place-items-center text-white/40"><span className="font-display text-4xl">SF</span></div>}</div><div className="p-5"><p className="sf-caption">{event.photographer.name}</p><h3 className="sf-card-title mt-2">{event.title}</h3><p className="mt-5 text-sm font-bold text-[var(--accent)]">View gallery <span aria-hidden="true">↗</span></p></div></Card></Link>; })}{publicEvents.length === 0 && <Card className="p-8 text-center sm:col-span-2 lg:col-span-3"><p className="sf-kicker">Ready when you are</p><h2 className="mt-3 font-display text-2xl font-extrabold">Published galleries will appear here.</h2><p className="sf-body-secondary mx-auto mt-3 max-w-md">Browse the latest work when photographers publish their galleries.</p></Card>}</div></section>
    <LandingHowItWorks />
  </PublicMarketingShell>;
}
