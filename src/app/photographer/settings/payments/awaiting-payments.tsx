"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/card";

type AwaitingOrder = { id: string; reference: string; amountCents: number; currency: string; customerEmail: string; customerFirstName: string | null; customerLastName: string | null; createdAt: string; itemCount: number; status: string };
export function AwaitingPayments() {
  const [orders, setOrders] = useState<AwaitingOrder[]>([]);
  const [message, setMessage] = useState("");
  async function load() { const response = await fetch("/api/photographer/payments/zelle/awaiting"); if (response.ok) setOrders(await response.json()); }
  useEffect(() => { let active = true; fetch("/api/photographer/payments/zelle/awaiting").then((response) => response.ok ? response.json() : []).then((data: AwaitingOrder[]) => { if (active) setOrders(data); }); return () => { active = false; }; }, []);
  async function decide(order: AwaitingOrder, action: "confirm" | "reject") {
    if (action === "confirm" && !window.confirm("Confirm only after verifying this payment in your own Zelle/bank account. Continue?")) return;
    if (action === "reject" && !window.confirm("Reject this Zelle payment? The order will not receive download access.")) return;
    const response = await fetch(`/api/photographer/payments/zelle/${order.id}/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
    const result = await response.json();
    if (!response.ok) { setMessage(result.error || "Could not update payment"); return; }
    setMessage(action === "confirm" ? `${order.reference} confirmed.` : `${order.reference} rejected.`);
    await load();
  }
  return <Card className="mt-8 p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="sf-label text-[var(--accent)]">Zelle payments</p><h2 className="sf-section-title mt-2">Awaiting confirmation</h2><p className="sf-body-secondary mt-2">Confirm only after independently seeing the funds in your own Zelle or bank activity. StrideFrame does not verify Zelle.</p></div><span className="sf-caption">{orders.length} awaiting</span></div>{orders.length ? <div className="mt-6 grid gap-3">{orders.map((order) => <div key={order.id} className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="font-bold">{order.reference}</p><p className="sf-caption mt-1">${(order.amountCents / 100).toFixed(2)} {order.currency} · {order.itemCount} photos · {order.customerEmail}</p><p className="sf-caption mt-1">Created {new Date(order.createdAt).toLocaleString()}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => decide(order, "confirm")} className="rounded-xl bg-[var(--success)] px-4 py-3 text-sm font-bold text-white">Confirm payment</button><button type="button" onClick={() => decide(order, "reject")} className="rounded-xl border border-[var(--border-strong)] px-4 py-3 text-sm font-bold text-[var(--error)]">Reject</button></div></div>)}</div> : <p className="mt-6 rounded-xl border border-dashed border-[var(--border-strong)] p-5 text-sm text-[var(--text-secondary)]">No Zelle orders are awaiting confirmation.</p>}{message && <p className="sf-caption mt-4" role="status">{message}</p>}</Card>;
}
