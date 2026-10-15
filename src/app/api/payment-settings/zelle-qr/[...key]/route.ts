import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createStorageProvider } from "@/lib/storage-factory";

export async function GET(_: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join("/");
  if (!/^zelle\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(key)) return new NextResponse("Not found", { status: 404 });
  const settings = await prisma.photographerPaymentSettings.findFirst({ where: { zelleQrKey: key, zelleEnabled: true }, select: { zelleQrContentType: true } });
  if (!settings) return new NextResponse("Not found", { status: 404 });
  try { const bytes = await createStorageProvider().getAsset(key); return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": settings.zelleQrContentType || "image/png", "Cache-Control": "public, max-age=3600" } }); }
  catch { return new NextResponse("Not found", { status: 404 }); }
}
