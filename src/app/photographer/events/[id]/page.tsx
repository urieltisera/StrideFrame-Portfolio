import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { EmptyState, PageHeader } from "@/components/feedback";
import { Input, Select } from "@/components/form-fields";
import { PhotographerShell } from "@/components/photographer-shell";
import { StatusBadge } from "@/components/badge";
import { getCurrentPhotographer } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAlbum, createEventQr, deleteAlbum, deleteEvent, publishEvent, toggleQr, unpublishEvent, updateAlbum, updateEvent } from "@/app/photographer/actions";
import { qrUrl } from "@/lib/qr";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const person = await getCurrentPhotographer();
  if (!person) redirect("/photographer/login");
  const { id } = await params;
  const event = await prisma.event.findFirst({
    where: { id, photographerId: person.id },
    include: { qrLinks: true, albums: { include: { _count: { select: { photos: true } } } } },
  });
  if (!event) notFound();
  const qr = event.qrLinks[0];

  return (
    <PhotographerShell active="events" accountName={person.name}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href="/photographer/dashboard" className="sf-body-secondary hover:text-[var(--text-primary)]">← Back to dashboard</Link>
        <div className="flex flex-wrap gap-2">
          <Link href={`/e/${event.slug}`}><Button type="button" variant="secondary">View public page</Button></Link>
          <form action={deleteEvent}><input type="hidden" name="id" value={event.id} /><Button type="submit" variant="destructive">Delete event</Button></form>
        </div>
      </div>

      <PageHeader
        eyebrow="Event management"
        title={event.title}
        description={event.description || "Organize albums, publication and sharing for this event."}
        action={<StatusBadge status={event.status} />}
      />

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="p-6 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="sf-label">Publication</p><h2 className="sf-section-title mt-2">{event.status === "PUBLISHED" ? "This event is live" : "This event is private"}</h2><p className="sf-body-secondary mt-2">{event.status === "PUBLISHED" ? "Customers can browse published albums through the public link." : "Publish when the gallery is ready for customers."}</p></div>
            {event.status === "PUBLISHED" ? <form action={unpublishEvent}><input type="hidden" name="id" value={event.id} /><Button type="submit" variant="secondary">Unpublish event</Button></form> : <form action={publishEvent}><input type="hidden" name="id" value={event.id} /><Button type="submit">Publish event</Button></form>}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-[var(--radius-medium)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4"><span className="sf-caption">Public link</span><code className="text-sm text-[var(--text-secondary)]">/e/{event.slug}</code></div>
        </Card>

        <Card className="p-6 md:p-7">
          <p className="sf-label text-[var(--accent)]">Event details</p>
          <h2 className="sf-section-title mt-2">Edit event</h2>
          <form action={updateEvent} className="mt-5 grid gap-4"><input type="hidden" name="id" value={event.id} /><Input id="event-title" name="title" label="Title" required defaultValue={event.title} /><Input id="event-slug" name="slug" label="Public URL slug" required pattern="[a-z0-9-]+" defaultValue={event.slug} /><label htmlFor="event-description" className="grid gap-2"><span className="sf-label">Description</span><textarea id="event-description" name="description" defaultValue={event.description ?? ""} rows={4} className="rounded-[var(--radius-medium)] border border-[var(--border)] bg-[var(--surface-elevated)] p-3 text-[var(--text-primary)] focus:border-[var(--accent)]" /></label><Button type="submit" variant="secondary">Save changes</Button></form>
        </Card>
      </div>

      <Card className="mt-6 p-6 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="sf-label text-[var(--accent)]">Sharing</p><h2 className="sf-section-title mt-2">QR access</h2><p className="sf-body-secondary mt-2">Print one stable code for this event. Its destination follows publication status.</p></div>{qr && <StatusBadge status={qr.status} />}</div>
        {qr ? <div className="mt-6 flex flex-col gap-4 rounded-[var(--radius-medium)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4 md:flex-row md:items-center md:justify-between"><div><p className="sf-label">Stable share link</p><code className="mt-2 block break-all text-sm text-[var(--text-secondary)]">{qrUrl(qr.code)}</code></div><div className="flex flex-wrap gap-2"><a href={`/api/qr/${qr.code}`} download><Button type="button" variant="secondary">Download PNG</Button></a><a href={`/api/qr/${qr.code}?format=svg`} download><Button type="button" variant="secondary">Download SVG</Button></a><form action={toggleQr}><input type="hidden" name="id" value={qr.id} /><input type="hidden" name="status" value={qr.status === "ACTIVE" ? "DISABLED" : "ACTIVE"} /><input type="hidden" name="returnTo" value={`/photographer/events/${event.id}`} /><Button type="submit" variant="ghost">{qr.status === "ACTIVE" ? "Disable QR" : "Enable QR"}</Button></form></div></div> : <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-medium)] border border-dashed border-[var(--border-strong)] p-5"><p className="sf-body-secondary">{event.status === "PUBLISHED" ? "Create a QR code to share this event." : "Publish the event before sharing it publicly."}</p><form action={createEventQr}><input type="hidden" name="eventId" value={event.id} /><Button type="submit" disabled={event.status !== "PUBLISHED"}>Generate QR</Button></form></div>}
      </Card>

      <section className="mt-12" aria-labelledby="albums-heading"><div className="flex items-end justify-between gap-4"><div><p className="sf-label text-[var(--accent)]">Content</p><h2 id="albums-heading" className="sf-section-title mt-2">Albums</h2></div><span className="sf-caption">{event.albums.length} total</span></div><div className="mt-5 grid gap-4 md:grid-cols-2">{event.albums.map((album) => <Card key={album.id} variant="interactive" className="p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="sf-card-title">{album.title}</h3><p className="sf-body-secondary mt-2">{album._count.photos} photos</p></div><StatusBadge status={album.status} /></div><div className="mt-5 flex flex-wrap gap-2"><Link href={`/photographer/albums/${album.id}`}><Button type="button">Manage photos</Button></Link></div><form action={updateAlbum} className="mt-5 grid gap-3 border-t border-[var(--border)] pt-5"><input type="hidden" name="id" value={album.id} /><Input id={`album-title-${album.id}`} name="title" label="Title" required defaultValue={album.title} /><label htmlFor={`album-description-${album.id}`} className="grid gap-2"><span className="sf-label">Description</span><textarea id={`album-description-${album.id}`} name="description" defaultValue={album.description ?? ""} rows={2} className="rounded-[var(--radius-medium)] border border-[var(--border)] bg-[var(--surface-elevated)] p-3 text-[var(--text-primary)] focus:border-[var(--accent)]" /></label><Select id={`album-status-${album.id}`} name="status" label="Publication status" defaultValue={album.status}><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option></Select><div className="flex flex-wrap gap-2"><Button type="submit" variant="secondary">Save album</Button></div></form><form action={deleteAlbum} className="mt-2"><input type="hidden" name="id" value={album.id} /><Button type="submit" variant="ghost" className="text-[var(--error)]">Delete album</Button></form></Card>)}{event.albums.length === 0 && <div className="md:col-span-2"><EmptyState title="No albums yet" description="Create an album to organize the photos from this event." /></div>}</div></section>

      <Card className="mt-8 p-6 md:p-7"><p className="sf-label text-[var(--accent)]">Quick action</p><h2 className="sf-section-title mt-2">Create album</h2><form action={createAlbum} className="mt-5 grid gap-4 md:grid-cols-2"><input type="hidden" name="eventId" value={event.id} /><Input id="new-album-title" name="title" label="Title" required placeholder="Finish line" /><Input id="new-album-slug" name="slug" label="Public URL slug" required pattern="[a-z0-9-]+" placeholder="finish-line" /><Input id="new-album-price" name="priceDollars" label="Price per photo (USD)" required inputMode="decimal" pattern="^\d+(\.\d{1,2})?$" defaultValue="5.00" /><label htmlFor="new-album-description" className="grid gap-2 md:col-span-2"><span className="sf-label">Description</span><textarea id="new-album-description" name="description" rows={3} className="rounded-[var(--radius-medium)] border border-[var(--border)] bg-[var(--surface-elevated)] p-3 text-[var(--text-primary)] focus:border-[var(--accent)]" placeholder="Optional album description" /></label><Button type="submit" className="md:col-span-2">Create album</Button></form></Card>
      <Card className="mt-8 p-6 md:p-7">
        <p className="sf-label text-[var(--accent)]">Pricing</p>
        <h2 className="sf-section-title mt-2">Price per photo</h2>
        <p className="sf-body-secondary mt-2">Set one USD price for every photo in an album. Individual overrides remain available in photo management.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {event.albums.map((album) => (
            <form key={album.id} action={updateAlbum} className="rounded-[var(--radius-medium)] border border-[var(--border)] p-4">
              <input type="hidden" name="id" value={album.id} />
              <input type="hidden" name="title" value={album.title} />
              <input type="hidden" name="slug" value={album.slug} />
              <input type="hidden" name="status" value={album.status} />
              <Input id={`album-price-quick-${album.id}`} name="priceDollars" label={album.title} required inputMode="decimal" pattern="^\d+(\.\d{1,2})?$" defaultValue={(album.priceCents / 100).toFixed(2)} />
              <Button type="submit" variant="secondary" className="mt-3">Save album price</Button>
            </form>
          ))}
        </div>
      </Card>
    </PhotographerShell>
  );
}
