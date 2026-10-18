import { redirect } from "next/navigation";
import { PhotographerShell } from "@/components/photographer-shell";
import { PageHeader, EmptyState } from "@/components/feedback";
import { Card } from "@/components/card";
import { StatusBadge } from "@/components/badge";
import { Button } from "@/components/button";
import { getCurrentPhotographer } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatUsd } from "@/lib/money";
import Link from "next/link";

export default async function SalesPage() {
  const person = await getCurrentPhotographer();
  if (!person) redirect("/photographer/login");
  const orders = await prisma.order.findMany({ where: { photographerId: person.id }, include: { items: { include: { photo: { include: { album: true } } } } }, orderBy: { createdAt: "desc" } });

  return <PhotographerShell active="sales" accountName={person.name}>
    <PageHeader eyebrow="Business" title="Sales" description="Orders and verified sales activity from your photography." action={<Link href="/photographer/settings/payments"><Button type="button" variant="secondary">Payment settings</Button></Link>} />
    <div className="mt-8 grid gap-4 sm:grid-cols-3">
      <Card className="p-5"><p className="sf-label">Orders</p><p className="mt-4 font-display text-3xl font-extrabold">{orders.length}</p><p className="sf-body-secondary mt-1">Customer purchases</p></Card>
      <Card className="p-5"><p className="sf-label">Paid sales</p><p className="mt-4 font-display text-3xl font-extrabold">{formatUsd(orders.filter((order) => order.status === "PAID").reduce((sum, order) => sum + order.totalCents, 0))}</p><p className="sf-body-secondary mt-1">Verified order totals</p></Card>
      <Card className="p-5"><p className="sf-label">Photos sold</p><p className="mt-4 font-display text-3xl font-extrabold">{orders.filter((order) => order.status === "PAID").reduce((sum, order) => sum + order.items.length, 0)}</p><p className="sf-body-secondary mt-1">Across paid orders</p></Card>
    </div>
    <Card className="mt-8 overflow-hidden p-0"><div className="hidden grid-cols-[1.1fr_1fr_.7fr_.7fr] gap-4 border-b border-[var(--border)] bg-[var(--surface-interactive)] px-5 py-3 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] sm:grid"><span>Order</span><span>Album</span><span>Amount</span><span>Status</span></div>{orders.map((order) => <Link href={`/photographer/orders/${order.id}`} key={order.id} className="grid gap-2 border-b border-[var(--border)] px-5 py-4 last:border-0 hover:bg-[var(--surface-interactive)] sm:grid-cols-[1.1fr_1fr_.7fr_.7fr] sm:items-center sm:gap-4"><div><p className="font-bold">{order.publicOrderCode}</p><p className="sf-caption mt-1">{order.customerEmail} · {order.items.length} photos</p></div><p className="text-sm text-[var(--text-secondary)]">{order.items[0]?.photo.album.title || "Photo purchase"}</p><p className="font-bold">{formatUsd(order.totalCents)}</p><StatusBadge status={order.status} /></Link>)}{orders.length === 0 && <div className="p-6"><EmptyState title="No sales yet" description="Orders will appear here after customers purchase your photos." /></div>}</Card>
  </PhotographerShell>;
}
