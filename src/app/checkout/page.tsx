import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/card";
import { CustomerShell } from "@/components/customer-shell";
import { PageHeader } from "@/components/feedback";
import { prisma } from "@/lib/prisma";
import { getCartIds } from "@/lib/cart";
import { getAvailablePaymentMethods } from "@/lib/payment-settings";
import { resolveEffectivePhotoPrice } from "@/lib/pricing";
import { albumDisplayTitle } from "@/lib/album-labels";
import { CheckoutForm } from "./checkout-form";

export const dynamic = "force-dynamic";

export default async function Checkout({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ids = await getCartIds();
  const photos = await prisma.photo.findMany({ where: { id: { in: ids }, status: "PUBLISHED", album: { status: "PUBLISHED", event: { status: "PUBLISHED" } } }, include: { album: { include: { event: true } } } });
  if (!photos.length) redirect("/cart");
  const pricedPhotos = photos.map((photo) => ({ photo, price: resolveEffectivePhotoPrice(photo) }));
  const total = pricedPhotos.reduce((sum, item) => sum + item.price.priceCents, 0);
  const methods = await getAvailablePaymentMethods(photos[0].album.photographerId);
  const query = await searchParams;
  const initialState = { error: query.error || "", values: { email: "", firstName: "", lastName: "", paymentMethod: methods.stripe ? "stripe" : methods.zelle ? "zelle" : "" } };
  return <CustomerShell><div className="mb-6"><Link href="/cart" className="text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">← Back to cart</Link></div><PageHeader eyebrow="Secure checkout" title="Choose how to pay" description="Payment is verified by the backend before downloads are released." /><div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]"><div><CheckoutForm methods={methods} initialState={initialState} /></div><Card className="h-fit p-6 lg:sticky lg:top-24"><p className="sf-label text-[var(--accent)]">Order summary</p><div className="mt-5 grid gap-3">{pricedPhotos.map(({ photo, price }, index) => <div key={photo.id} className="flex justify-between gap-3 text-sm"><span className="min-w-0 truncate text-[var(--text-secondary)]"><span className="block text-[var(--text-primary)]">{photo.title || `Photo ${String(index + 1).padStart(2, "0")}`}</span><span className="block truncate text-xs text-[var(--text-muted)]">{albumDisplayTitle(photo.album)} · {photo.originalFilename}</span></span><span className="shrink-0 font-semibold">${(price.priceCents / 100).toFixed(2)}</span></div>)}</div><div className="mt-5 border-t border-[var(--border)] pt-5"><div className="flex items-center justify-between text-lg"><span>Total</span><strong>${(total / 100).toFixed(2)} USD</strong></div></div><p className="sf-caption mt-4">Your order remains pending until payment verification succeeds.</p></Card></div></CustomerShell>;
}
