import { Prisma, type BookProgress } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";

// Same completion rule as the save path in book-progress.service.ts.
const completedSql = Prisma.sql`(
  "completed" = true
  OR "progressPercent" >= 100
  OR ("currentPage" >= "totalPages" AND "totalPages" > 1 AND "progressPercent" >= 95)
)`;

// Rule used to hide finished books from the continue-reading list. It does not
// require 95% progress, and it stays as it was for the manga progress feed.
const finishedForListSql = Prisma.sql`(
  "completed" = true
  OR "progressPercent" >= 100
  OR ("currentPage" >= "totalPages" AND "totalPages" > 1)
)`;

export type BookProgressWriteData = Omit<BookProgress, "id" | "userId" | "bookId" | "createdAt">;

export class BookProgressRepository {
  findByUserAndBook(userId: string, bookId: string) {
    return prisma.bookProgress.findUnique({
      where: {
        userId_bookId: { userId, bookId },
      },
    });
  }

  upsert(userId: string, bookId: string, data: BookProgressWriteData) {
    return prisma.bookProgress.upsert({
      where: {
        userId_bookId: { userId, bookId },
      },
      create: { userId, bookId, ...data },
      update: data,
    });
  }

  bookExists(bookId: string) {
    return prisma.book.findUnique({
      where: { id: bookId },
      select: { id: true },
    });
  }

  // Books still in progress for the user, most recently updated first.
  findInProgressByUser(userId: string, limit: number) {
    return prisma.$queryRaw<BookProgress[]>`
      SELECT * FROM "BookProgress"
      WHERE "userId" = ${userId}
        AND NOT COALESCE(${finishedForListSql}, false)
      ORDER BY "updatedAt" DESC
      LIMIT ${limit}
    `;
  }

  countCompletedByUser(userId: string) {
    return prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS "count" FROM "BookProgress"
      WHERE "userId" = ${userId}
        AND ${completedSql}
    `.then((rows) => rows[0]?.count ?? 0);
  }

  // Users who have progress on a book, most recently updated first.
  findReadersForBook(bookId: string, limit: number) {
    return prisma.bookProgress.findMany({
      where: { bookId },
      orderBy: { updatedAt: "desc" },
      select: { userId: true, updatedAt: true },
      take: limit,
    });
  }

  // Pages read per book, where a missing currentPage counts as 1 page.
  async sumPagesByUser(userId: string) {
    const [sum, withoutPage] = await Promise.all([
      prisma.bookProgress.aggregate({
        where: { userId },
        _sum: { currentPage: true },
      }),
      prisma.bookProgress.count({
        where: { userId, currentPage: null },
      }),
    ]);

    return (sum._sum.currentPage ?? 0) + withoutPage;
  }
}
