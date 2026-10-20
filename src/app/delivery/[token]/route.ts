import { NextResponse } from "next/server";
import { redeemOrderDeliveryCapability } from "@/lib/delivery-capabilities";
import { setDeliveryAccess } from "@/lib/order-access";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const access = await redeemOrderDeliveryCapability(token);
    await setDeliveryAccess(access.orderId, access.capabilityId, access.expiresAt);
    const response = NextResponse.redirect(new URL(`/order/${access.publicOrderCode}`, request.url), 303);
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return new NextResponse("Delivery unavailable", { status: 404, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
}
