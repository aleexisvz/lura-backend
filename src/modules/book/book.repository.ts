import { prisma } from "../../infrastructure/database/prisma.js";
import type { CreateBookDTO, UpdateBookDTO } from "./book.types.js";

const bookWithTagsInclude = {
  bookTags: {
    include: {
      Tag: true,
    },
  },
} as const;

export class BookRepository {
  findAllBooks(tagIds: string[] = []) {
    return prisma.book.findMany({
      ...(tagIds.length > 0
        ? {
            where: {
              bookTags: {
                some: {
                  tagId: { in: tagIds },
                },
              },
            },
          }
        : {}),
      include: bookWithTagsInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  findBookById(id: string) {
    return prisma.book.findUnique({
      where: { id },
      include: bookWithTagsInclude,
    });
  }

  createBook(data: CreateBookDTO) {
    return prisma.book.create({
      data: {
        title: data.title,
        ...(data.author !== undefined ? { author: data.author } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.tagIds !== undefined
          ? {
              bookTags: {
                createMany: {
                  data: data.tagIds.map((tagId) => ({ tagId })),
                  skipDuplicates: true,
                },
              },
            }
          : {}),
      },
      include: bookWithTagsInclude,
    });
  }

  updateBook(bookId: string, data: UpdateBookDTO) {
    return prisma.book.update({
      where: { id: bookId },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.author !== undefined ? { author: data.author } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.tagIds !== undefined
          ? {
              bookTags: {
                deleteMany: {},
                createMany: {
                  data: data.tagIds.map((tagId) => ({ tagId })),
                  skipDuplicates: true,
                },
              },
            }
          : {}),
      },
      include: bookWithTagsInclude,
    });
  }

  updateBookEpubPath(bookId: string, epubPath: string) {
    return prisma.book.update({
      where: { id: bookId },
      data: { epubPath },
    });
  }

  updateBookCoverPath(bookId: string, coverPath: string) {
    return prisma.book.update({
      where: { id: bookId },
      data: { coverPath },
    });
  }

  async findTopRankings(limit = 10) {
    const sessions = await prisma.readingSession.groupBy({
      by: ["contentId"],
      where: { contentType: "BOOK" },
      _count: { id: true },
      orderBy: {
        _count: {
          id: "desc",
        },
      },
      take: limit,
    });

    const rankedIds = sessions.map((s) => s.contentId);
    const sessionCountMap = new Map(sessions.map((s) => [s.contentId, s._count.id]));

    const books = await prisma.book.findMany({
      where: {
        id: { in: rankedIds },
      },
      include: bookWithTagsInclude,
    });

    const rankedList = books
      .map((book) => ({
        book,
        readersCount: sessionCountMap.get(book.id) ?? 0,
      }))
      .sort((a, b) => b.readersCount - a.readersCount);

    if (rankedList.length < limit) {
      const existingIds = new Set(rankedList.map((r) => r.book.id));
      const fallbackBooks = await prisma.book.findMany({
        where: {
          id: { notIn: Array.from(existingIds) },
        },
        include: bookWithTagsInclude,
        orderBy: {
          createdAt: "desc",
        },
        take: limit - rankedList.length,
      });

      for (const book of fallbackBooks) {
        rankedList.push({
          book,
          readersCount: 0,
        });
      }
    }

    return rankedList.slice(0, limit);
  }
}
