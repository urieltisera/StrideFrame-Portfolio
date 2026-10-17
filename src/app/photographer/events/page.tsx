import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { EmptyState, PageHeader } from "@/components/feedback";
import { PhotographerShell } from "@/components/photographer-shell";
import { StatusBadge } from "@/components/badge";
import { getCurrentPhotographer } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function EventsPage() {
  const person = await getCurrentPhotographer();
  if (!person) redirect("/photographer/login");
  const events = await prisma.event.findMany({ where: { photographerId: person.id }, include: { _count: { select: { albums: true } } }, orderBy: { updatedAt: "desc" } });
  return <PhotographerShell active="events" accountName={person.name}><PageHeader eyebrow="Workspace" title="Events" description="Manage publication, sharing and the galleries behind your work." action={<Link href="/photographer/upload"><Button type="button">Upload photos</Button></Link>} /><div className="mt-8 grid gap-4">{events.map((event) => <Link href={`/photographer/events/${event.id}`} key={event.id}><Card variant="interactive" className="flex flex-wrap items-center justify-between gap-4 p-5"><div><div className="flex flex-wrap items-center gap-3"><h2 className="sf-card-title">{event.title}</h2><StatusBadge status={event.status} /></div><p className="sf-body-secondary mt-2">{event._count.albums} albums · /e/{event.slug}</p></div><span className="text-xl text-[var(--accent)]">↗</span></Card></Link>)}{events.length === 0 && <EmptyState title="No events yet" description="Start with Upload photos. You can create an event inline when you are ready." action={<Link href="/photographer/upload"><Button type="button">Upload photos</Button></Link>} />}</div></PhotographerShell>;
}
