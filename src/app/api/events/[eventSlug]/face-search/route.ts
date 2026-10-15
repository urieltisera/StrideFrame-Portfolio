import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  FACE_SEARCH_UNAVAILABLE_MESSAGE,
  getFaceSearchAvailability,
  requireFaceProvider,
} from "@/lib/face-provider";
import { customerFaceSearchError, hasFaceSearchConsent, searchEventFaces, validateSelfie } from "@/lib/face-search";
import {
  consumeFaceSearchRateLimit,
  FACE_SEARCH_RATE_LIMITED_MESSAGE,
  FACE_SEARCH_TEMPORARY_MESSAGE,
  tryAcquireFaceSearchInference,
  withFaceSearchTimeout,
} from "@/lib/face-security";
import { resolveEffectivePhotoPrice } from "@/lib/pricing";

export async function GET() {
  const availability = getFaceSearchAvailability();
  return NextResponse.json(availability.available ? { available: true } : { available: false, error: FACE_SEARCH_UNAVAILABLE_MESSAGE, code: "FACE_SEARCH_UNAVAILABLE" });
}

export async function POST(request: Request, { params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  const rateLimit = consumeFaceSearchRateLimit(request, eventSlug);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: FACE_SEARCH_RATE_LIMITED_MESSAGE, code: "FACE_SEARCH_RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Please upload a valid image or browse the gallery.", code: "FACE_SEARCH_INPUT_INVALID" }, { status: 400 });
  }
  if (!hasFaceSearchConsent(form)) {
    return NextResponse.json({ error: "Please acknowledge the Face Search privacy notice before continuing.", code: "FACE_SEARCH_CONSENT_REQUIRED" }, { status: 400 });
  }
  const availability = getFaceSearchAvailability();
  if (!availability.available) {
    return NextResponse.json({ error: FACE_SEARCH_UNAVAILABLE_MESSAGE, code: "FACE_SEARCH_UNAVAILABLE" }, { status: 503 });
  }
  const releaseInference = tryAcquireFaceSearchInference();
  if (!releaseInference) {
    return NextResponse.json(
      { error: FACE_SEARCH_TEMPORARY_MESSAGE, code: "FACE_SEARCH_BUSY" },
      { status: 503, headers: { "Retry-After": "1" } },
    );
  }
  let providerWork: Promise<Array<{ id: string; photoId: string; distance: number }>> | undefined;
  try {
    const event = await prisma.event.findFirst({ where: { slug: eventSlug, status: "PUBLISHED" }, select: { id: true } });
    if (!event) return new NextResponse("Not found", { status: 404 });
    const file = form.get("selfie");
    if (!(file instanceof File)) return NextResponse.json({ error: "Please upload a selfie" }, { status: 400 });
    providerWork = (async () => {
      const provider = requireFaceProvider();
      const validated = await validateSelfie(file);
      const embedding = await provider.generateEmbedding(validated.face);
      const matches = await searchEventFaces(event.id, embedding);
      return matches;
    })();
    const result = await withFaceSearchTimeout(providerWork);
    const matches = result;
    const best = new Map<string, number>();
    for (const match of matches) best.set(match.photoId, Math.max(best.get(match.photoId) || 0, Number(match.distance)));
    const photos = await prisma.photo.findMany({
      where: { id: { in: [...best.keys()] }, status: "PUBLISHED", album: { status: "PUBLISHED", event: { id: event.id, status: "PUBLISHED" } } },
      select: { id: true, previewKey: true, originalFilename: true, priceOverrideCents: true, currency: true, album: { select: { title: true, priceCents: true } } },
    });
    return NextResponse.json({ results: photos.map((photo) => { const price = resolveEffectivePhotoPrice(photo); return { id: photo.id, previewUrl: `/api/previews/${photo.previewKey}`, originalFilename: photo.originalFilename, album: photo.album, priceCents: price.priceCents, score: best.get(photo.id) }; }) });
  } catch (error) {
    if (error instanceof Error && error.name === "FaceSearchUnavailableError") return NextResponse.json({ error: FACE_SEARCH_UNAVAILABLE_MESSAGE, code: "FACE_SEARCH_UNAVAILABLE" }, { status: 503 });
    if (error instanceof Error && error.message === "Face search processing timed out") return NextResponse.json({ error: FACE_SEARCH_TEMPORARY_MESSAGE, code: "FACE_SEARCH_TEMPORARY_FAILURE" }, { status: 503, headers: { "Retry-After": "1" } });
    return NextResponse.json({ error: customerFaceSearchError(error), code: "FACE_SEARCH_INPUT_INVALID" }, { status: 400 });
  } finally {
    if (providerWork) {
      void providerWork.then(releaseInference, releaseInference);
    } else {
      releaseInference();
    }
  }
}
