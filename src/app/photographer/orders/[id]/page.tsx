import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { PageHeader } from "@/components/feedback";
import { PhotographerShell } from "@/components/photographer-shell";
import { StatusBadge } from "@/components/badge";
import { getCurrentPhotographer } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatUsd } from "@/lib/money";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const person = await getCurrentPhotographer();
  if (!person) redirect("/photographer/login");
  const { id } = await params;
  const order = await prisma.order.findFirst({ where: { id, photographerId: person.id }, include: { items: { include: { photo: { include: { album: true } } } }, payment: true, manualPaymentAudits: { orderBy: { createdAt: "desc" } } } });
  if (!order) notFound();
  return <PhotographerShell active="orders" accountName={person.name}><div className="mb-6"><Link href="/photographer/orders" className="sf-body-secondary">← Back to orders</Link></div><PageHeader eyebrow="Order detail" title={order.publicOrderCode} description={`${order.customerEmail} · ${order.items.length} photos`} action={<StatusBadge status={order.status} />} /><div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"><Card className="overflow-hidden p-0"><div className="border-b border-[var(--border)] px-5 py-4"><p className="sf-label">Purchased photos</p></div>{order.items.map((item) => <div key={item.id} className="flex items-center gap-4 border-b border-[var(--border)] p-4 last:border-0"><div className="h-16 w-20 shrink-0 overflow-hidden rounded-lg bg-[var(--navy-soft)]"><img src={`/api/previews/${item.photo.previewKey}`} alt="" className="h-full w-full object-cover" /></div><div className="min-w-0 flex-1"><p className="truncate font-bold">{item.originalFilename || item.photo.originalFilename}</p><p className="sf-caption mt-1">{item.photo.album.title}</p></div><p className="font-bold">{formatUsd(item.unitPriceCents)}</p></div>)}</Card><Card className="h-fit p-6"><p className="sf-label">Order summary</p><div className="mt-5 grid gap-3 text-sm"><div className="flex justify-between"><span className="text-[var(--text-secondary)]">Subtotal</span><strong>{formatUsd(order.subtotalCents)}</strong></div><div className="flex justify-between border-t border-[var(--border)] pt-4 text-lg"><span>Total</span><strong>{formatUsd(order.totalCents)}</strong></div></div>{order.payment && <div className="mt-6 border-t border-[var(--border)] pt-5"><p className="sf-label">Payment</p><p className="mt-2 font-bold">{order.payment.provider}</p><p className="sf-caption mt-1">{order.payment.status}</p></div>}</Card></div></PhotographerShell>;
}
