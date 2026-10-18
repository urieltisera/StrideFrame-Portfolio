-- CreateEnum
CREATE TYPE "AppearanceTheme" AS ENUM ('BLACK', 'DARK', 'LIGHT');

-- AlterTable
ALTER TABLE "Photographer" ADD COLUMN "appearanceTheme" "AppearanceTheme" NOT NULL DEFAULT 'BLACK';
