const MAX_BPS = 10_000;

export function platformFeeBps() {
  const raw = process.env.STRIDEFRAME_PLATFORM_FEE_BPS;
  if (raw === undefined || raw.trim() === "") throw new Error("STRIDEFRAME_PLATFORM_FEE_BPS is required");
  if (!/^\d+$/.test(raw)) throw new Error("STRIDEFRAME_PLATFORM_FEE_BPS must be an integer between 0 and 10000");
  const bps = Number(raw);
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > MAX_BPS) throw new Error("STRIDEFRAME_PLATFORM_FEE_BPS must be an integer between 0 and 10000");
  return bps;
}

/** Calculates the nearest minor unit, with half-cent values rounded up. */
export function calculatePlatformFeeCents(grossCents: number, bps = platformFeeBps()) {
  if (!Number.isSafeInteger(grossCents) || grossCents < 0) throw new Error("Gross amount must be a non-negative integer");
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > MAX_BPS) throw new Error("Platform fee basis points are invalid");
  const fee = Math.floor((grossCents * bps + MAX_BPS / 2) / MAX_BPS);
  return Math.min(fee, grossCents);
}

export function calculateProceedsCents(grossCents: number, feeCents: number) {
  if (!Number.isSafeInteger(grossCents) || !Number.isSafeInteger(feeCents) || grossCents < 0 || feeCents < 0 || feeCents > grossCents) throw new Error("Invalid proceeds calculation");
  return grossCents - feeCents;
}
