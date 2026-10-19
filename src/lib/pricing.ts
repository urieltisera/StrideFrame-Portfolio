export const STRIDEFRAME_MVP_CURRENCY = "USD";
export const MINIMUM_PAID_PHOTO_PRICE_CENTS = 100;
export const MAXIMUM_PAID_PHOTO_PRICE_CENTS = 10_000_000;

export function priceValidationMessage(value: string) {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return "Enter a valid USD amount with at most 2 decimals.";
  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents < MINIMUM_PAID_PHOTO_PRICE_CENTS) return `Price must be at least $${(MINIMUM_PAID_PHOTO_PRICE_CENTS / 100).toFixed(2)} per photo.`;
  if (cents > MAXIMUM_PAID_PHOTO_PRICE_CENTS) return `Price must be no more than $${(MAXIMUM_PAID_PHOTO_PRICE_CENTS / 100).toFixed(2)} per photo.`;
  return "";
}

export type EffectivePhotoPrice = {
  priceCents: number;
  currency: typeof STRIDEFRAME_MVP_CURRENCY;
  pricingSource: "ALBUM_DEFAULT" | "PHOTO_OVERRIDE";
};

export function validateRetailPriceCents(value: number) {
  if (!Number.isSafeInteger(value) || value < MINIMUM_PAID_PHOTO_PRICE_CENTS || value > MAXIMUM_PAID_PHOTO_PRICE_CENTS) {
    throw new Error(`Photo price must be between ${MINIMUM_PAID_PHOTO_PRICE_CENTS} and ${MAXIMUM_PAID_PHOTO_PRICE_CENTS} cents`);
  }
  return value;
}

export function resolveEffectivePhotoPrice(photo: {
  priceOverrideCents: number | null;
  currency?: string | null;
  album: { priceCents: number };
}): EffectivePhotoPrice {
  if ((photo.currency || STRIDEFRAME_MVP_CURRENCY) !== STRIDEFRAME_MVP_CURRENCY) throw new Error("Only USD pricing is supported");
  const priceCents = photo.priceOverrideCents ?? photo.album.priceCents;
  validateRetailPriceCents(priceCents);
  return {
    priceCents,
    currency: STRIDEFRAME_MVP_CURRENCY,
    pricingSource: photo.priceOverrideCents === null ? "ALBUM_DEFAULT" : "PHOTO_OVERRIDE",
  };
}
