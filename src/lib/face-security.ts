import crypto from "node:crypto";
import {
  FACE_SEARCH_CONCURRENCY_MAX,
  FACE_SEARCH_RATE_LIMIT_MAX,
  FACE_SEARCH_RATE_LIMIT_SALT,
  FACE_SEARCH_RATE_LIMIT_WINDOW_MS,
  FACE_SEARCH_TIMEOUT_MS,
  FACE_SEARCH_TRUST_PROXY,
} from "./face-config";

export const FACE_SEARCH_RATE_LIMITED_MESSAGE = "Too many Face Search requests. Please try again later.";
export const FACE_SEARCH_TEMPORARY_MESSAGE = "Face Search is temporarily unavailable. Please try again or browse the gallery.";

type RateLimitEntry = { count: number; resetAt: number };
const rateLimitEntries = new Map<string, RateLimitEntry>();
let activeInferenceCount = 0;

function requestNetworkIdentity(request: Request) {
  if (!FACE_SEARCH_TRUST_PROXY) return "unknown-client-network";
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown-client-network";
}

function limiterKey(request: Request, eventSlug: string) {
  return crypto.createHash("sha256").update(`${FACE_SEARCH_RATE_LIMIT_SALT}:face-search:${requestNetworkIdentity(request)}:${eventSlug}`).digest("hex");
}

export function consumeFaceSearchRateLimit(request: Request, eventSlug: string, now = Date.now()) {
  for (const [key, entry] of rateLimitEntries) {
    if (entry.resetAt <= now) rateLimitEntries.delete(key);
  }
  const key = limiterKey(request, eventSlug);
  const current = rateLimitEntries.get(key);
  if (!current || current.resetAt <= now) {
    rateLimitEntries.set(key, { count: 1, resetAt: now + FACE_SEARCH_RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: FACE_SEARCH_RATE_LIMIT_MAX - 1, retryAfterSeconds: 0 };
  }
  if (current.count >= FACE_SEARCH_RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  current.count += 1;
  return { allowed: true, remaining: FACE_SEARCH_RATE_LIMIT_MAX - current.count, retryAfterSeconds: 0 };
}

export function tryAcquireFaceSearchInference() {
  if (activeInferenceCount >= FACE_SEARCH_CONCURRENCY_MAX) return null;
  activeInferenceCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeInferenceCount = Math.max(0, activeInferenceCount - 1);
  };
}

export async function withFaceSearchTimeout<T>(operation: Promise<T>, timeoutMs = FACE_SEARCH_TIMEOUT_MS) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Face search processing timed out")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function resetFaceSearchSecurityState() {
  rateLimitEntries.clear();
  activeInferenceCount = 0;
}
