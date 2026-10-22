import { NextResponse } from "next/server";
import { getCurrentPhotographer } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { createStorageProvider } from "../../../../../lib/storage-factory";

function validPreviewKey(key: string[]) {
  const relative = key.join("/");
  if (!/^[a-zA-Z0-9._/-]+$/.test(relative) || relative.includes("..")) return null;
  return relative;
}

export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const relative = validPreviewKey((await params).key);
  if (!relative) return new NextResponse("Not found", { status: 404 });

  const photographer = await getCurrentPhotographer();
  if (!photographer) return new NextResponse("Not found", { status: 404 });
  const photo = await prisma.photo.findFirst({ where: { previewKey: relative, album: { photographerId: photographer.id } }, select: { id: true } });
  if (!photo) return new NextResponse("Not found", { status: 404 });

  try {
    const provider = createStorageProvider();
    if (!provider.getProtectedPreview) return new NextResponse("Not found", { status: 404 });
    const bytes = await provider.getProtectedPreview(relative);
    return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store" } });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
