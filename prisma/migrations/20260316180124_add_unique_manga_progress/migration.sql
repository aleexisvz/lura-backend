/*
  Warnings:

  - A unique constraint covering the columns `[userId,mangaId]` on the table `MangaProgress` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "MangaProgress_userId_mangaId_key" ON "MangaProgress"("userId", "mangaId");
