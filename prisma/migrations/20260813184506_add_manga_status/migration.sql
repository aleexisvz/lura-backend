-- CreateEnum
CREATE TYPE "MangaStatus" AS ENUM ('EN_EMISION', 'FINALIZADO');

-- AlterTable
ALTER TABLE "Manga" ADD COLUMN     "status" "MangaStatus" NOT NULL DEFAULT 'EN_EMISION';
