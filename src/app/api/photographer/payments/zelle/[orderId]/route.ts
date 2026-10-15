import { NextResponse } from "next/server";
import { getCurrentPhotographer } from "@/lib/auth";
import { getOwnedZelleOrder } from "@/lib/manual-payments";

export async function GET(_: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const photographer = await getCurrentPhotographer();
  if (!photographer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const order = await getOwnedZelleOrder(photographer.id, (await params).orderId);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  return NextResponse.json({ id: order.id, reference: order.publicOrderCode, amountCents: order.totalCents, currency: order.currency, customerEmail: order.customerEmail, customerFirstName: order.customerFirstName, customerLastName: order.customerLastName, createdAt: order.createdAt, status: order.status, paymentStatus: order.payment?.status, itemCount: order.items.length });
}
