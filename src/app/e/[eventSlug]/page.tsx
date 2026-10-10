import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { CustomerShell } from "@/components/customer-shell";
import { EmptyState, PageHeader } from "@/components/feedback";
import { prisma } from "@/lib/prisma";

export default async function EventPage({ params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  const event = await prisma.event.findFirst({ where: { slug: eventSlug, status: "PUBLISHED" }, include: { albums: { where: { status: "PUBLISHED" }, orderBy: { createdAt: "asc" } } } });
  if (!event) notFound();
  return <CustomerShell eventName={event.title}><section className="overflow-hidden rounded-[var(--radius-large)] border border-[var(--border)] bg-[var(--surface)]"><div className="relative px-5 py-12 sm:px-8 sm:py-16 md:px-12"><div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(190,242,100,0.12),transparent_45%)]" /><div className="relative max-w-3xl"><Link href="/" className="sf-body-secondary hover:text-[var(--text-primary)]">← StrideFrame</Link><p className="sf-label mt-12 text-[var(--accent)]">Public event gallery</p><h1 className="sf-display mt-3">{event.title}</h1>{event.description && <p className="sf-body-secondary mt-5 max-w-2xl text-lg">{event.description}</p>}<Link href={`/e/${event.slug}/find`} className="mt-8 inline-flex"><Button type="button">Find my photos</Button></Link></div></div></section><section className="mt-10"><PageHeader eyebrow="Explore" title="Choose an album" description="Browse published moments from this event." /><div className="mt-6 grid gap-4 sm:grid-cols-2">{event.albums.map((album, index) => <Link href={`/e/${event.slug}/${album.slug}`} key={album.id}><Card variant="interactive" className="group overflow-hidden"><div className="flex aspect-[16/9] items-end bg-[linear-gradient(135deg,var(--surface-elevated),var(--surface-interactive))] p-5"><span className="text-5xl font-black text-[var(--accent)]/70">{String(index + 1).padStart(2, "0")}</span></div><div className="p-5"><h2 className="sf-card-title">{album.title}</h2>{album.description && <p className="sf-body-secondary mt-2">{album.description}</p>}<p className="mt-4 text-sm font-bold text-[var(--accent)]">View album <span aria-hidden="true">→</span></p></div></Card></Link>)}{event.albums.length === 0 && <div className="sm:col-span-2"><EmptyState title="No published albums yet" description="Check back soon for photos from this event." /></div>}</div></section></CustomerShell>;
}
