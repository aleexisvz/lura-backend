import { prisma } from "../../infrastructure/database/prisma.js";
import { BookProgressRepository } from "../book/book-progress.repository.js";

export type ReaderUser = {
  id: string;
  username: string;
  profileImagePath: string | null;
  readingXpTotal: number;
};

export type ReaderEntry = {
  userId: string;
  lastReadAt: Date;
  user: ReaderUser;
};

const readerUserSelect = {
  id: true,
  username: true,
  profileImagePath: true,
  readingXpTotal: true,
} as const;

const bookProgressRepo = new BookProgressRepository();

// Read-only queries behind the "who is reading this" lists. Combining them is
// the service's job, see reading-session.service.ts.
export class ReadingReadersRepository {
  // Users with a reading session on the content, most recent start first.
  async findSessionReaders(contentType: "MANGA" | "BOOK", contentId: string): Promise<ReaderEntry[]> {
    const sessions = await prisma.readingSession.findMany({
      where: { contentType, contentId },
      orderBy: { startedAt: "desc" },
      select: {
        userId: true,
        startedAt: true,
        User: { select: readerUserSelect },
      },
      take: 40,
    });

    return sessions.flatMap((session) =>
      session.User
        ? [{ userId: session.userId, lastReadAt: session.startedAt, user: session.User }]
        : []
    );
  }

  // Users with manga progress, most recently updated first.
  async findMangaProgressReaders(mangaId: string): Promise<ReaderEntry[]> {
    const progress = await prisma.mangaProgress.findMany({
      where: { mangaId },
      orderBy: { updatedAt: "desc" },
      select: {
        userId: true,
        updatedAt: true,
        User: { select: readerUserSelect },
      },
      take: 40,
    });

    return progress.map((entry) => ({
      userId: entry.userId,
      lastReadAt: entry.updatedAt,
      user: entry.User,
    }));
  }

  // Users with book progress, most recently updated first. Progress rows whose
  // user cannot be loaded are skipped.
  async findBookProgressReaders(bookId: string): Promise<ReaderEntry[]> {
    const records = await bookProgressRepo.findReadersForBook(bookId, 40);
    if (records.length === 0) {
      return [];
    }

    const users = await prisma.user.findMany({
      where: { id: { in: records.map((record) => record.userId) } },
      select: readerUserSelect,
    });
    const userById = new Map(users.map((user) => [user.id, user]));

    return records.flatMap((record) => {
      const user = userById.get(record.userId);
      return user ? [{ userId: record.userId, lastReadAt: new Date(record.updatedAt), user }] : [];
    });
  }
}
