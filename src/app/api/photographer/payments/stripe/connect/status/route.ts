import { NextResponse } from "next/server";
import { getCurrentPhotographer } from "@/lib/auth";
import { syncStripeConnectAccount } from "@/lib/stripe-connect";

export async function GET() {
  const photographer = await getCurrentPhotographer();
  if (!photographer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const account = await syncStripeConnectAccount(photographer.id);
    if (!account) return NextResponse.json({ status: "NOT_STARTED", ready: false });
    return NextResponse.json({ status: account.status, ready: account.status === "READY" && account.chargesEnabled && account.payoutsEnabled, detailsSubmitted: account.detailsSubmitted, chargesEnabled: account.chargesEnabled, payoutsEnabled: account.payoutsEnabled, currentlyDue: account.currentlyDue, disabledReason: account.disabledReason });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to synchronize Stripe account" }, { status: 400 }); }
}
