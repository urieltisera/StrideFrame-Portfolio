"use client";

import { useActionState, useState } from "react";
import { checkout, type CheckoutFormState } from "@/app/customer-actions";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { ErrorState, StatusBanner } from "@/components/feedback";
import { Input } from "@/components/form-fields";

type CheckoutFormProps = {
  methods: { stripe: boolean; zelle: boolean };
  initialState: CheckoutFormState;
};

export function CheckoutForm({ methods, initialState }: CheckoutFormProps) {
  const [state, formAction, pending] = useActionState(checkout, initialState);
  const [values, setValues] = useState(initialState.values);

  const update = (name: keyof typeof values, value: string) => setValues((current) => ({ ...current, [name]: value }));

  return <>
    {state.error && <div className="mb-5"><ErrorState title="Checkout could not be completed" description={state.error} /></div>}
    <Card className="p-5 sm:p-8">
      <form action={formAction} className="grid gap-6">
        <div>
          <p className="sf-label text-[var(--accent)]">1 · Contact details</p>
          <div className="mt-4 grid gap-4">
            <Input id="checkout-email" name="email" label="Email address" required type="email" placeholder="you@example.com" value={values.email} onChange={(event) => update("email", event.target.value)} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input id="checkout-first-name" name="firstName" label="First name (optional)" placeholder="Alex" value={values.firstName} onChange={(event) => update("firstName", event.target.value)} />
              <Input id="checkout-last-name" name="lastName" label="Last name (optional)" placeholder="Johnson" value={values.lastName} onChange={(event) => update("lastName", event.target.value)} />
            </div>
          </div>
        </div>
        <div className="border-t border-[var(--border)] pt-6">
          <p className="sf-label text-[var(--accent)]">2 · Payment method</p>
          <div className="mt-4 grid gap-3">
            {methods.stripe && <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 ${values.paymentMethod === "stripe" ? "border-[var(--accent)] bg-[var(--surface-interactive)]" : "border-[var(--border)] bg-[var(--surface-elevated)]"}`}>
              <input type="radio" name="paymentMethod" value="stripe" checked={values.paymentMethod === "stripe"} onChange={(event) => update("paymentMethod", event.target.value)} className="accent-[var(--accent)]" />
              <span className="flex-1"><strong className="block">Credit or debit card</strong><span className="sf-caption">Secure checkout powered by Stripe</span></span><span className="text-xs font-black text-[var(--accent)]">CARD</span>
            </label>}
            {methods.zelle && <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 ${values.paymentMethod === "zelle" ? "border-[var(--accent)] bg-[var(--surface-interactive)]" : "border-[var(--border)] bg-[var(--surface-elevated)]"}`}>
              <input type="radio" name="paymentMethod" value="zelle" checked={values.paymentMethod === "zelle"} onChange={(event) => update("paymentMethod", event.target.value)} className="accent-[var(--accent)]" />
              <span className="flex-1"><strong className="block">Zelle</strong><span className="sf-caption">Pay directly to the photographer; confirmation is manual.</span></span><span className="text-xs font-black text-[#6c1ee8]">Z</span>
            </label>}
            {!methods.stripe && !methods.zelle && <StatusBanner title="Checkout is not open yet" description="This photographer has not enabled a payment method for this gallery. You can return to the gallery or check back later." />}
          </div>
          {methods.zelle && <p className="sf-caption mt-3">Zelle payments remain awaiting confirmation. They never unlock downloads automatically.</p>}
        </div>
        <Button type="submit" disabled={pending || !methods.stripe && !methods.zelle} className="w-full sm:w-fit">{pending ? "Validating…" : "Create secure order"} <span aria-hidden="true">→</span></Button>
      </form>
    </Card>
  </>;
}
