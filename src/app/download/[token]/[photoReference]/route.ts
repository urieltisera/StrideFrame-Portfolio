import { NextResponse } from "next/server";
import { authorizeDownload } from "@/lib/downloads";
import { createStorageProvider } from "@/lib/storage-factory";

function safeFilename(name: string) {
  return (name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "") || "photo").slice(0, 180);
}

function signedTtl() {
  const value = Number(process.env.SIGNED_DOWNLOAD_TTL_SECONDS || 300);
  if (!Number.isInteger(value) || value <= 0) throw new Error("SIGNED_DOWNLOAD_TTL_SECONDS must be positive");
  return value;
}

export async function GET(_: Request, { params }: { params: Promise<{ token: string; photoReference: string }> }) {
  const { token, photoReference } = await params;
  try {
    const { photo } = await authorizeDownload(token, photoReference);
    const provider = createStorageProvider();
    if (provider.createSignedOriginalDownload) {
      return NextResponse.redirect(await provider.createSignedOriginalDownload(photo.originalKey, signedTtl()), 307);
    }
    const bytes = await provider.getProtectedOriginal(photo.originalKey);
    return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": photo.mimeType, "Content-Disposition": `attachment; filename="${safeFilename(photo.originalFilename)}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new NextResponse("Download unavailable", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
}
