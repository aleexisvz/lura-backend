import { prisma } from "../src/infrastructure/database/prisma.js";

async function main() {
  console.log("Starting backfill of reading stats...");

  const users = await prisma.user.findMany({ select: { id: true } });
  console.log(`Found ${users.length} users to process.`);

  for (const user of users) {
    const sessions = await prisma.readingSession.findMany({
      where: {
        userId: user.id,
        endedAt: { not: null },
        durationSeconds: { not: null },
      },
    });

    let totalSeconds = 0;
    let mangaSeconds = 0;
    let bookSeconds = 0;
    const sessionCount = sessions.length;

    for (const session of sessions) {
      const duration = session.durationSeconds ?? 0;
      totalSeconds += duration;
      if (session.contentType === "MANGA") {
        mangaSeconds += duration;
      } else if (session.contentType === "BOOK") {
        bookSeconds += duration;
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        readingTimeTotalSeconds: totalSeconds,
        readingTimeMangaSeconds: mangaSeconds,
        readingTimeBookSeconds: bookSeconds,
        readingSessionsCount: sessionCount,
      },
    });

    console.log(`Updated user ${user.id}: ${totalSeconds} total seconds, ${sessionCount} sessions.`);
  }

  console.log("Backfill completed successfully.");
}

main()
  .catch((e) => {
    console.error("Backfill failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
