-- CreateEnum
CREATE TYPE "ContentLanguage" AS ENUM ('ES', 'EN');

-- CreateEnum
CREATE TYPE "IngestionStatus" AS ENUM ('COMPLETED', 'HYBRID', 'FAILED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "readingTimeTotalSeconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "readingTimeMangaSeconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "readingTimeBookSeconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "readingSessionsCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Volume" ADD COLUMN     "language" "ContentLanguage" NOT NULL DEFAULT 'ES',
ADD COLUMN     "isFallback" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "MangaIngestionTracker" (
    "id" TEXT NOT NULL,
    "mangaId" TEXT NOT NULL,
    "sourceProvider" TEXT NOT NULL DEFAULT 'MANGADEX',
    "externalMangaId" TEXT NOT NULL,
    "status" "IngestionStatus" NOT NULL DEFAULT 'COMPLETED',
    "pendingSpanishVols" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MangaIngestionTracker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MangaIngestionTracker_mangaId_key" ON "MangaIngestionTracker"("mangaId");

-- AddForeignKey
ALTER TABLE "MangaIngestionTracker" ADD CONSTRAINT "MangaIngestionTracker_mangaId_fkey" FOREIGN KEY ("mangaId") REFERENCES "Manga"("id") ON DELETE CASCADE ON UPDATE CASCADE;
