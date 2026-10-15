import { NextResponse } from "next/server";
import { getCurrentPhotographer } from "@/lib/auth";
import { listAwaitingZelleOrders } from "@/lib/manual-payments";

export async function GET() {
  const photographer = await getCurrentPhotographer();
  if (!photographer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orders = await listAwaitingZelleOrders(photographer.id);
  return NextResponse.json(orders.map((order) => ({ id: order.id, reference: order.publicOrderCode, amountCents: order.totalCents, currency: order.currency, customerEmail: order.customerEmail, customerFirstName: order.customerFirstName, customerLastName: order.customerLastName, createdAt: order.createdAt, itemCount: order.items.length, status: order.status })));
}
