import { NextResponse } from "next/server";
import { getCurrentPhotographer } from "@/lib/auth";
import { completeManualZelleRefund } from "@/lib/refunds";

export async function POST(request: Request, { params }: { params: Promise<{ refundId: string }> }) {
  const photographer = await getCurrentPhotographer();
  if (!photographer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const result = await completeManualZelleRefund({ photographerId: photographer.id, refundId: (await params).refundId, note: typeof body.note === "string" ? body.note : undefined });
    return NextResponse.json({ id: result.refund.id, status: result.refund.status, idempotent: result.idempotent });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Refund completion failed" }, { status: 400 }); }
}
