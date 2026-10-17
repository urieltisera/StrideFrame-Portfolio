import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/card";
import { CustomerShell } from "@/components/customer-shell";
import { EmptyState } from "@/components/feedback";
import { prisma } from "@/lib/prisma";
import { isInternalLibraryEvent } from "@/lib/upload-workflow";

export default async function PublicPhotographerProfile({ params }: { params: Promise<{ publicSlug: string }> }) {
  const { publicSlug } = await params;
  const photographer = await prisma.photographer.findUnique({
    where: { publicSlug },
    select: {
      name: true,
      id: true,
      publicProfileEnabled: true,
      events: {
        where: { status: "PUBLISHED" },
        select: { title: true, slug: true, description: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!photographer || !photographer.publicProfileEnabled) notFound();
  const publicEvents = photographer.events.filter((event) => !isInternalLibraryEvent(event, photographer.id));

  return <CustomerShell eventName={photographer.name}>
    <section className="rounded-[2rem] bg-[var(--navy)] p-8 text-white md:p-12">
      <p className="sf-label text-[#b8aaff]">Photographer profile</p>
      <h1 className="mt-4 text-4xl font-black tracking-tight md:text-6xl">{photographer.name}</h1>
      <p className="mt-4 max-w-xl text-white/70">Browse published event galleries and find the moments you want to keep.</p>
    </section>
    <section className="mt-12" aria-labelledby="published-work-heading">
      <p className="sf-label text-[var(--accent)]">Published work</p>
      <h2 id="published-work-heading" className="sf-section-title mt-2">Event galleries</h2>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        {publicEvents.map((event) => <Link href={`/e/${event.slug}`} key={event.slug}>
          <Card variant="interactive" className="h-full p-6">
            <p className="sf-caption">{event.createdAt.toLocaleDateString()}</p>
            <h3 className="sf-card-title mt-2">{event.title}</h3>
            {event.description && <p className="sf-body-secondary mt-2">{event.description}</p>}
            <p className="mt-5 text-sm font-bold text-[var(--accent)]">Open gallery →</p>
          </Card>
        </Link>)}
        {publicEvents.length === 0 && <div className="sm:col-span-2"><EmptyState title="No published events yet" description="Check back soon for this photographer's latest galleries." /></div>}
      </div>
    </section>
  </CustomerShell>;
}
