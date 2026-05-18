/*
  - Replace unique progress per manga with unique progress per volume.
  - Add relational foreign keys and an ordering index for continue-reading queries.
*/

-- DropIndex
DROP INDEX IF EXISTS "MangaProgress_userId_mangaId_key";

-- CreateIndex
CREATE UNIQUE INDEX "MangaProgress_userId_mangaId_volumeId_key"
ON "MangaProgress"("userId", "mangaId", "volumeId");

-- CreateIndex
CREATE INDEX "MangaProgress_userId_updatedAt_idx"
ON "MangaProgress"("userId", "updatedAt" DESC);

-- AddForeignKey
ALTER TABLE "MangaProgress"
ADD CONSTRAINT "MangaProgress_mangaId_fkey"
FOREIGN KEY ("mangaId") REFERENCES "Manga"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MangaProgress"
ADD CONSTRAINT "MangaProgress_volumeId_fkey"
FOREIGN KEY ("volumeId") REFERENCES "Volume"("id") ON DELETE RESTRICT ON UPDATE CASCADE;