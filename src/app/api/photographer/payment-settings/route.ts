import { NextResponse } from "next/server";
import { getCurrentPhotographer } from "@/lib/auth";
import { getPhotographerPaymentSettings, updatePaymentSettings } from "@/lib/payment-settings";

export async function GET() {
  const photographer = await getCurrentPhotographer();
  if (!photographer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await getPhotographerPaymentSettings(photographer.id);
  return NextResponse.json({ settings: result.settings, stripe: result.stripe ? { status: result.stripe.status, detailsSubmitted: result.stripe.detailsSubmitted, chargesEnabled: result.stripe.chargesEnabled, payoutsEnabled: result.stripe.payoutsEnabled, disabledReason: result.stripe.disabledReason } : null, zelleQrUrl: result.settings.zelleQrKey ? `/api/payment-settings/zelle-qr/${result.settings.zelleQrKey}` : null });
}

export async function PATCH(request: Request) {
  const photographer = await getCurrentPhotographer();
  if (!photographer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json(await updatePaymentSettings(photographer.id, await request.json())); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid settings" }, { status: 400 }); }
}
