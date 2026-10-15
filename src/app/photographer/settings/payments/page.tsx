import { redirect } from "next/navigation";
import { PhotographerShell } from "@/components/photographer-shell";
import { Card } from "@/components/card";
import { PageHeader } from "@/components/feedback";
import { getCurrentPhotographer } from "@/lib/auth";
import { getPhotographerPaymentSettings, stripeIsAvailable } from "@/lib/payment-settings";
import { PaymentSettingsPanel } from "./panel";
import { AwaitingPayments } from "./awaiting-payments";

export default async function PaymentSettingsPage() {
  const photographer = await getCurrentPhotographer();
  if (!photographer) redirect("/photographer/login");
  const { settings, stripe } = await getPhotographerPaymentSettings(photographer.id);
  return <PhotographerShell active="settings" accountName={photographer.name}><PageHeader eyebrow="Business settings" title="Payment settings" description="Choose how customers can pay for your photography. Stripe readiness remains provider-authoritative." /><div className="mt-8 grid gap-6 lg:grid-cols-2"><Card className="p-6"><p className="sf-label text-[var(--accent)]">Stripe</p><h2 className="sf-section-title mt-2">Card payments</h2><p className="sf-body-secondary mt-3">Stripe Connect Express handles card payments and photographer proceeds. Real provider activation remains gated by SF-PAY-PROD-GATE.</p><div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-4"><p className="font-bold">Status: {stripe ? stripe.status.toLowerCase() : "onboarding required"}</p><p className="sf-caption mt-1">{stripeIsAvailable(settings, stripe) ? "Available for customer checkout." : "Not currently available for customer checkout."}</p></div><a href="/api/photographer/payments/stripe/connect/onboarding-link" className="mt-5 inline-flex rounded-[var(--radius-medium)] bg-[var(--accent)] px-4 py-3 text-sm font-bold text-white">Open Stripe onboarding</a></Card><PaymentSettingsPanel initial={{ zelleEnabled: settings.zelleEnabled, zelleDisplayName: settings.zelleDisplayName || "", zellePaymentIdentifier: settings.zellePaymentIdentifier || "", zelleInstructions: settings.zelleInstructions || "", zelleQrUrl: settings.zelleQrKey ? `/api/payment-settings/zelle-qr/${settings.zelleQrKey}` : null }} /></div><AwaitingPayments /></PhotographerShell>;
}
