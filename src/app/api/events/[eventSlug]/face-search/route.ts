import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  FACE_SEARCH_UNAVAILABLE_MESSAGE,
  getFaceSearchAvailability,
  requireFaceProvider,
} from "@/lib/face-provider";
import { searchEventFaces, validateSelfie } from "@/lib/face-search";

export async function GET() {
  const availability = getFaceSearchAvailability();
  return NextResponse.json(availability.available ? { available: true } : { available: false, error: FACE_SEARCH_UNAVAILABLE_MESSAGE, code: "FACE_SEARCH_UNAVAILABLE" });
}

export async function POST(request: Request, { params }: { params: Promise<{ eventSlug: string }> }) {
  const availability = getFaceSearchAvailability();
  if (!availability.available) {
    return NextResponse.json({ error: FACE_SEARCH_UNAVAILABLE_MESSAGE, code: "FACE_SEARCH_UNAVAILABLE" }, { status: 503 });
  }
  try {
    const { eventSlug } = await params;
    const event = await prisma.event.findFirst({ where: { slug: eventSlug, status: "PUBLISHED" }, select: { id: true } });
    if (!event) return new NextResponse("Not found", { status: 404 });
    const form = await request.formData();
    const file = form.get("selfie");
    if (!(file instanceof File)) return NextResponse.json({ error: "Please upload a selfie" }, { status: 400 });
    const provider = requireFaceProvider();
    const validated = await validateSelfie(file);
    const embedding = await provider.generateEmbedding(validated.face);
    const matches = await searchEventFaces(event.id, embedding);
    const best = new Map<string, number>();
    for (const match of matches) best.set(match.photoId, Math.max(best.get(match.photoId) || 0, Number(match.distance)));
    const photos = await prisma.photo.findMany({
      where: { id: { in: [...best.keys()] }, status: "PUBLISHED", album: { status: "PUBLISHED", event: { id: event.id, status: "PUBLISHED" } } },
      select: { id: true, previewKey: true, originalFilename: true, priceCents: true, album: { select: { title: true } } },
    });
    return NextResponse.json({ results: photos.map((photo) => ({ ...photo, previewUrl: `/api/previews/${photo.previewKey}`, score: best.get(photo.id) })) });
  } catch (error) {
    if (error instanceof Error && error.name === "FaceSearchUnavailableError") return NextResponse.json({ error: FACE_SEARCH_UNAVAILABLE_MESSAGE, code: "FACE_SEARCH_UNAVAILABLE" }, { status: 503 });
    return NextResponse.json({ error: error instanceof Error && error.message.startsWith("Unsupported selfie") ? error.message : "Face search could not be completed." }, { status: 400 });
  }
}
