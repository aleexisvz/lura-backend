-- CreateEnum
CREATE TYPE "VolumeStatus" AS ENUM ('UPLOADING', 'READY');

-- CreateTable
CREATE TABLE "Manga" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "coverPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Manga_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Volume" (
    "id" TEXT NOT NULL,
    "mangaId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT,
    "status" "VolumeStatus" NOT NULL,
    "pagesCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Volume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Page" (
    "id" TEXT NOT NULL,
    "volumeId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Volume" ADD CONSTRAINT "Volume_mangaId_fkey" FOREIGN KEY ("mangaId") REFERENCES "Manga"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "Volume"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
