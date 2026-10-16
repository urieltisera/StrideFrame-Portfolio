import QRCode from "qrcode";
import { NextResponse } from "next/server";
import { getCurrentPhotographer } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publicProfileUrl } from "@/lib/qr";

export async function GET(request: Request) {
  const person = await getCurrentPhotographer();
  if (!person) return new NextResponse("Unauthorized", { status: 401 });
  const profile = await prisma.photographer.findUnique({ where: { id: person.id }, select: { publicSlug: true, publicProfileEnabled: true } });
  if (!profile?.publicSlug || !profile.publicProfileEnabled) return new NextResponse("Profile unavailable", { status: 404 });
  const url = publicProfileUrl(profile.publicSlug);
  const format = new URL(request.url).searchParams.get("format");
  if (format === "svg") return new NextResponse(await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "H", margin: 2 }), { headers: { "Content-Type": "image/svg+xml", "Content-Disposition": "attachment; filename=\"strideframe-profile.svg\"" } });
  const png = await QRCode.toBuffer(url, { errorCorrectionLevel: "H", margin: 2, width: 1200 });
  return new NextResponse(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Content-Disposition": "attachment; filename=\"strideframe-profile.png\"" } });
}
