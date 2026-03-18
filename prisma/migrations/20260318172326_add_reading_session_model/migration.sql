/*
  Warnings:

  - Added the required column `updatedAt` to the `ReadingSession` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `contentType` on the `ReadingSession` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "ReadingContentType" AS ENUM ('MANGA', 'BOOK');

-- AlterTable
ALTER TABLE "ReadingSession" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "durationSeconds" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "contentType",
ADD COLUMN     "contentType" "ReadingContentType" NOT NULL;

-- CreateIndex
CREATE INDEX "ReadingSession_userId_idx" ON "ReadingSession"("userId");

-- CreateIndex
CREATE INDEX "ReadingSession_userId_contentType_idx" ON "ReadingSession"("userId", "contentType");

-- CreateIndex
CREATE INDEX "ReadingSession_contentId_idx" ON "ReadingSession"("contentId");

-- AddForeignKey
ALTER TABLE "ReadingSession" ADD CONSTRAINT "ReadingSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
