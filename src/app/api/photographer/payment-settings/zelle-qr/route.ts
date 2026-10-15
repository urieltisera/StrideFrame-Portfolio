import { NextResponse } from "next/server";
import { getCurrentPhotographer } from "@/lib/auth";
import { removeZelleQr, uploadZelleQr } from "@/lib/payment-settings";

export async function POST(request: Request) {
  const photographer = await getCurrentPhotographer();
  if (!photographer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await request.formData();
  const file = form.get("qr");
  if (!(file instanceof File)) return NextResponse.json({ error: "QR image is required" }, { status: 400 });
  try { const key = await uploadZelleQr(photographer.id, file); return NextResponse.json({ key, url: `/api/payment-settings/zelle-qr/${key}` }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "QR upload failed" }, { status: 400 }); }
}

export async function DELETE() {
  const photographer = await getCurrentPhotographer();
  if (!photographer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await removeZelleQr(photographer.id);
  return NextResponse.json({ removed: true });
}
