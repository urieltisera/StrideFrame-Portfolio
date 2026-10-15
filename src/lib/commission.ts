export const STRIDEFRAME_MVP_FEE_PER_PHOTO_USD = 0.25;
export const MVP_PLATFORM_FEE_PER_PHOTO_CENTS = 25;

/** The approved MVP fee is independent of the photographer's sale price. */
export function platformFeePerPhotoCents() {
  return MVP_PLATFORM_FEE_PER_PHOTO_CENTS;
}

export function calculatePlatformFeeCents(billablePhotoCount: number, feePerPhotoCents = platformFeePerPhotoCents()) {
  if (!Number.isSafeInteger(billablePhotoCount) || billablePhotoCount < 0) throw new Error("Billable photo count must be a non-negative integer");
  if (!Number.isSafeInteger(feePerPhotoCents) || feePerPhotoCents < 0) throw new Error("Platform fee per photo must be a non-negative integer");
  return billablePhotoCount * feePerPhotoCents;
}

export function calculateProceedsCents(grossCents: number, feeCents: number) {
  if (!Number.isSafeInteger(grossCents) || !Number.isSafeInteger(feeCents) || grossCents < 0 || feeCents < 0 || feeCents > grossCents) throw new Error("Invalid proceeds calculation");
  return grossCents - feeCents;
}
