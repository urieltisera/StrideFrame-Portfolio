"use server";

import { redirect } from "next/navigation";
import { clearCart, getCartIds, setCartIds } from "@/lib/cart";
import { createPendingOrder, validateCheckoutInput } from "@/lib/orders";
import { initiatePayment, startZellePayment } from "@/lib/payment-service";
import { setOrderAccess } from "@/lib/order-access";

export type CheckoutFormState = { error: string; values: { email: string; firstName: string; lastName: string; paymentMethod: string } };

export async function addToCart(formData: FormData) {
  const id = String(formData.get("photoId"));
  const ids = await getCartIds();
  if (!ids.includes(id)) ids.push(id);
  await setCartIds(ids);
  redirect("/cart");
}

export async function removeFromCart(formData: FormData) {
  const id = String(formData.get("photoId"));
  await setCartIds((await getCartIds()).filter((item: string) => item !== id));
  redirect("/cart");
}

export async function checkout(previousState: CheckoutFormState, formData: FormData): Promise<CheckoutFormState> {
  const values = { email: String(formData.get("email") || ""), firstName: String(formData.get("firstName") || ""), lastName: String(formData.get("lastName") || ""), paymentMethod: String(formData.get("paymentMethod") || "") };
  let order;
  try {
    const validated = await validateCheckoutInput({ photoIds: await getCartIds(), ...values });
    order = await createPendingOrder({ photoIds: validated.context.ids, email: validated.email, firstName: validated.firstName, lastName: validated.lastName });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Checkout could not be validated", values };
  }
  try {
    if (values.paymentMethod === "zelle") await startZellePayment(order.publicOrderCode);
    await setOrderAccess(order.publicOrderCode);
    await clearCart();
  } catch (error) {
    redirect(`/order/${order.publicOrderCode}?error=${encodeURIComponent(error instanceof Error ? error.message : "Payment could not be started")}`);
  }
  redirect(`/order/${order.publicOrderCode}`);
}

export async function payOrder(formData: FormData) {
  const code = String(formData.get("publicOrderCode"));
  try {
    redirect(await initiatePayment(code));
  } catch (error) {
    redirect(`/order/${code}?error=${encodeURIComponent(error instanceof Error ? error.message : "Payment could not be started")}`);
  }
}
