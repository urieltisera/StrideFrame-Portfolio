import { Card } from "@/components/card";
import { listPhotographerRefunds } from "@/lib/refunds";

export async function RefundsPanel({ photographerId }: { photographerId: string }) {
  const refunds = await listPhotographerRefunds(photographerId);
  return <Card className="mt-8 p-6"><div><p className="sf-label text-[var(--accent)]">Refunds</p><h2 className="sf-section-title mt-2">Refund activity</h2><p className="sf-body-secondary mt-2">Stripe refunds remain provider-authoritative. Zelle refunds are manual: record the request, send the money independently, then record completion only after verifying it.</p></div>{refunds.length ? <div className="mt-6 grid gap-3">{refunds.map((refund) => <div key={refund.id} className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold">{refund.order.publicOrderCode}</p><p className="sf-caption mt-1">{refund.items.length} photo{refund.items.length === 1 ? "" : "s"} · ${(refund.amountCents / 100).toFixed(2)} {refund.currency}</p></div><span className="sf-caption">{refund.status.replaceAll("_", " ").toLowerCase()}</span></div>)}</div> : <p className="mt-6 rounded-xl border border-dashed border-[var(--border-strong)] p-5 text-sm text-[var(--text-secondary)]">No refunds recorded.</p>}</Card>;
}
