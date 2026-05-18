-- DropIndex
DROP INDEX "MangaProgress_userId_updatedAt_idx";

-- CreateIndex
CREATE INDEX "MangaProgress_userId_updatedAt_idx" ON "MangaProgress"("userId", "updatedAt");
