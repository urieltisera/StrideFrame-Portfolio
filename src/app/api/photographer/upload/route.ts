import { NextResponse } from "next/server";
import { getCurrentPhotographer } from "@/lib/auth";
import { createDraftEvent } from "@/lib/events";
import { createPhoto, validatePriceCents, validateUploadBatch } from "@/lib/photos";
import { dollarsToCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultAlbum, getOrCreateInternalLibraryEvent, getOwnedUploadAlbum } from "@/lib/upload-workflow";

export const runtime = "nodejs";

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function safeUploadError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/Unsupported image type|Image exceeds|Unsupported|corrupted|dimensions|pixels|photos|upload batch|Event name|Event not found|Album not found|price|unique event URL|draft album/i.test(message)) return message;
  return "Upload could not be completed";
}

export async function POST(request: Request) {
  const photographer = await getCurrentPhotographer();
  if (!photographer) return errorResponse("Unauthorized", 401);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse("The upload request is too large or invalid", 413);
  }

  const files = form.getAll("photos").filter((file): file is File => file instanceof File && file.size > 0);
  try {
    validateUploadBatch(files);
    const priceCents = validatePriceCents(dollarsToCents(String(form.get("priceDollars") || "")));
    const requestedEventId = String(form.get("eventId") || "");
    const event = requestedEventId === "__new__"
      ? await createDraftEvent({ photographerId: photographer.id, title: form.get("eventTitle"), description: form.get("eventDescription") })
      : requestedEventId
        ? await prisma.event.findFirst({ where: { id: requestedEventId, photographerId: photographer.id } }).then((existing) => {
          if (!existing) throw new Error("Event not found or not owned");
          return existing;
        })
        : await getOrCreateInternalLibraryEvent(photographer.id);

    const requestedAlbumId = String(form.get("albumId") || "");
    const album = requestedAlbumId
      ? await getOwnedUploadAlbum({ albumId: requestedAlbumId, eventId: event.id, photographerId: photographer.id })
      : await getOrCreateDefaultAlbum({ eventId: event.id, photographerId: photographer.id, priceCents });
    if (!album) throw new Error("Album not found for this event");
    if (requestedAlbumId && album.status !== "DRAFT") throw new Error("Only a draft album can receive uploads");
    if (requestedAlbumId) await prisma.album.update({ where: { id: album.id }, data: { priceCents } });

    const errors: string[] = [];
    let uploaded = 0;
    for (const file of files) {
      try {
        await createPhoto({ photographerId: photographer.id, albumId: album.id, file });
        uploaded += 1;
      } catch (error) {
        errors.push(`${file.name}: ${safeUploadError(error)}`);
      }
    }
    return NextResponse.json({ eventId: event.id, albumId: album.id, uploaded, errors });
  } catch (error) {
    return errorResponse(safeUploadError(error));
  }
}
