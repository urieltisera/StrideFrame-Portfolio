import QRCode from "qrcode";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { qrUrl } from "@/lib/qr";
export async function GET(request:Request,{params}:{params:Promise<{code:string}>}){const {code}=await params;const link=await prisma.qRLink.findUnique({where:{code},select:{code:true}});if(!link)return new NextResponse("Not found",{status:404});const svg=new URL(request.url).searchParams.get("format")==="svg";if(svg)return new NextResponse(await QRCode.toString(qrUrl(code),{type:"svg",errorCorrectionLevel:"H",margin:2}),{headers:{"Content-Type":"image/svg+xml"}});const png=await QRCode.toBuffer(qrUrl(code),{errorCorrectionLevel:"H",margin:2,width:1200});return new NextResponse(new Uint8Array(png),{headers:{"Content-Type":"image/png","Content-Disposition":`attachment; filename="strideframe-${code}.png"`}})}
