-- DropForeignKey
ALTER TABLE "Page" DROP CONSTRAINT "Page_volumeId_fkey";

-- DropForeignKey
ALTER TABLE "Volume" DROP CONSTRAINT "Volume_mangaId_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "Volume_mangaId_number_key" ON "Volume"("mangaId", "number");

-- AddForeignKey
ALTER TABLE "Volume" ADD CONSTRAINT "Volume_mangaId_fkey" FOREIGN KEY ("mangaId") REFERENCES "Manga"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "Volume"("id") ON DELETE CASCADE ON UPDATE CASCADE;

