import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { EmptyState, PageHeader } from "@/components/feedback";
import { PhotographerShell } from "@/components/photographer-shell";
import { StatusBadge } from "@/components/badge";
import { getCurrentPhotographer } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatUsd } from "@/lib/money";

export default async function OrdersPage() {
  const person = await getCurrentPhotographer();
  if (!person) redirect("/photographer/login");
  const orders = await prisma.order.findMany({ where: { photographerId: person.id }, include: { items: { include: { photo: { include: { album: true } } } } }, orderBy: { createdAt: "desc" } });
  return <PhotographerShell active="orders" accountName={person.name}><PageHeader eyebrow="Business" title="Orders" description="Review customer purchases and manual payment states." action={<Link href="/photographer/settings/payments"><Button type="button" variant="secondary">Payment settings</Button></Link>} /><Card className="mt-8 overflow-hidden p-0"><div className="hidden grid-cols-[1.2fr_1fr_.7fr_.7fr] gap-4 border-b border-[var(--border)] bg-[var(--surface-interactive)] px-5 py-3 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] sm:grid"><span>Order</span><span>Customer</span><span>Total</span><span>Status</span></div>{orders.map((order) => <Link href={`/photographer/orders/${order.id}`} key={order.id} className="grid gap-2 border-b border-[var(--border)] px-5 py-4 last:border-0 hover:bg-[var(--surface-interactive)] sm:grid-cols-[1.2fr_1fr_.7fr_.7fr] sm:items-center sm:gap-4"><div><p className="font-bold">{order.publicOrderCode}</p><p className="sf-caption mt-1">{order.items[0]?.photo.album.title || "Photo purchase"} · {order.items.length} photos</p></div><p className="text-sm text-[var(--text-secondary)]">{order.customerEmail}</p><p className="font-bold">{formatUsd(order.totalCents)}</p><div><StatusBadge status={order.status} /></div></Link>)}{orders.length === 0 && <div className="p-6"><EmptyState title="No orders yet" description="Orders will appear here after customers purchase photos." /></div>}</Card></PhotographerShell>;
}
