import { prisma } from "../../src/infrastructure/database/prisma.js";

export async function resetTestDatabase() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "Page",
      "Volume",
      "MangaProgress",
      "ReadingSession",
      "Manga",
      "User"
    RESTART IDENTITY CASCADE;
  `);
}

export async function disconnectTestDatabase() {
  await prisma.$disconnect();
}
