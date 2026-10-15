import { NextResponse } from "next/server";
import { getCurrentPhotographer } from "@/lib/auth";
import { createStripeConnectOnboardingLink } from "@/lib/stripe-connect";

async function link() {
  const photographer = await getCurrentPhotographer();
  if (!photographer) throw new Error("Unauthorized");
  const baseUrl = process.env.PUBLIC_BASE_URL;
  if (!baseUrl) throw new Error("PUBLIC_BASE_URL is required");
  const accountLink = await createStripeConnectOnboardingLink({ photographerId: photographer.id, email: photographer.email, baseUrl });
  return accountLink.url;
}

export async function POST() {
  const photographer = await getCurrentPhotographer();
  if (!photographer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json({ url: await link() }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start Stripe onboarding" }, { status: 400 }); }
}

export async function GET() {
  const photographer = await getCurrentPhotographer();
  if (!photographer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.redirect(await link()); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start Stripe onboarding" }, { status: 400 }); }
}
