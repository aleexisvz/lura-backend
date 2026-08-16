import { prisma } from "../../src/infrastructure/database/prisma.js";

export async function resetTestDatabase() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("FATAL: Cannot reset test database outside of 'test' environment.");
  }

  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    throw new Error("FATAL: DATABASE_URL is not defined.");
  }
  
  const parsed = new URL(rawUrl);
  if (!parsed.pathname.endsWith("_test")) {
    throw new Error(`FATAL: DATABASE_URL (${rawUrl}) does not seem to point to a test database. Aborting TRUNCATE.`);
  }

  const result = await prisma.$queryRawUnsafe<{ current_database: string }[]>('SELECT current_database()');
  const currentDb = result[0]?.current_database;
  
  if (!currentDb || !currentDb.endsWith("_test")) {
    throw new Error(`FATAL: Prisma is connected to database '${currentDb}', which does not end with '_test'. Aborting TRUNCATE to prevent data loss.`);
  }

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
