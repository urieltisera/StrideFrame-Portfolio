import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { payOrder, prepareDownloads } from "@/app/customer-actions";
import { getDownloadToken } from "@/lib/order-access";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params, searchParams }: { params: Promise<{ publicOrderCode: string }>; searchParams: Promise<{ error?: string }> }) {
  const { publicOrderCode } = await params;
  const order = await prisma.order.findUnique({ where: { publicOrderCode }, include: { items: { include: { photo: true } }, payment: true } });
  if (!order) notFound();
  const error = (await searchParams).error;
  const token = order.status === "PAID" ? await getDownloadToken() : undefined;
  return <main className="mx-auto min-h-screen max-w-4xl px-8 py-12">
    <Link href="/">← StrideFrame</Link>
    <p className="mt-12 text-xs uppercase tracking-[.3em] text-orange-500">Order confirmation</p>
    <h1 className="mt-3 text-5xl font-black">Order {order.publicOrderCode}</h1>
    {error && <p className="mt-5 rounded-xl bg-red-100 p-4 text-red-700">{error}</p>}
    <p className="mt-4 rounded-xl bg-amber-100 p-4">Payment status: {order.status === "PAID" ? "successful" : "pending"}. {order.status === "PAID" ? "Your payment has been confirmed." : "Payment has not been completed yet."}</p>
    <div className="mt-8 space-y-3">{order.items.map(item => <div key={item.id} className="flex items-center justify-between rounded-2xl bg-white p-5"><div className="flex items-center gap-4"><img src={`/api/previews/${item.photo.previewKey}`} alt="" className="h-16 w-24 rounded object-cover" /><span>{item.originalFilename}</span></div><div className="flex items-center gap-4"><span>${(item.unitPriceCents / 100).toFixed(2)} USD</span>{token && <Link className="font-bold text-orange-600" href={`/download/${token}/${item.photoId}`}>Download original</Link>}</div></div>)}</div>
    <p className="mt-8 text-2xl font-black">Total: ${(order.totalCents / 100).toFixed(2)} USD</p>
    {order.status === "PENDING_PAYMENT" && <form action={payOrder} className="mt-8"><input type="hidden" name="publicOrderCode" value={order.publicOrderCode} /><button className="rounded-xl bg-[#10231f] px-6 py-3 font-bold text-white">Pay securely with Stripe</button></form>}
    {order.status === "PAID" && !token && <form action={prepareDownloads} className="mt-8"><input type="hidden" name="publicOrderCode" value={order.publicOrderCode} /><button className="rounded-xl bg-[#10231f] px-6 py-3 font-bold text-white">Prepare secure downloads</button></form>}
    {order.status === "PAID" && token && <p className="mt-5 text-slate-600">Your secure download access is active.</p>}
  </main>;
}
