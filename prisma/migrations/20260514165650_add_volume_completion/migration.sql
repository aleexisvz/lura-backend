-- CreateTable
CREATE TABLE "VolumeCompletion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "volumeId" TEXT NOT NULL,
    "mangaId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VolumeCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VolumeCompletion_userId_idx" ON "VolumeCompletion"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VolumeCompletion_userId_volumeId_key" ON "VolumeCompletion"("userId", "volumeId");

-- AddForeignKey
ALTER TABLE "VolumeCompletion" ADD CONSTRAINT "VolumeCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolumeCompletion" ADD CONSTRAINT "VolumeCompletion_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "Volume"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
