import Stripe from "stripe";
import { prisma } from "./prisma";

export type ConnectReadiness = "ONBOARDING" | "READY" | "RESTRICTED" | "DISABLED";

function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is required");
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function statusForAccount(account: Stripe.Account | Stripe.DeletedAccount): ConnectReadiness {
  if ("deleted" in account && account.deleted) return "DISABLED";
  if (account.requirements?.disabled_reason) return "RESTRICTED";
  if (account.charges_enabled && account.payouts_enabled) return "READY";
  return "ONBOARDING";
}

function accountSnapshot(account: Stripe.Account | Stripe.DeletedAccount) {
  if ("deleted" in account && account.deleted) return { status: "DISABLED" as const, detailsSubmitted: false, chargesEnabled: false, payoutsEnabled: false, currentlyDue: undefined, disabledReason: "account_deleted" };
  return {
    status: statusForAccount(account),
    detailsSubmitted: account.details_submitted,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    currentlyDue: account.requirements?.currently_due ?? undefined,
    disabledReason: account.requirements?.disabled_reason ?? null,
  };
}

export function isStripeConnectReady(account: { status: ConnectReadiness; chargesEnabled: boolean; payoutsEnabled: boolean }) {
  return account.status === "READY" && account.chargesEnabled && account.payoutsEnabled;
}

export async function getStripeConnectAccount(photographerId: string) {
  return prisma.stripeConnectAccount.findUnique({ where: { photographerId } });
}

export async function createOrGetStripeConnectAccount(photographerId: string, email: string) {
  const existing = await getStripeConnectAccount(photographerId);
  if (existing) return existing;
  const account = await stripeClient().accounts.create({
    type: "express",
    email,
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    metadata: { strideframePhotographerId: photographerId },
  }, { idempotencyKey: `connect-account:${photographerId}` });
  const snapshot = accountSnapshot(account);
  return prisma.stripeConnectAccount.upsert({
    where: { photographerId },
    create: { photographerId, stripeAccountId: account.id, ...snapshot },
    update: { stripeAccountId: account.id, ...snapshot },
  });
}

export async function syncStripeConnectAccount(photographerId: string) {
  const stored = await getStripeConnectAccount(photographerId);
  if (!stored) return null;
  const account = await stripeClient().accounts.retrieve(stored.stripeAccountId);
  const snapshot = accountSnapshot(account);
  return prisma.stripeConnectAccount.update({ where: { photographerId }, data: snapshot });
}

export async function createStripeConnectOnboardingLink(input: { photographerId: string; email: string; baseUrl: string }) {
  const account = await createOrGetStripeConnectAccount(input.photographerId, input.email);
  const client = stripeClient();
  return client.accountLinks.create({
    account: account.stripeAccountId,
    refresh_url: `${input.baseUrl}/api/photographer/payments/stripe/connect/onboarding-link`,
    return_url: `${input.baseUrl}/api/photographer/payments/stripe/connect/return`,
    type: "account_onboarding",
  });
}
