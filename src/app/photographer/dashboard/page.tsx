import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { EmptyState, PageHeader } from "@/components/feedback";
import { Input } from "@/components/form-fields";
import { PhotographerShell } from "@/components/photographer-shell";
import { StatusBadge } from "@/components/badge";
import { getCurrentPhotographer } from "@/lib/auth";
import { createEvent, logout, uploadIndividualPhoto } from "@/app/photographer/actions";
import { prisma } from "@/lib/prisma";
import { formatUsd } from "@/lib/money";

export default async function Dashboard() {
  const person = await getCurrentPhotographer();
  if (!person) redirect("/photographer/login");

  const [events, orders] = await Promise.all([
    prisma.event.findMany({ where: { photographerId: person.id }, include: { _count: { select: { albums: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.order.findMany({ where: { photographerId: person.id }, include: { items: true }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  const paidOrders = orders.filter((order) => order.status === "PAID");
  const revenueCents = paidOrders.reduce((sum, order) => sum + order.totalCents, 0);
  const photosSold = paidOrders.reduce((sum, order) => sum + order.items.length, 0);
  const customers = new Set(paidOrders.map((order) => order.customerEmail)).size;

  return (
    <PhotographerShell accountName={person.name}>
      <div className="flex justify-end">
        <form action={logout}>
          <Button type="submit" variant="ghost">Sign out</Button>
        </form>
      </div>
      <PageHeader
        eyebrow="Photographer workspace"
        title={`Welcome, ${person.name}.`}
        description="Keep your event work moving from first upload to public gallery."
        action={<Link href="#new-event"><Button type="button">Create event</Button></Link>}
      />

      <section aria-label="Business overview" className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card variant="elevated" className="border-[var(--accent)]/25 p-6">
          <p className="sf-label">Events</p>
          <p className="mt-5 text-4xl font-black tracking-tight">{events.length}</p>
          <p className="sf-body-secondary mt-2">Your active event library</p>
        </Card>
        <Card className="p-6">
          <p className="sf-label">Total sales</p>
          <p className="mt-5 text-4xl font-black tracking-tight">{formatUsd(revenueCents)}</p>
          <p className="sf-body-secondary mt-2">Verified paid orders</p>
        </Card>
        <Card className="p-6">
          <p className="sf-label">Photos sold</p>
          <p className="mt-5 text-4xl font-black tracking-tight">{photosSold}</p>
          <p className="sf-body-secondary mt-2">Across paid orders</p>
        </Card>
        <Card className="p-6">
          <p className="sf-label">Customers</p>
          <p className="mt-5 text-4xl font-black tracking-tight">{customers}</p>
          <p className="sf-body-secondary mt-2">Unique paid customers</p>
        </Card>
      </section>

      <div className="mt-12 grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section id="events" aria-labelledby="events-heading">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="sf-label text-[var(--accent)]">Library</p>
              <h2 id="events-heading" className="sf-section-title mt-2">Your events</h2>
            </div>
            {events.length > 0 && <span className="sf-caption">{events.length} total</span>}
          </div>
          <div className="mt-5 grid gap-3">
            {events.map((event) => (
              <Link href={`/photographer/events/${event.id}`} key={event.id}>
                <Card variant="interactive" className="p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="sf-card-title truncate">{event.title}</h3>
                        <StatusBadge status={event.status} />
                      </div>
                      <p className="sf-body-secondary mt-2">{event._count.albums} albums <span className="text-[var(--text-muted)]">·</span> /e/{event.slug}</p>
                    </div>
                    <span aria-hidden="true" className="text-xl text-[var(--text-muted)]">→</span>
                  </div>
                </Card>
              </Link>
            ))}
            {events.length === 0 && <EmptyState title="No events yet" description="Create your first event to start organizing a new gallery." action={<Link href="#new-event"><Button type="button">Create your first event</Button></Link>} />}
          </div>
        </section>

        <Card id="new-event" className="h-fit p-6 md:p-7">
          <p className="sf-label text-[var(--accent)]">Quick action</p>
          <h2 className="sf-section-title mt-2">New event</h2>
          <p className="sf-body-secondary mt-2">Set up the event details first. You can add albums and photos next.</p>
          <form action={createEvent} className="mt-6 grid gap-4">
            <Input id="event-title" name="title" label="Title" required placeholder="Miami Marathon 2026" />
            <Input id="event-slug" name="slug" label="Public URL slug" required pattern="[a-z0-9-]+" placeholder="miami-marathon-2026" />
            <label htmlFor="event-description" className="grid gap-2"><span className="sf-label">Description</span><textarea id="event-description" name="description" className="min-h-24 rounded-[var(--radius-medium)] border border-[var(--border)] bg-[var(--surface-elevated)] p-3 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]" placeholder="A short description for your event" rows={3} /></label>
            <Button type="submit" className="mt-1 w-full">Create event</Button>
          </form>
        </Card>
      </div>
      <section className="mt-10" aria-labelledby="orders-heading"><div className="flex items-end justify-between gap-4"><div><p className="sf-label text-[var(--accent)]">Commerce</p><h2 id="orders-heading" className="sf-section-title mt-2">Recent orders</h2></div><span className="sf-caption">{orders.length} recent</span></div><Card className="mt-5 overflow-hidden p-0"><div className="divide-y divide-[var(--border)]">{orders.length ? orders.map((order) => <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><p className="font-bold">{order.publicOrderCode}</p><p className="sf-caption mt-1">{order.customerEmail} · {order.items.length} photos</p></div><div className="flex items-center gap-4"><span className="font-black">{formatUsd(order.totalCents)}</span><StatusBadge status={order.status} /></div></div>) : <div className="p-6"><EmptyState title="No orders yet" description="Verified customer orders will appear here." /></div>}</div></Card></section>
      <Card className="mt-8 p-6 md:p-7">
        <p className="sf-label text-[var(--accent)]">Quick upload</p>
        <h2 className="sf-section-title mt-2">Sell one photo</h2>
        <p className="sf-body-secondary mt-2">Upload one image with its own USD retail price. We organize it internally without requiring a separate album setup.</p>
        <form action={uploadIndividualPhoto} className="mt-5 grid gap-4 md:grid-cols-3">
          <label className="grid gap-2"><span className="sf-label">Event</span><select name="eventId" required className="min-h-11 rounded-[var(--radius-medium)] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 text-sm">{events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select></label>
          <Input id="individual-price" name="priceDollars" label="Price per photo (USD)" required inputMode="decimal" pattern="^\d+(\.\d{1,2})?$" defaultValue="5.00" />
          <label className="grid gap-2"><span className="sf-label">Photo</span><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required className="min-h-11 rounded-[var(--radius-medium)] border border-[var(--border)] bg-[var(--surface-elevated)] p-2 text-sm" /></label>
          <Button type="submit" className="md:col-span-3">Upload individual photo</Button>
        </form>
      </Card>
    </PhotographerShell>
  );
}
