import { prisma } from "../../src/infrastructure/database/prisma.js";

export async function resetTestDatabase() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "Page",
      "MangaTag",
      "BookTag",
      "Tag",
      "Volume",
      "Book",
      "MangaProgress",
      "VolumeCompletion",
      "ReadingSession",
      "Manga",
      "User"
    RESTART IDENTITY CASCADE;
  `);
}

export async function disconnectTestDatabase() {
  await prisma.$disconnect();
}
