import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { createStorageProvider } from "../../../../lib/storage-factory";
export async function GET(_request:Request,{params}:{params:Promise<{key:string[]}>}) {
  const {key}=await params;
  const relative=key.join("/");
  if (!/^[a-zA-Z0-9._/-]+$/.test(relative) || relative.includes("..")) return new NextResponse("Not found",{status:404});
  const photo=await prisma.photo.findFirst({where:{previewKey:relative,status:"PUBLISHED",album:{status:"PUBLISHED",event:{status:"PUBLISHED"}}},select:{id:true}});
  if (!photo) return new NextResponse("Not found",{status:404});
  try {
    const providerName=(process.env.STORAGE_PROVIDER || "local").toLowerCase();
    const provider=createStorageProvider();
    if (providerName === "s3") return NextResponse.redirect(provider.getPublicPreviewUrl(relative),307);
    const bytes=await fs.readFile(path.join(path.resolve(process.env.STORAGE_LOCAL_DIR || path.join(process.cwd(),"storage")),"previews",relative));
    return new NextResponse(bytes,{headers:{"Content-Type":"image/webp","Cache-Control":"public, max-age=3600"}});
  } catch {
    return new NextResponse("Not found",{status:404});
  }
}
