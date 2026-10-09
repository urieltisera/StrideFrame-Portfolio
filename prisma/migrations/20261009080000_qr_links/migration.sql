CREATE TYPE "public"."QRLinkStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TABLE "public"."QRLink" ("id" TEXT NOT NULL, "code" TEXT NOT NULL, "photographerId" TEXT NOT NULL, "eventId" TEXT, "albumId" TEXT, "status" "public"."QRLinkStatus" NOT NULL DEFAULT 'ACTIVE', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "QRLink_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "QRLink_code_key" ON "public"."QRLink"("code");
CREATE INDEX "QRLink_photographerId_status_idx" ON "public"."QRLink"("photographerId", "status");
CREATE INDEX "QRLink_eventId_status_idx" ON "public"."QRLink"("eventId", "status");
CREATE INDEX "QRLink_albumId_status_idx" ON "public"."QRLink"("albumId", "status");
ALTER TABLE "public"."QRLink" ADD CONSTRAINT "QRLink_photographerId_fkey" FOREIGN KEY ("photographerId") REFERENCES "public"."Photographer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."QRLink" ADD CONSTRAINT "QRLink_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."QRLink" ADD CONSTRAINT "QRLink_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "public"."Album"("id") ON DELETE CASCADE ON UPDATE CASCADE;
