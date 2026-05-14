-- AlterTable
ALTER TABLE "MangaProgress" ADD COLUMN     "historicalPagesRead" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "VolumeCompletion" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "timesCompleted" INTEGER NOT NULL DEFAULT 1;
