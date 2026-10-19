export const PHOTOGRAPHER_UPLOAD_ENDPOINT = "/api/photographer/upload";

export function priceDollarsFromCents(priceCents: number) {
  if (!Number.isSafeInteger(priceCents) || priceCents < 0) throw new Error("Invalid album price");
  return (priceCents / 100).toFixed(2);
}
