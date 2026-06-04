-- Add XP tracking fields for reading gamification v1
ALTER TABLE "User"
ADD COLUMN "readingXpTotal" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ReadingSession"
ADD COLUMN "xpAwarded" INTEGER;
