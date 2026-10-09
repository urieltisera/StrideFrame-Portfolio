import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPhoto, deletePhoto } from "../../src/lib/photos";
import { LocalStorageProvider } from "../../src/lib/storage";
import { createPendingOrder } from "../../src/lib/orders";
import { createDownloadGrant, authorizeDownload, revokeOrderDownloads, downloadTokenHash } from "../../src/lib/downloads";

const db = new PrismaClient();
const hasDatabase = Boolean(process.env.TEST_DATABASE_URL);
const suite = hasDatabase ? describe : describe.skip;

suite("PostgreSQL critical flows", () => {
  beforeAll(async () => { await db.$connect(); });
  beforeEach(async () => { await db.downloadGrant.deleteMany(); await db.orderItem.deleteMany(); await db.payment.deleteMany(); await db.order.deleteMany(); await db.photo.deleteMany(); await db.album.deleteMany(); await db.event.deleteMany(); await db.photographer.deleteMany(); });
  afterAll(async () => { await db.$disconnect(); });

  it("persists registration, rejects duplicate email, and verifies login", async () => {
    const hash = await bcrypt.hash("password-123", 4);
    const photographer = await db.photographer.create({data:{email:"one@example.com",name:"One",passwordHash:hash}});
    expect(await bcrypt.compare("password-123", photographer.passwordHash)).toBe(true);
    await expect(db.photographer.create({data:{email:"one@example.com",name:"Duplicate",passwordHash:hash}})).rejects.toThrow();
    expect(await bcrypt.compare("wrong", photographer.passwordHash)).toBe(false);
  });
  it("enforces event and album ownership and public publication filters", async () => {
    const [a,b] = await Promise.all([db.photographer.create({data:{email:"a@example.com",name:"A",passwordHash:"x"}}),db.photographer.create({data:{email:"b@example.com",name:"B",passwordHash:"x"}})]);
    const event = await db.event.create({data:{photographerId:a.id,title:"Race",slug:"race",accessCode:"racecode",status:"PUBLISHED"}});
    const album = await db.album.create({data:{photographerId:a.id,eventId:event.id,title:"Finish",slug:"finish",status:"PUBLISHED"}});
    expect(await db.event.findFirst({where:{id:event.id,photographerId:b.id}})).toBeNull();
    expect(await db.event.updateMany({where:{id:event.id,photographerId:b.id},data:{title:"Hacked"}})).toMatchObject({count:0});
    expect(await db.event.updateMany({where:{id:event.id,photographerId:b.id},data:{status:"DRAFT"}})).toMatchObject({count:0});
    expect(await db.event.updateMany({where:{id:event.id,photographerId:a.id},data:{status:"DRAFT"}})).toMatchObject({count:1});
    expect(await db.event.findFirst({where:{slug:"race",status:"PUBLISHED"}})).toBeNull();
    expect(await db.event.updateMany({where:{id:event.id,photographerId:a.id},data:{status:"PUBLISHED"}})).toMatchObject({count:1});
    expect(await db.album.deleteMany({where:{id:album.id,photographerId:b.id}})).toMatchObject({count:0});
    expect(await db.event.findFirst({where:{slug:"race",status:"PUBLISHED"},include:{albums:{where:{status:"PUBLISHED"}}}})).toMatchObject({title:"Race",albums:[{title:"Finish"}]});
    await db.album.update({where:{id:album.id},data:{status:"DRAFT"}});
    expect((await db.event.findFirst({where:{slug:"race",status:"PUBLISHED"},include:{albums:{where:{status:"PUBLISHED"}}}}))?.albums).toHaveLength(0);
  });
  it("runs the owner-only photo pipeline and keeps originals outside public storage", async () => {
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),"sportpix-integration-")); const provider=new LocalStorageProvider(directory);
    const [owner,other]=await Promise.all([db.photographer.create({data:{email:"photo-owner@example.com",name:"Owner",passwordHash:"x"}}),db.photographer.create({data:{email:"photo-other@example.com",name:"Other",passwordHash:"x"}})]);
    const event=await db.event.create({data:{photographerId:owner.id,title:"Photo Event",slug:"photo-event",accessCode:"photo-code",status:"PUBLISHED"}}); const album=await db.album.create({data:{photographerId:owner.id,eventId:event.id,title:"Album",slug:"album",status:"PUBLISHED"}});
    const bytes=await sharp({create:{width:64,height:64,channels:3,background:"#229977"}}).jpeg().toBuffer(); const file=new File([bytes],"photo.jpg",{type:"image/jpeg"});
    const photo=await createPhoto({photographerId:owner.id,albumId:album.id,file,priceCents:1250,provider}); expect(photo.priceCents).toBe(1250); expect(photo.currency).toBe("USD"); await expect(createPhoto({photographerId:other.id,albumId:album.id,file,priceCents:1250,provider})).rejects.toThrow("not owned"); await expect(createPhoto({photographerId:owner.id,albumId:album.id,file:new File(["bad"],"bad.txt",{type:"text/plain"}),priceCents:1250,provider})).rejects.toThrow("Unsupported"); await expect(fs.access(path.join(directory,"originals",photo.originalKey))).resolves.toBeUndefined(); await deletePhoto(photo.id,owner.id,provider); await expect(db.photo.findUnique({where:{id:photo.id}})).resolves.toBeNull(); await fs.rm(directory,{recursive:true,force:true});
  });
  it("creates canonical QR links and enforces publication during resolution", async () => {
    const [owner,other]=await Promise.all([db.photographer.create({data:{email:"qr-owner@example.com",name:"Owner",passwordHash:"x"}}),db.photographer.create({data:{email:"qr-other@example.com",name:"Other",passwordHash:"x"}})]);
    const event=await db.event.create({data:{photographerId:owner.id,title:"QR Event",slug:"qr-event",accessCode:"qr-code",status:"DRAFT"}}); const album=await db.album.create({data:{photographerId:owner.id,eventId:event.id,title:"QR Album",slug:"qr-album",status:"PUBLISHED"}}); const code="opaque-qr-code";
    const link=await db.qRLink.create({data:{code,photographerId:owner.id,eventId:event.id}}); expect(link.code).not.toContain(event.id); expect(await db.qRLink.findFirst({where:{eventId:event.id,photographerId:other.id}})).toBeNull();
    expect(await db.qRLink.findFirst({where:{code,status:"ACTIVE",event:{status:"PUBLISHED"}}})).toBeNull(); await db.event.update({where:{id:event.id},data:{status:"PUBLISHED"}}); expect(await db.qRLink.findFirst({where:{code,status:"ACTIVE",event:{status:"PUBLISHED"}}})).not.toBeNull(); await db.qRLink.update({where:{id:link.id},data:{status:"DISABLED"}}); expect(await db.qRLink.findFirst({where:{code,status:"ACTIVE"}})).toBeNull(); await db.qRLink.update({where:{id:link.id},data:{status:"ACTIVE"}}); expect(await db.qRLink.findFirst({where:{code,status:"ACTIVE",event:{status:"PUBLISHED"}}})).not.toBeNull(); await db.album.update({where:{id:album.id},data:{status:"DRAFT"}}); const albumQr=await db.qRLink.create({data:{code:"album-opaque-code",photographerId:owner.id,albumId:album.id}}); expect(await db.qRLink.findFirst({where:{id:albumQr.id,status:"ACTIVE",album:{status:"PUBLISHED",event:{status:"PUBLISHED"}}}})).toBeNull();
  });
  it("creates a pending order with server-side price snapshots", async () => {
    const owner=await db.photographer.create({data:{email:"order-owner@example.com",name:"Owner",passwordHash:"x"}}); const event=await db.event.create({data:{photographerId:owner.id,title:"Order Event",slug:"order-event",accessCode:"order-code",status:"PUBLISHED"}}); const album=await db.album.create({data:{photographerId:owner.id,eventId:event.id,title:"Order Album",slug:"order-album",status:"PUBLISHED"}}); const photo=await db.photo.create({data:{albumId:album.id,originalKey:"private/a",previewKey:"public/a",originalFilename:"a.jpg",mimeType:"image/jpeg",fileSize:10,priceCents:1250,currency:"USD",status:"PUBLISHED"}});
    const order=await createPendingOrder({photoIds:[photo.id],email:"buyer@example.com"}); expect(order.status).toBe("PENDING_PAYMENT"); expect(order.totalCents).toBe(1250); expect(order.items[0].unitPriceCents).toBe(1250); await db.photo.update({where:{id:photo.id},data:{priceCents:2500}}); expect((await db.orderItem.findUnique({where:{id:order.items[0].id}}))?.unitPriceCents).toBe(1250); await expect(createPendingOrder({photoIds:[photo.id],email:"bad"})).rejects.toThrow();
  });
  it("creates hashed paid-order grants and authorizes only purchased photos", async () => {
    const owner=await db.photographer.create({data:{email:"delivery-owner@example.com",name:"Owner",passwordHash:"x"}}); const event=await db.event.create({data:{photographerId:owner.id,title:"Delivery Event",slug:"delivery-event",accessCode:"delivery-code",status:"PUBLISHED"}}); const album=await db.album.create({data:{photographerId:owner.id,eventId:event.id,title:"Delivery Album",slug:"delivery-album",status:"PUBLISHED"}}); const photo=await db.photo.create({data:{albumId:album.id,originalKey:"private/delivery",previewKey:"public/delivery",originalFilename:"delivery.jpg",mimeType:"image/jpeg",fileSize:10,priceCents:1250,currency:"USD",status:"PUBLISHED"}}); const order=await createPendingOrder({photoIds:[photo.id],email:"delivery@example.com"}); await expect(createDownloadGrant(order.id)).rejects.toThrow(); await db.order.update({where:{id:order.id},data:{status:"PAID"}}); const grant=await createDownloadGrant(order.id); expect(grant?.token).toBeTruthy(); const stored=await db.downloadGrant.findFirst({where:{orderId:order.id}}); expect(stored?.tokenHash).toBe(downloadTokenHash(grant!.token));
    await expect(authorizeDownload(grant!.token,photo.id)).resolves.toMatchObject({photo:{id:photo.id}}); await revokeOrderDownloads(order.id); await expect(authorizeDownload(grant!.token,photo.id)).rejects.toThrow(); await db.order.update({where:{id:order.id},data:{status:"REFUNDED"}}); await expect(authorizeDownload(grant!.token,photo.id)).rejects.toThrow();
  });
});
