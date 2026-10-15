import { NextResponse } from "next/server";
import { getCurrentPhotographer } from "@/lib/auth";
import { rejectManualPayment } from "@/lib/manual-payments";

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const photographer = await getCurrentPhotographer();
  if (!photographer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const result = await rejectManualPayment({ photographerId: photographer.id, orderId: (await params).orderId, note: typeof body.note === "string" ? body.note : undefined });
    return NextResponse.json({ status: result.order.status, paymentStatus: result.payment.status, idempotent: result.idempotent });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Rejection failed" }, { status: 400 }); }
}
