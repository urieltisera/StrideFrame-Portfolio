import { NextResponse } from "next/server";
import { getCurrentPhotographer } from "@/lib/auth";
import { prepareManualZelleRefund } from "@/lib/refunds";

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const photographer = await getCurrentPhotographer();
  if (!photographer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.idempotencyKey !== "string" || !body.idempotencyKey.trim()) throw new Error("Idempotency key is required");
    const itemIds = Array.isArray(body.itemIds) && body.itemIds.every((value: unknown) => typeof value === "string") ? body.itemIds : undefined;
    const result = await prepareManualZelleRefund({ photographerId: photographer.id, orderId: (await params).orderId, itemIds, idempotencyKey: body.idempotencyKey.trim(), reason: typeof body.reason === "string" ? body.reason : undefined });
    return NextResponse.json({ id: result.refund.id, status: result.refund.status, amountCents: result.refund.amountCents, idempotent: result.idempotent });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Refund request failed" }, { status: 400 }); }
}
