import Link from "next/link";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { CustomerShell } from "@/components/customer-shell";
import { EmptyState, PageHeader } from "@/components/feedback";
import { removeFromCart } from "@/app/customer-actions";
import { prisma } from "@/lib/prisma";
import { getCartIds } from "@/lib/cart";
import { resolveEffectivePhotoPrice } from "@/lib/pricing";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const ids = await getCartIds();
  const photos = await prisma.photo.findMany({ where: { id: { in: ids }, status: "PUBLISHED", album: { status: "PUBLISHED", event: { status: "PUBLISHED" } } }, include: { album: { include: { event: true } } } });
  const pricedPhotos = photos.map((photo) => ({ photo, price: resolveEffectivePhotoPrice(photo) }));
  const subtotal = pricedPhotos.reduce((sum, item) => sum + item.price.priceCents, 0);
  return <CustomerShell><PageHeader eyebrow="Your selection" title="Your cart" description="Review the moments you want to keep before checkout." action={<Link href="/"><Button type="button" variant="ghost">Continue browsing</Button></Link>} />{pricedPhotos.length ? <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]"><div className="grid min-w-0 gap-3">{pricedPhotos.map(({ photo, price }, index) => <Card key={photo.id} className="flex min-w-0 gap-4 p-4 sm:items-center"><div className="grid h-24 w-32 shrink-0 place-items-center overflow-hidden rounded-xl bg-[var(--navy)]"><img src={`/api/previews/${photo.previewKey}`} alt={photo.title || photo.originalFilename} className="h-full w-full object-cover" /></div><div className="min-w-0 flex-1"><p className="sf-caption">Photo {String(index + 1).padStart(2, "0")}</p><p className="truncate font-bold">{photo.title || photo.originalFilename}</p><p className="sf-body-secondary mt-1">{photo.album.event.title} · {photo.album.title}</p></div><div className="flex shrink-0 flex-col items-end gap-3"><p className="font-black">${(price.priceCents / 100).toFixed(2)} {price.currency}</p><form action={removeFromCart}><input type="hidden" name="photoId" value={photo.id} /><Button type="submit" variant="ghost" className="px-2 text-xs text-[var(--error)]">Remove</Button></form></div></Card>)}</div><Card className="h-fit min-w-0 p-6 lg:sticky lg:top-24"><p className="sf-label text-[var(--accent)]">Order summary</p><div className="mt-5 flex items-center justify-between"><span className="text-[var(--text-secondary)]">Subtotal <span className="text-xs">({pricedPhotos.length} photos)</span></span><strong className="text-xl">${(subtotal / 100).toFixed(2)}</strong></div><div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-4 text-lg"><span>Total</span><strong>${(subtotal / 100).toFixed(2)} USD</strong></div><Link href="/checkout" className="mt-6 flex"><Button type="button" className="w-full">Proceed to checkout <span aria-hidden="true">→</span></Button></Link><p className="sf-caption mt-4 text-center">Secure payment and protected original downloads.</p></Card></div> : <div className="mt-8"><EmptyState title="Your cart is empty" description="Browse an event gallery and select the photos you want to purchase." action={<Link href="/"><Button type="button">Browse galleries</Button></Link>} /></div>}</CustomerShell>;
}
