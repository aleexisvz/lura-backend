/*
  Warnings:

  - A unique constraint covering the columns `[volumeId,index]` on the table `Page` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Page_volumeId_index_key" ON "Page"("volumeId", "index");
