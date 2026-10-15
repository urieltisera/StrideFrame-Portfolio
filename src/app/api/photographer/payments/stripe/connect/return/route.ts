import { NextResponse } from "next/server";
import { getCurrentPhotographer } from "@/lib/auth";
import { syncStripeConnectAccount } from "@/lib/stripe-connect";

export async function GET(request: Request) {
  const photographer = await getCurrentPhotographer();
  const destination = new URL("/photographer/dashboard?stripe_connect=return", request.url);
  if (!photographer) return NextResponse.redirect(new URL("/photographer/login", request.url));
  try { await syncStripeConnectAccount(photographer.id); } catch { destination.searchParams.set("stripe_connect", "sync_error"); }
  return NextResponse.redirect(destination);
}
