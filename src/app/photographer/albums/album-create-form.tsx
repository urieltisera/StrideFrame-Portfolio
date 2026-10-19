"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Input } from "@/components/form-fields";
import { createEmptyAlbum } from "@/app/photographer/actions";
import { MINIMUM_PAID_PHOTO_PRICE_CENTS, priceValidationMessage } from "@/lib/pricing";

export function AlbumCreateForm({ error }: { error?: string }) {
  const [price, setPrice] = useState("5.00");
  const priceError = priceValidationMessage(price);
  function submit(event: FormEvent<HTMLFormElement>) { if (priceError) event.preventDefault(); }
  return <Card className="mt-8 p-6 md:p-7">
    <div><p className="sf-label text-[var(--accent)]">Start with the album</p><h2 className="sf-section-title mt-2">Create album</h2><p className="sf-body-secondary mt-2">Create a private draft now, then add existing photos or upload new ones.</p></div>
    <form action={createEmptyAlbum} onSubmit={submit} className="mt-6 grid gap-5 sm:grid-cols-[minmax(0,1fr)_220px_auto] sm:items-end">
      <Input id="album-name" name="name" label="Album name" required minLength={2} maxLength={120} />
      <Input id="album-price" name="priceDollars" label="Price per photo (USD)" hint={`Minimum price: $${(MINIMUM_PAID_PHOTO_PRICE_CENTS / 100).toFixed(2)} USD`} error={priceError || undefined} required inputMode="decimal" pattern="^\d+(\.\d{1,2})?$" value={price} onChange={(event) => setPrice(event.target.value)} />
      <Button type="submit" disabled={Boolean(priceError)}>Create album</Button>
    </form>
    {error && <p role="alert" className="mt-4 text-sm font-semibold text-[var(--error)]">{error}</p>}
  </Card>;
}
