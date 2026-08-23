import "dotenv/config";
import { prisma } from "../src/infrastructure/database/prisma.js";
import { calculateSessionXp } from "../src/modules/reading/reading-xp.js";

type SessionForBackfill = {
  id: string;
  durationSeconds: number | null;
  xpAwarded: number | null;
  endedAt: Date | null;
  startedAt: Date;
};

async function runBackfill() {
  const sessions = await prisma.readingSession.findMany({
    where: {
      endedAt: {
        not: null,
      },
    },
    select: {
      id: true,
      durationSeconds: true,
      xpAwarded: true,
      endedAt: true,
      startedAt: true,
    },
  });

  let sessionsUpdated = 0;

  for (const session of sessions as SessionForBackfill[]) {
    if (session.xpAwarded !== null) {
      continue;
    }

    const xpAwarded = calculateSessionXp(session.durationSeconds ?? 0, {
      at: session.endedAt ?? session.startedAt,
    });
    await prisma.readingSession.update({
      where: {
        id: session.id,
      },
      data: {
        xpAwarded,
      },
    });
    sessionsUpdated += 1;
  }

  const xpByUser = await prisma.readingSession.groupBy({
    by: ["userId"],
    where: {
      xpAwarded: {
        not: null,
      },
    },
    _sum: {
      xpAwarded: true,
    },
  });

  await prisma.user.updateMany({
    data: {
      readingXpTotal: 0,
    },
  });

  let usersUpdated = 0;
  for (const row of xpByUser) {
    const total = row._sum.xpAwarded ?? 0;
    await prisma.user.update({
      where: {
        id: row.userId,
      },
      data: {
        readingXpTotal: total,
      },
    });
    usersUpdated += 1;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        sessionsScanned: sessions.length,
        sessionsUpdated,
        usersUpdated,
      },
      null,
      2
    )
  );
}

runBackfill()
  .catch((error) => {
    console.error("reading:xp:backfill failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
